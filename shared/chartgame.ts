// Chart game maths: pick a hidden cut point in real daily bars, measure what happened over the next N bars, and the
// base rate (how often any N-bar window in the same history went up), so a guess can be judged against chance.
import type { Bar } from './types.js';

export const GAME_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'TSLA', 'AMD', 'JPM', 'XOM', 'KO', 'WMT', 'NFLX', 'COST', 'BA', 'DIS', 'INTC', 'CAT', 'UNH', 'HD', 'PFE', 'GLD', 'TLT', 'XLE', 'XLF'];
export const SHOW = 120; // bars visible before the cut

/** Shuffle helper: picks WHICH real chart or flashcard to show next. It never makes up prices or other data. */
export const pickIndex = (n: number, rnd: () => number = Math.random) => Math.floor(rnd() * n);

/** A cut index with SHOW bars before it and `h` bars after, or null when the history is too short. */
export function pickCut(n: number, h: number, rnd: () => number = Math.random): number | null {
  const lo = SHOW, hi = n - h - 1;
  return hi < lo ? null : lo + Math.floor(rnd() * (hi - lo + 1));
}

/** % change from the close at `cut` (the last visible bar) to the close `h` bars later. */
export function outcome(bars: Bar[], cut: number, h: number): number {
  const a = bars[cut]?.close, b = bars[cut + h]?.close;
  return a && b ? ((b - a) / a) * 100 : NaN;
}

/** Share of all h-bar windows in this history that ended higher. */
export function baseRate(bars: Bar[], h: number): number {
  let up = 0, n = 0;
  for (let i = 0; i + h < bars.length; i++) { n++; if (bars[i + h].close > bars[i].close) up++; }
  return n ? up / n : NaN;
}
