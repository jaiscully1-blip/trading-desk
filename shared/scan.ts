// Scan engine. Pure functions over daily bars, shared by /api/scan and the demo fallback.
import type { Bar } from './types.js';
import { closeSodFor } from './marketCalendar.js';

export interface PatternHit {
  ok: boolean;
  /** breakout level */
  trigger?: number;
  detail?: string;
  /** bar indexes of the key points (for drawing): flag = [pole start, pole top, end]; cup = [left rim, cup low, right rim, handle low] */
  points?: number[];
}

export interface ShortInterest {
  shares: number;
  daysToCover: number;
  changePct: number;
  settlementDate: string;
  /** short shares / shares outstanding (not float), % */
  pctOut: number | null;
}

/** Per-symbol stats from daily bars. Price-dependent fields are finished on the client with the live quote. */
export interface ScanBase {
  sym: string;
  asOf: number; // ms when bars were fetched
  barDay: number; // ET day number of the last bar
  todayDay: number; // ET day number of "today" when computed
  formingIsToday: boolean;
  last: number;
  prevClose: number;
  open: number | null; // today's open if the last bar is today
  todayVol: number | null;
  rvol: number | null; // time-adjusted, as of asOf
  avgVol20: number;
  volTrend: number; // avg vol last 5 completed / last 20 completed
  sma20: number | null;
  sma50: number | null;
  hi20: number | null; // highest high of the prior N completed sessions
  hi50: number | null;
  hi252: number | null;
  atr14: number | null;
  /** closes 5, 20, 60 sessions ago (for live returns) */
  c5: number | null;
  c20: number | null;
  c60: number | null;
  bullFlag: PatternHit;
  cupHandle: PatternHit;
  si?: ShortInterest | null; // null = looked up, none found; undefined = not available
  catalyst?: { count: number; latest?: string; latestAt?: number } | null;
  /** estimated float shares (SEC public float ÷ close on its date); null = looked up, none found */
  float?: { shares: number; asOf: string } | null;
  /** last 30 completed daily closes, 5 significant digits (sparklines) */
  spark?: number[];
  source: string;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const dayOf = (t: number) => Math.floor(t / 86400);

/** Typical cumulative share of a regular session's volume by minutes since 9:30 (approximate U-shaped curve). */
const CURVE: [number, number][] = [[0, 0], [30, 0.17], [60, 0.25], [90, 0.32], [150, 0.44], [210, 0.53], [270, 0.62], [330, 0.74], [360, 0.82], [390, 1]];
export function volumeFraction(minSinceOpen: number): number {
  if (minSinceOpen <= 0) return 0;
  if (minSinceOpen >= 390) return 1;
  for (let i = 1; i < CURVE.length; i++) {
    const [m1, f1] = CURVE[i], [m0, f0] = CURVE[i - 1];
    if (minSinceOpen <= m1) return f0 + ((f1 - f0) * (minSinceOpen - m0)) / (m1 - m0);
  }
  return 1;
}

/**
 * @param nowEnc encoded ET now (seconds), used to tell whether the last bar is today and how much of the session has elapsed
 */
export function computeBase(sym: string, bars: Bar[], nowEnc: number, asOf: number, source: string): ScanBase {
  const todayDay = dayOf(nowEnc);
  const lastBar = bars[bars.length - 1];
  const formingIsToday = !!lastBar && dayOf(lastBar.time) === todayDay;
  const done = formingIsToday ? bars.slice(0, -1) : bars;
  const closes = done.map((b) => b.close);
  const n = done.length;
  const at = (k: number) => (n - k >= 0 ? done[n - k].close : null);
  const maxHigh = (k: number) => (n >= Math.min(k, 5) ? Math.max(...done.slice(-k).map((b) => b.high)) : null);
  const sma = (k: number) => (n >= k ? avg(closes.slice(-k)) : null);

  // ATR(14), Wilder
  let atr: number | null = null;
  if (n > 15) {
    const tr = done.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - done[i - 1].close), Math.abs(b.low - done[i - 1].close))));
    let a = avg(tr.slice(1, 15));
    for (let i = 15; i < n; i++) a = (a * 13 + tr[i]) / 14;
    atr = a;
  }

  const vols = done.map((b) => b.volume);
  const avgVol20 = avg(vols.slice(-20));
  // early-close days compress the volume curve into the shorter session
  const nd = new Date(nowEnc * 1000).toISOString().slice(0, 10);
  const sessionMin = (closeSodFor(nd) - 9.5 * 3600) / 60;
  const minSinceOpen = Math.floor((nowEnc % 86400) / 60) - 570;
  const frac = formingIsToday ? volumeFraction((minSinceOpen * 390) / sessionMin) : 0;
  const todayVol = formingIsToday ? lastBar.volume : null;
  const rvol = todayVol != null && frac > 0.02 && avgVol20 > 0 ? todayVol / (avgVol20 * frac) : null;

  return {
    sym, asOf, source, spark: done.slice(-30).map((b) => +b.close.toPrecision(5)),
    barDay: lastBar ? dayOf(lastBar.time) : 0,
    todayDay,
    formingIsToday,
    last: lastBar?.close ?? NaN,
    // the close before the last bar: yesterday's close when today's bar is forming, else the prior session's
    prevClose: (formingIsToday ? at(1) : at(2)) ?? NaN,
    open: formingIsToday ? lastBar.open : null,
    todayVol,
    rvol,
    avgVol20,
    volTrend: avg(vols.slice(-5)) / avgVol20,
    sma20: sma(20),
    sma50: sma(50),
    hi20: maxHigh(20),
    hi50: maxHigh(50),
    hi252: n >= 60 ? maxHigh(252) : null,
    atr14: atr,
    c5: at(5),
    c20: at(20),
    c60: at(60),
    bullFlag: bullFlag(bars),
    cupHandle: cupHandle(bars),
  };
}

