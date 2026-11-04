import type { Bar } from '../src/types';
/** Daily bars from close prices; one ET weekday per bar ending on `end` (UTC midnight seconds). */
export function barsFrom(closes: number[], opts: { vol?: (i: number) => number; range?: number; end?: number } = {}): Bar[] {
  const end = opts.end ?? Date.UTC(2026, 10, 3) / 1000;
  const out: Bar[] = [];
  let t = end;
  const times: number[] = [];
  while (times.length < closes.length) {
    const wd = new Date(t * 1000).getUTCDay();
    if (wd !== 0 && wd !== 6) times.unshift(t);
    t -= 86400;
  }
  closes.forEach((c, i) => {
    const prev = i ? closes[i - 1] : c;
    const r = opts.range ?? 0.005;
    out.push({ time: times[i], open: prev, high: Math.max(prev, c) * (1 + r), low: Math.min(prev, c) * (1 - r), close: c, volume: opts.vol ? opts.vol(i) : 1_000_000 });
  });
  return out;
}
export const ramp = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n);
