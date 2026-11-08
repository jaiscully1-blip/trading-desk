// Volatility estimators from daily OHLC, plus rank / percentile helpers. All annualised with sqrt(252), as decimals (0.18 = 18%).
// CALCULATED on the desk from reported prices; none of these is an implied volatility. Pure + tested.
import type { Bar } from './types.js';

const ANN = Math.sqrt(252);
const LN2 = Math.LN2;
const sd = (x: number[]) => {
  if (x.length < 2) return 0;
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
};
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
const last = (bars: Bar[], n: number) => bars.slice(-n);

/** Close-to-close: standard deviation of daily log returns. Needs n+1 bars. */
export function closeToClose(bars: Bar[], n = 20): number | null {
  const b = last(bars, n + 1);
  if (b.length < n + 1) return null;
  return sd(b.slice(1).map((x, i) => Math.log(x.close / b[i].close))) * ANN;
}

/** Parkinson (1980): uses the high-low range; about 5x more efficient than close-to-close when there are no gaps. */
export function parkinson(bars: Bar[], n = 20): number | null {
  const b = last(bars, n);
  if (b.length < n) return null;
  return Math.sqrt(mean(b.map((x) => Math.log(x.high / x.low) ** 2)) / (4 * LN2)) * ANN;
}

/** Garman-Klass (1980): range plus open-to-close, still assumes no overnight gap. */
export function garmanKlass(bars: Bar[], n = 20): number | null {
  const b = last(bars, n);
  if (b.length < n) return null;
  const v = mean(b.map((x) => 0.5 * Math.log(x.high / x.low) ** 2 - (2 * LN2 - 1) * Math.log(x.close / x.open) ** 2));
  return Math.sqrt(Math.max(0, v)) * ANN;
}

/** Yang-Zhang (2000): overnight gap + open-to-close + Rogers-Satchell range; the one that copes with gaps. Needs n+1 bars. */
export function yangZhang(bars: Bar[], n = 20): number | null {
  const b = last(bars, n + 1);
  if (b.length < n + 1 || n < 2) return null;
  const w = b.slice(1);
  const over = w.map((x, i) => Math.log(x.open / b[i].close));
  const oc = w.map((x) => Math.log(x.close / x.open));
  const rs = w.map((x) => Math.log(x.high / x.close) * Math.log(x.high / x.open) + Math.log(x.low / x.close) * Math.log(x.low / x.open));
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const v = sd(over) ** 2 + k * sd(oc) ** 2 + (1 - k) * mean(rs);
  return Math.sqrt(Math.max(0, v)) * ANN;
}

/** Volatility of volatility: standard deviation of the daily % change of a volatility series (e.g. VIX closes) over the last n days. */
export function volOfVol(series: number[], n = 20): number | null {
  const s = series.slice(-(n + 1));
  if (s.length < n + 1) return null;
  return sd(s.slice(1).map((x, i) => x / s[i] - 1));
}

/** Where the last value sits in a window: rank = position between the low and high (IV rank style), percentile = share of values below it. */
export function rankPct(values: number[]): { rank: number; percentile: number; lo: number; hi: number; n: number } | null {
  if (values.length < 20) return null;
  const x = values[values.length - 1], lo = Math.min(...values), hi = Math.max(...values);
  return { rank: hi === lo ? 50 : ((x - lo) / (hi - lo)) * 100, percentile: (values.filter((v) => v < x).length / values.length) * 100, lo, hi, n: values.length };
}

export interface VolRead {
  vix: number; vixRank: { rank: number; percentile: number; lo: number; hi: number; n: number } | null; vixOfVol: number | null;
  realized: { cc: number | null; parkinson: number | null; garmanKlass: number | null; yangZhang: number | null };
  /** VIX minus 20-day Yang-Zhang realized (both in vol points): the gap you pay for options over what the tape has done */
  premium: number | null;
}

/** vixHist: VIX closes oldest first (about a year). bars: daily OHLC for the index fund. */
export function volRead(vixHist: number[], bars: Bar[]): VolRead | null {
  if (vixHist.length < 20 || bars.length < 22) return null;
  const yz = yangZhang(bars, 20);
  return {
    vix: vixHist[vixHist.length - 1], vixRank: rankPct(vixHist), vixOfVol: volOfVol(vixHist, 20),
    realized: { cc: closeToClose(bars, 20), parkinson: parkinson(bars, 20), garmanKlass: garmanKlass(bars, 20), yangZhang: yz },
    premium: yz == null ? null : vixHist[vixHist.length - 1] - yz * 100,
  };
}