/* ---------------- patterns ---------------- */

export interface FlagOpts { minPole: number; maxPoleBars: number; minFlag: number; maxFlag: number; maxRetrace: number }
const FLAG: FlagOpts = { minPole: 0.15, maxPoleBars: 10, minFlag: 3, maxFlag: 15, maxRetrace: 0.5 };

/** Bull flag: a sharp pole (>= 15% in <= 10 bars), then 3-15 bars that hold above half the pole on lighter volume. */
export function bullFlag(bars: Bar[], o: FlagOpts = FLAG): PatternHit {
  const n = bars.length;
  for (let flagLen = o.minFlag; flagLen <= o.maxFlag; flagLen++) {
    const p = n - 1 - flagLen;
    if (p - o.maxPoleBars < 0) break;
    const peak = bars[p].high;
    const flag = bars.slice(p + 1);
    if (flag.some((b) => b.high > peak)) continue; // peak must hold
    const poleBars = bars.slice(p - o.maxPoleBars, p + 1);
    const poleLow = Math.min(...poleBars.map((b) => b.low));
    const gain = peak / poleLow - 1;
    if (gain < o.minPole) continue;
    const flagLow = Math.min(...flag.map((b) => b.low));
    const retrace = (peak - flagLow) / (peak - poleLow);
    if (retrace > o.maxRetrace) continue;
    if (avg(flag.map((b) => b.volume)) >= avg(poleBars.map((b) => b.volume))) continue;
    const trigger = Math.max(...flag.map((b) => b.high));
    let ps = p - o.maxPoleBars;
    poleBars.forEach((b, i) => { if (b.low === poleLow) ps = p - o.maxPoleBars + i; });
    return { ok: true, trigger, detail: `pole +${(gain * 100).toFixed(0)}%, ${flagLen}-bar flag, ${(retrace * 100).toFixed(0)}% retrace`, points: [ps, p, n - 1] };
  }
  return { ok: false };
}

