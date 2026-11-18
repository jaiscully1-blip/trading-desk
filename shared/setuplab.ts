// Setup lab: measures common intraday setups on real bars so the Learn page can show percentages with their sample sizes.
//   ORB:   opening-range breakout with a stop at the other side of the range, exits at a multiple of risk or the close.
//   VWAP:  where the day closes relative to VWAP, and how often VWAP retests hold.
//   Volume: share of the day's volume by time of day, and ORB results split by opening relative volume.
//   Sweeps and gaps (daily bars): how often a break of yesterday's high or low reversed, and how often gaps filled.
// Intraday bar times are ET wall-clock encoded as UTC seconds (see shared/types). No costs or slippage are included.
import type { Bar } from './types.js';

export interface Session { date: string; bars: Bar[] }
const hm = (t: number) => { const d = new Date(t * 1000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const OPEN = 9 * 60 + 30, CLOSE = 16 * 60;

/** Group intraday bars into regular sessions (09:30-16:00 ET), dropping days with too few bars. */
export function sessions(bars: Bar[], step = 5): Session[] {
  const by = new Map<string, Bar[]>();
  for (const b of bars) { const m = hm(b.time); if (m < OPEN || m >= CLOSE) continue; const k = new Date(b.time * 1000).toISOString().slice(0, 10); (by.get(k) ?? by.set(k, []).get(k)!).push(b); }
  const need = Math.floor(((CLOSE - OPEN) / step) * 0.8);
  return [...by.entries()].map(([date, bs]) => ({ date, bars: bs.sort((a, b) => a.time - b.time) })).filter((s) => s.bars.length >= need && hm(s.bars[0].time) === OPEN).sort((a, b) => a.date.localeCompare(b.date));
}

export const pct = (a: number, b: number) => (b ? (a / b) * 100 : NaN);

/* ---------------- ORB ---------------- */
export interface OrbTrade { date: string; side: 'long' | 'short'; entry: number; stop: number; r: number; fake: boolean; both: boolean; rvol: number | null }
export interface OrbStats { days: number; breaks: number; trades: OrbTrade[]; win: number; avgR: number; totalR: number; pf: number; fake: number; both: number; noBreak: number; hiRvol: { n: number; win: number; avgR: number }; loRvol: { n: number; win: number; avgR: number } }

/** Opening-range breakout. `orMin` minutes of range, first break after it, entry at the range edge (or the open if the
 *  bar gaps past it), stop at the other side, exit at `target` × risk or the 15:55 close. A bar that hits both the
 *  target and the stop counts as a loss (conservative). A "fakeout" is a break whose next 3 bars include a close back inside. */
export function orb(ss: Session[], orMin = 15, target: number | 'close' = 2, step = 5): OrbStats {
  const n = Math.max(1, Math.round(orMin / step));
  const trades: OrbTrade[] = []; let breaks = 0, noBreak = 0, both = 0;
  const orVols: number[] = [];
  for (const s of ss) {
    const or = s.bars.slice(0, n), rest = s.bars.slice(n);
    if (or.length < n || !rest.length) continue;
    const hi = Math.max(...or.map((b) => b.high)), lo = Math.min(...or.map((b) => b.low)), vol = or.reduce((a, b) => a + b.volume, 0);
    const prior = orVols.slice(-20); const rvol = prior.length >= 5 ? vol / (prior.reduce((a, b) => a + b, 0) / prior.length) : null;
    orVols.push(vol);
    const dayBoth = rest.some((b) => b.high > hi) && rest.some((b) => b.low < lo);
    if (dayBoth) both++;
    const k = rest.findIndex((b) => b.high > hi || b.low < lo);
    if (k < 0) { noBreak++; continue; }
    breaks++;
    const b0 = rest[k];
    if (b0.high > hi && b0.low < lo) continue; // both sides in one bar: order unknown, skip
    const side = b0.high > hi ? 'long' : 'short';
    const entry = side === 'long' ? Math.max(hi, b0.open) : Math.min(lo, b0.open), stop = side === 'long' ? lo : hi, risk = Math.abs(entry - stop);
    if (!(risk > 0)) continue;
    const tgt = target === 'close' ? null : side === 'long' ? entry + target * risk : entry - target * risk;
    let r: number | null = null;
    for (let i = k; i < rest.length && r == null; i++) {
      const b = rest[i], hitStop = side === 'long' ? b.low <= stop : b.high >= stop, hitTgt = tgt != null && (side === 'long' ? b.high >= tgt : b.low <= tgt);
      if (hitStop) r = -1; else if (hitTgt) r = target as number;
    }
    if (r == null) { const last = rest[rest.length - 1].close; r = (side === 'long' ? last - entry : entry - last) / risk; }
    const fake = rest.slice(k, k + 3).some((b) => (side === 'long' ? b.close < hi : b.close > lo));
    trades.push({ date: s.date, side, entry, stop, r, fake, both: dayBoth, rvol });
  }
  const sum = (xs: OrbTrade[]) => xs.reduce((a, t) => a + t.r, 0);
  const grp = (xs: OrbTrade[]) => ({ n: xs.length, win: pct(xs.filter((t) => t.r > 0).length, xs.length), avgR: xs.length ? sum(xs) / xs.length : NaN });
  const gains = trades.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0), losses = -trades.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0);
  return {
    days: ss.length, breaks, trades, noBreak, win: pct(trades.filter((t) => t.r > 0).length, trades.length), avgR: trades.length ? sum(trades) / trades.length : NaN, totalR: sum(trades),
    pf: losses ? gains / losses : NaN, fake: pct(trades.filter((t) => t.fake).length, trades.length), both: pct(both, ss.length),
    hiRvol: grp(trades.filter((t) => t.rvol != null && t.rvol >= 1.5)), loRvol: grp(trades.filter((t) => t.rvol != null && t.rvol < 1)),
  };
}

