import { describe, expect, it } from 'vitest';
import { avCounts, consensusScore, upside } from '../shared/consensus';

describe('analyst consensus', () => {
  it('scores the ratings mix from strong sell (1) to strong buy (5)', () => {
    const r = consensusScore({ strongBuy: 2, buy: 4, hold: 3, sell: 0, strongSell: 0 });
    expect(r.n).toBe(9);
    expect(r.score!.toFixed(2)).toBe('3.89');
    expect(r.label).toBe('Buy');
    expect(consensusScore({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 }).score).toBeNull();
  });
  it('reads Alpha Vantage counts and works out the upside to target', () => {
    expect(avCounts({ AnalystRatingStrongBuy: '3', AnalystRatingBuy: '5', AnalystRatingHold: 'None' })).toEqual({ strongBuy: 3, buy: 5, hold: 0, sell: 0, strongSell: 0 });
    expect(avCounts({})).toBeNull();
    expect(upside(15.62, 2.41)!.toFixed(0)).toBe('548');
  });
});