export interface CupOpts { minCup: number; maxCup: number; minDepth: number; maxDepth: number; rimTol: number; minHandle: number; maxHandle: number; maxHandleDepth: number }
const CUP: CupOpts = { minCup: 20, maxCup: 130, minDepth: 0.12, maxDepth: 0.35, rimTol: 0.06, minHandle: 3, maxHandle: 20, maxHandleDepth: 0.12 };

/** Cup-and-handle: two rims within 6%, a 12-35% rounded cup between, then a shallow handle in the cup's upper half. */
export function cupHandle(bars: Bar[], o: CupOpts = CUP): PatternHit {
  const n = bars.length;
  // right rim = the highest high in the window where a handle could start; the handle is everything after it
  let r = -1;
  for (let i = Math.max(0, n - 1 - o.maxHandle); i <= n - 1 - o.minHandle; i++) if (r < 0 || bars[i].high >= bars[r].high) r = i;
  {
    const h = n - 1 - r;
    if (r < 0 || r - o.minCup < 0) return { ok: false };
    const rim = bars[r].high;
    const handle = bars.slice(r + 1);
    if (handle.some((b) => b.high > rim)) return { ok: false };
    const handleLow = Math.min(...handle.map((b) => b.low));
    const hDepth = 1 - handleLow / rim;
    if (hDepth > o.maxHandleDepth || hDepth < 0.01) return { ok: false };
    for (let c = o.minCup; c <= o.maxCup && r - c >= 0; c++) {
      const l = r - c;
      const left = bars[l].high;
      if (Math.abs(rim / left - 1) > o.rimTol) continue;
      const cup = bars.slice(l + 1, r);
      const top = Math.max(left, rim);
      if (cup.some((b) => b.high > top)) continue;
      let lowIdx = 0;
      cup.forEach((b, i) => { if (b.low < cup[lowIdx].low) lowIdx = i; });
      const cupLow = cup[lowIdx].low;
      const depth = 1 - cupLow / left;
      if (depth < o.minDepth || depth > o.maxDepth) continue;
      const pos = lowIdx / cup.length;
      if (pos < 0.2 || pos > 0.8) continue; // bottom roughly centered (rounded, not a V at one edge)
      if (handleLow < cupLow + (top - cupLow) / 2) continue; // handle in upper half
      let hl = r + 1;
      handle.forEach((b, i) => { if (b.low === handleLow) hl = r + 1 + i; });
      return { ok: true, trigger: rim, detail: `${c}-bar cup, ${(depth * 100).toFixed(0)}% deep, ${h}-bar handle`, points: [l, l + 1 + lowIdx, r, hl] };
    }
  }
  return { ok: false };
}

/* ---------------- live row (client) ---------------- */

export interface LiveQuote { last: number; open: number; prevClose: number; t: number }

export interface ScanRow {
  sym: string;
  last: number;
  chgPct: number;
  gapPct: number | null;
  rvol: number | null;
  rvolAsOf: number;
  volTrend: number;
  above20: boolean | null;
  above50: boolean | null;
  brk20: boolean | null;
  brk50: boolean | null;
  brk52: boolean | null;
  atrPct: number | null;
  ret5: number | null; ret20: number | null; ret60: number | null;
  rs5: number | null; rs20: number | null; rs60: number | null;
  rsScore: number | null;
  rsRank: number | null; // filled by rankRs
  gapAndGo: boolean | null;
  squeeze: boolean | null; // null = short interest or catalyst unknown
  siHigh: boolean | null;
  catalyst: boolean | null;
  /** estimated float, millions of shares (SEC public float ÷ close on its date) */
  floatM: number | null;
  /** short interest as % of the estimated float */
  siFloatPct: number | null;
  bullFlag: PatternHit;
  cupHandle: PatternHit;
  base: ScanBase;
}

export interface Thresholds { gapGo: number; gapGoRvol: number; siDays: number; siPct: number; volRising: number }
export const DEFAULT_THRESHOLDS: Thresholds = { gapGo: 3, gapGoRvol: 1.5, siDays: 5, siPct: 15, volRising: 1.3 };

const ret = (last: number, ref: number | null) => (ref ? (last / ref - 1) * 100 : null);

