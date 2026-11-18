import { describe, expect, it } from 'vitest';
import { baseRate, outcome, pickCut, SHOW } from '../shared/chartgame';

describe('chart game', () => {
  const bars = Array.from({ length: 200 }, (_, i) => ({ time: i * 86400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
  it('keeps the cut inside the history', () => {
    expect(pickCut(200, 20, () => 0)).toBe(SHOW);
    expect(pickCut(200, 20, () => 0.9999)).toBe(179);
    expect(pickCut(100, 20)).toBeNull();
  });
  it('measures the move and the base rate', () => {
    expect(outcome(bars, 150, 10)).toBeCloseTo((260 - 250) / 250 * 100);
    expect(baseRate(bars, 10)).toBe(1);
  });
});
