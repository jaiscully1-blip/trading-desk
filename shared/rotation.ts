// Sector rotation: who is beating the S&P 500, who is lagging, and which way each is turning.
// Built only from daily closes. Not fund-flow data: "money moving in" is read from relative performance.
import type { Bar } from './types.js';

export type RotGroup = 'sector' | 'theme' | 'size' | 'country' | 'haven' | 'crypto';
export interface RotAsset { sym: string; label: string; group: RotGroup; gics?: string; side?: 'offense' | 'defense' }
export const ROT_ASSETS: RotAsset[] = [
  { sym: 'XLK', label: 'Tech', group: 'sector', gics: 'Information Technology', side: 'offense' },
  { sym: 'XLC', label: 'Communication', group: 'sector', gics: 'Communication Services', side: 'offense' },
  { sym: 'XLY', label: 'Discretionary', group: 'sector', gics: 'Consumer Discretionary', side: 'offense' },
  { sym: 'XLF', label: 'Financials', group: 'sector', gics: 'Financials' },
  { sym: 'XLI', label: 'Industrials', group: 'sector', gics: 'Industrials' },
  { sym: 'XLE', label: 'Energy', group: 'sector', gics: 'Energy' },
  { sym: 'XLB', label: 'Materials', group: 'sector', gics: 'Materials' },
  { sym: 'XLV', label: 'Health care', group: 'sector', gics: 'Health Care', side: 'defense' },
  { sym: 'XLP', label: 'Staples', group: 'sector', gics: 'Consumer Staples', side: 'defense' },
  { sym: 'XLU', label: 'Utilities', group: 'sector', gics: 'Utilities', side: 'defense' },
  { sym: 'XLRE', label: 'Real estate', group: 'sector', gics: 'Real Estate' },
  { sym: 'SMH', label: 'Semiconductors', group: 'theme', side: 'offense' },
  { sym: 'XBI', label: 'Biotech', group: 'theme' },
  { sym: 'KRE', label: 'Regional banks', group: 'theme' },
  { sym: 'XHB', label: 'Homebuilders', group: 'theme' },
  { sym: 'XOP', label: 'Oil producers', group: 'theme' },
  { sym: 'IWM', label: 'Small caps', group: 'size', side: 'offense' },
  { sym: 'EWJ', label: 'Japan', group: 'country' },
  { sym: 'FXI', label: 'China', group: 'country' },
  { sym: 'VGK', label: 'Europe', group: 'country' },
  { sym: 'INDA', label: 'India', group: 'country' },
  { sym: 'EWZ', label: 'Brazil', group: 'country' },
  { sym: 'TLT', label: 'Long bonds', group: 'haven', side: 'defense' },
  { sym: 'GLD', label: 'Gold', group: 'haven', side: 'defense' },
  { sym: 'UUP', label: 'US dollar', group: 'haven' },
  { sym: 'BTC', label: 'Bitcoin', group: 'crypto', side: 'offense' },
  { sym: 'ETH', label: 'Ether', group: 'crypto' },
];
export const GROUP_LABEL: Record<RotGroup, string> = { sector: 'S&P sectors', theme: 'Themes', size: 'Size', country: 'Countries', haven: 'Safe havens', crypto: 'Crypto' };
export const WINDOWS = [1, 5, 20, 60] as const;