/** @param todayDay ET day of the quote; quote open counts as today's open only when the quote is from today's session */
export function liveRow(b: ScanBase, q: LiveQuote | undefined, spy: { base: ScanBase; q?: LiveQuote } | undefined, th: Thresholds = DEFAULT_THRESHOLDS, quoteIsToday = false): ScanRow {
  const last = q && Number.isFinite(q.last) ? q.last : b.last;
  // yesterday's close: the provider's, else from bars (if today's bar isn't in the series yet, the last bar IS yesterday)
  const prevClose = quoteIsToday && q && q.prevClose > 0 ? q.prevClose : b.formingIsToday ? b.prevClose : quoteIsToday ? b.last : b.prevClose;
  const open = quoteIsToday && q && q.open > 0 ? q.open : b.open;
  const gapPct = open != null && prevClose ? (open / prevClose - 1) * 100 : null;
  const spyLast = spy ? (spy.q && Number.isFinite(spy.q.last) ? spy.q.last : spy.base.last) : null;
  const r = (ref: number | null) => ret(last, ref);
  const sr = (ref: number | null) => (spyLast != null ? ret(spyLast, ref) : null);
  const rs = (a: number | null, s: number | null) => (a != null && s != null ? a - s : null);
  const ret5 = r(b.c5), ret20 = r(b.c20), ret60 = r(b.c60);
  const rs5 = rs(ret5, sr(spy?.base.c5 ?? null)), rs20 = rs(ret20, sr(spy?.base.c20 ?? null)), rs60 = rs(ret60, sr(spy?.base.c60 ?? null));
  const parts = [rs5, rs20, rs60].filter((x): x is number => x != null);
  const si = b.si;
  const siHigh = si === undefined ? null : si === null ? false : si.daysToCover >= th.siDays || (si.pctOut ?? 0) >= th.siPct;
  const catalyst = b.catalyst === undefined ? null : !!b.catalyst && b.catalyst.count > 0;
  const gt = (x: number | null) => (x == null ? null : last > x);
  return {
    sym: b.sym,
    last,
    chgPct: prevClose ? (last / prevClose - 1) * 100 : NaN,
    gapPct,
    rvol: b.rvol,
    rvolAsOf: b.asOf,
    volTrend: b.volTrend,
    above20: gt(b.sma20),
    above50: gt(b.sma50),
    brk20: gt(b.hi20),
    brk50: gt(b.hi50),
    brk52: gt(b.hi252),
    atrPct: b.atr14 != null && last ? (b.atr14 / last) * 100 : null,
    ret5, ret20, ret60, rs5, rs20, rs60,
    rsScore: parts.length ? parts.reduce((a, x) => a + x, 0) / parts.length : null,
    rsRank: null,
    gapAndGo: gapPct == null || open == null ? null : gapPct >= th.gapGo && last > open && (b.rvol ?? 0) >= th.gapGoRvol,
    siHigh,
    catalyst,
    floatM: b.float ? b.float.shares / 1e6 : null,
    siFloatPct: b.float && b.si ? (b.si.shares / b.float.shares) * 100 : null,
    squeeze: siHigh === false || catalyst === false || b.volTrend < th.volRising ? false : siHigh && catalyst ? true : null,
    bullFlag: b.bullFlag,
    cupHandle: b.cupHandle,
    base: b,
  };
}

/** RS rank: percentile (1-99) of the equal-weight 5/20/60-day RS-vs-SPY score across the scanned universe. */
export function rankRs(rows: ScanRow[], exclude: string[] = ['SPY', 'QQQ']): ScanRow[] {
  const scored = rows.filter((r) => r.rsScore != null && !exclude.includes(r.sym)).sort((a, b) => a.rsScore! - b.rsScore!);
  const N = scored.length;
  const rank = new Map(scored.map((r, i) => [r.sym, N === 1 ? 99 : Math.max(1, Math.round((i / (N - 1)) * 98) + 1)]));
  return rows.map((r) => ({ ...r, rsRank: rank.get(r.sym) ?? null }));
}