/* ---------------- VWAP ---------------- */
export function vwapSeries(bars: Bar[]): number[] {
  let pv = 0, v = 0;
  return bars.map((b) => { const tp = (b.high + b.low + b.close) / 3; pv += tp * b.volume; v += b.volume; return v ? pv / v : tp; });
}
export interface VwapStats { days: number; sameSide: number; fromAbove: { n: number; held: number }; fromBelow: { n: number; held: number }; trendDays: number }
/** sameSide: % of days whose close was on the same side of VWAP as price at 10:30. A retest is a bar that touches VWAP
 *  after 10:00 coming from one side; it "held" if price is still on that side 30 minutes (6 bars) later.
 *  trendDays: % of days where price stayed on one side of VWAP for the whole session after 10:00. */
export function vwapStats(ss: Session[]): VwapStats {
  let same = 0, n = 0, trend = 0; const fa = { n: 0, held: 0 }, fb = { n: 0, held: 0 };
  for (const s of ss) {
    const vw = vwapSeries(s.bars), i1030 = s.bars.findIndex((b) => hm(b.time) >= 10 * 60 + 30), i10 = s.bars.findIndex((b) => hm(b.time) >= 10 * 60);
    if (i1030 < 0 || i10 < 0) continue;
    n++;
    const lastI = s.bars.length - 1;
    if ((s.bars[i1030].close > vw[i1030]) === (s.bars[lastI].close > vw[lastI])) same++;
    const sides = s.bars.slice(i10).map((b, k) => b.close > vw[i10 + k]);
    if (sides.every((x) => x) || sides.every((x) => !x)) trend++;
    for (let i = Math.max(1, i10); i < s.bars.length - 6; i++) {
      const b = s.bars[i], prev = s.bars[i - 1];
      if (prev.close > vw[i - 1] && b.low <= vw[i] && b.high >= vw[i]) { fa.n++; if (s.bars[i + 6].close > vw[i + 6]) fa.held++; i += 6; }
      else if (prev.close < vw[i - 1] && b.high >= vw[i] && b.low <= vw[i]) { fb.n++; if (s.bars[i + 6].close < vw[i + 6]) fb.held++; i += 6; }
    }
  }
  return { days: n, sameSide: pct(same, n), fromAbove: fa, fromBelow: fb, trendDays: pct(trend, n) };
}