export type Quadrant = 'leading' | 'weakening' | 'lagging' | 'improving';
export interface RotRow {
  sym: string; label: string; group: RotGroup; gics?: string;
  ret: Record<number, number | null>; // own % return over N trading days
  rel: Record<number, number | null>; // minus SPY's, in % points
  vol: number | null; // last day's volume vs 20-day average
  x: number | null; y: number | null; quadrant: Quadrant | null; // rotation map (100 = in line with SPY)
  tail: { x: number; y: number }[]; // weekly points, oldest first
  last: number; asOf: string;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const sma = (xs: number[], i: number, n: number) => { if (i + 1 < n) return null; let s = 0; for (let k = i + 1 - n; k <= i; k++) s += xs[k]; return s / n; };

/** Closes aligned to SPY's trading days (crypto trades weekends; its close on each SPY date is used). */
function aligned(bars: Bar[], spyDays: string[]): (number | null)[] {
  const by = new Map(bars.map((b) => [day(b.time), b.close]));
  let last: number | null = null;
  const firstDay = bars.length ? day(bars[0].time) : '9999';
  return spyDays.map((d) => { const v = by.get(d); if (v != null) last = v; return d < firstDay ? null : v ?? last; });
}

/**
 * Rotation map coordinates, a simple open version of the relative-rotation idea:
 *   x = RS line vs its 50-day average (100 = on its average; >100 = gaining on SPY)
 *   y = how fast x is changing: x today vs x 10 trading days ago (>100 = getting stronger)
 */
function rrgAt(rs: number[], i: number): { x: number; y: number } | null {
  const m = sma(rs, i, 50); if (m == null || i < 60) return null;
  const x = (100 * rs[i]) / m;
  const m0 = sma(rs, i - 10, 50); if (m0 == null) return null;
  const x0 = (100 * rs[i - 10]) / m0;
  return { x, y: 100 + (x - x0) * 2 };
}
const quad = (x: number, y: number): Quadrant => (x >= 100 ? (y >= 100 ? 'leading' : 'weakening') : y >= 100 ? 'improving' : 'lagging');

export function rotationRows(series: Record<string, Bar[]>, spy: Bar[], assets: RotAsset[] = ROT_ASSETS): RotRow[] {
  const spyDays = spy.map((b) => day(b.time)), spyC = spy.map((b) => b.close), n = spy.length;
  const pct = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && b !== 0 ? (a / b - 1) * 100 : null);
  return assets.flatMap((a) => {
    const bars = series[a.sym];
    if (!bars?.length || n < 2) return [];
    const c = aligned(bars, spyDays);
    const ret: Record<number, number | null> = {}, rel: Record<number, number | null> = {};
    for (const w of WINDOWS) {
      const r = pct(c[n - 1], c[n - 1 - w]), s = pct(spyC[n - 1], spyC[n - 1 - w]);
      ret[w] = r; rel[w] = r != null && s != null ? r - s : null;
    }
    const rs = c.map((v, i) => (v != null ? v / spyC[i] : NaN));
    const ok = rs.every((v, i) => i < n - 70 || Number.isFinite(v));
    const now = ok ? rrgAt(rs, n - 1) : null;
    const tail: { x: number; y: number }[] = [];
    if (ok) for (let k = 5; k >= 1; k--) { const p = rrgAt(rs, n - 1 - k * 5); if (p) tail.push(p); }
    const vols = bars.map((b) => b.volume ?? 0);
    const v20 = vols.length > 21 ? vols.slice(-21, -1).reduce((x, y) => x + y, 0) / 20 : 0;
    return [{
      sym: a.sym, label: a.label, group: a.group, gics: a.gics, ret, rel,
      vol: v20 > 0 ? vols[vols.length - 1] / v20 : null,
      x: now?.x ?? null, y: now?.y ?? null, quadrant: now ? quad(now.x, now.y) : null, tail,
      last: bars[bars.length - 1].close, asOf: day(bars[bars.length - 1].time),
    }];
  });
}

/**
 * Risk appetite: offense basket (tech, comms, discretionary, semis, small caps, bitcoin) vs defense
 * (health care, staples, utilities, long bonds, gold), each indexed to 100 three months ago.
 * score = where today's 20-day spread sits within the past year (0 = most defensive, 100 = most risk-on).
 */
export function riskAppetite(series: Record<string, Bar[]>, spy: Bar[], assets: RotAsset[] = ROT_ASSETS) {
  const spyDays = spy.map((b) => day(b.time)), n = spy.length;
  const basket = (side: 'offense' | 'defense') => assets.filter((a) => a.side === side && series[a.sym]?.length).map((a) => aligned(series[a.sym], spyDays));
  const off = basket('offense'), def = basket('defense');
  if (!off.length || !def.length || n < 90) return null;
  const avgRet = (b: (number | null)[][], i: number, j: number) => { const rs = b.map((c) => (c[i] != null && c[j] != null ? c[i]! / c[j]! - 1 : null)).filter((x): x is number => x != null); return rs.length ? rs.reduce((x, y) => x + y, 0) / rs.length : null; };
  const start = n - 63;
  const line = Array.from({ length: 63 }, (_, k) => { const i = start + k; const o = avgRet(off, i, start), d = avgRet(def, i, start); return o != null && d != null ? { day: spyDays[i], v: (o - d) * 100 } : null; }).filter((x): x is { day: string; v: number } => x != null);
  const spreads: number[] = [];
  for (let i = Math.max(20, n - 252); i < n; i++) { const o = avgRet(off, i, i - 20), d = avgRet(def, i, i - 20); if (o != null && d != null) spreads.push(o - d); }
  if (!spreads.length) return null;
  const now = spreads[spreads.length - 1];
  const score = Math.round((spreads.filter((s) => s <= now).length / spreads.length) * 100);
  const prev = spreads[Math.max(0, spreads.length - 6)];
  return { score, spread20: now * 100, rising: now > prev, line, offense: assets.filter((a) => a.side === 'offense').map((a) => a.sym), defense: assets.filter((a) => a.side === 'defense').map((a) => a.sym) };
}

/** Yahoo Finance chart API (v8) -> daily bars. */
export function parseYahooChart(j: any): Bar[] {
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error(String(j?.chart?.error?.description ?? 'no chart data'));
  const ts: number[] = r.timestamp ?? [], q = r.indicators?.quote?.[0] ?? {};
  const offset = Number(r.meta?.gmtoffset ?? 0);
  const out: Bar[] = [];
  ts.forEach((t, i) => {
    const c = q.close?.[i];
    if (c == null || !Number.isFinite(c)) return;
    const local = new Date((t + offset) * 1000).toISOString().slice(0, 10); // exchange-local date
    out.push({ time: Date.parse(`${local}T00:00:00Z`) / 1000, open: q.open?.[i] ?? c, high: q.high?.[i] ?? c, low: q.low?.[i] ?? c, close: c, volume: q.volume?.[i] ?? 0 });
  });
  return out;
}
