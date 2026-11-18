// Analyst consensus (pure, tested): the ratings mix as one score on a sell-to-buy scale, plus the average target vs the
// last price. This is a summary of what analysts publish, not a recommendation from the desk.

export interface Counts { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }
export const LABELS = ['Strong sell', 'Sell', 'Hold', 'Buy', 'Strong buy'] as const;

/** Weighted average rating from 1 (strong sell) to 5 (strong buy); `pos` is the same on a 0-100 gauge. */
export function consensusScore(c: Counts): { n: number; score: number | null; pos: number | null; label: string | null } {
  const n = c.strongBuy + c.buy + c.hold + c.sell + c.strongSell;
  if (!n) return { n: 0, score: null, pos: null, label: null };
  const score = (5 * c.strongBuy + 4 * c.buy + 3 * c.hold + 2 * c.sell + c.strongSell) / n;
  return { n, score, pos: ((score - 1) / 4) * 100, label: LABELS[Math.min(4, Math.max(0, Math.round(score) - 1))] };
}

/** Percent from the last price to the average target. */
export const upside = (target: number | null, last: number | null) => (target && last ? (target / last - 1) * 100 : null);

/** Ratings counts from Alpha Vantage's company overview (fields are strings, "None" when missing). */
export function avCounts(o: any): Counts | null {
  const g = (k: string) => { const v = Number(o?.[k]); return Number.isFinite(v) ? v : 0; };
  const c = { strongBuy: g('AnalystRatingStrongBuy'), buy: g('AnalystRatingBuy'), hold: g('AnalystRatingHold'), sell: g('AnalystRatingSell'), strongSell: g('AnalystRatingStrongSell') };
  return c.strongBuy + c.buy + c.hold + c.sell + c.strongSell ? c : null;
}