/* ---------------- volume by time of day ---------------- */
/** Share of all volume in each part of the day, and that share per hour so the buckets compare fairly. */
export function volumeProfile(ss: Session[]): { label: string; share: number; perHour: number }[] {
  const buckets = [['9:30-10:00', OPEN, 600], ['10:00-11:30', 600, 690], ['11:30-14:00', 690, 840], ['14:00-15:30', 840, 930], ['15:30-16:00', 930, CLOSE]] as const;
  const tot = buckets.map(() => 0); let all = 0;
  for (const s of ss) for (const b of s.bars) { const m = hm(b.time); const k = buckets.findIndex(([, a, z]) => m >= a && m < z); if (k >= 0) { tot[k] += b.volume; all += b.volume; } }
  return buckets.map(([label, a, z], k) => ({ label, share: pct(tot[k], all), perHour: pct(tot[k], all) / ((z - a) / 60) }));
}

/* ---------------- daily: sweeps of yesterday's high / low, gaps ---------------- */
export interface SweepStats { days: number; upBreaks: number; upRejected: number; dnBreaks: number; dnRejected: number }
/** Of days that traded above yesterday's high, the % that closed back below it (swept and rejected); same for lows. */
export function sweeps(d: Bar[]): SweepStats {
  let ub = 0, ur = 0, db = 0, dr = 0;
  for (let i = 1; i < d.length; i++) {
    const p = d[i - 1], b = d[i];
    if (b.high > p.high) { ub++; if (b.close < p.high) ur++; }
    if (b.low < p.low) { db++; if (b.close > p.low) dr++; }
  }
  return { days: d.length - 1, upBreaks: ub, upRejected: pct(ur, ub), dnBreaks: db, dnRejected: pct(dr, db) };
}
export interface GapRow { label: string; up: { n: number; filled: number }; dn: { n: number; filled: number } }
/** Same-day gap fills by gap size: a gap up "fills" when the day's low reaches yesterday's close. */
export function gapFills(d: Bar[]): GapRow[] {
  const rows: GapRow[] = [['0.25-0.5%', 0.25, 0.5], ['0.5-1%', 0.5, 1], ['1-2%', 1, 2], ['over 2%', 2, Infinity]].map(([label]) => ({ label: label as string, up: { n: 0, filled: 0 }, dn: { n: 0, filled: 0 } }));
  const edges = [0.25, 0.5, 1, 2, Infinity];
  for (let i = 1; i < d.length; i++) {
    const pc = d[i - 1].close, b = d[i], g = ((b.open - pc) / pc) * 100, a = Math.abs(g);
    const k = edges.findIndex((e, j) => j < 4 && a >= e && a < edges[j + 1]);
    if (k < 0) continue;
    if (g > 0) { rows[k].up.n++; if (b.low <= pc) rows[k].up.filled++; } else { rows[k].dn.n++; if (b.high >= pc) rows[k].dn.filled++; }
  }
  return rows;
}

/* ---------------- fair value gaps ---------------- */
export interface FvgStats { n: number; revisited: number; filled: number; bull: number; bear: number }
/** Three-candle gaps: bullish when bar[i-2].high < bar[i].low, bearish when bar[i-2].low > bar[i].high, at least
 *  `minPct` of price wide. "Revisited" = price traded back into the gap within `look` bars (or by the session's end when
 *  `sessionOnly`); "filled" = price traded all the way through it. */
export function fvgStats(groups: Bar[][], minPct = 0.05, look = 20): FvgStats {
  let n = 0, rev = 0, fill = 0, bull = 0, bear = 0;
  for (const bars of groups) for (let i = 2; i < bars.length - 1; i++) {
    const a = bars[i - 2], c = bars[i], px = c.close;
    const up = a.high < c.low && ((c.low - a.high) / px) * 100 >= minPct, dn = a.low > c.high && ((a.low - c.high) / px) * 100 >= minPct;
    if (!up && !dn) continue;
    n++; if (up) bull++; else bear++;
    const top = up ? c.low : a.low, bot = up ? a.high : c.high, after = bars.slice(i + 1, i + 1 + look);
    if (after.some((b) => (up ? b.low <= top : b.high >= bot))) rev++;
    if (after.some((b) => (up ? b.low <= bot : b.high >= top))) fill++;
  }
  return { n, revisited: pct(rev, n), filled: pct(fill, n), bull, bear };
}
