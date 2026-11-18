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

import { explain, namesAt, read } from '../shared/priceaction';
import { PA_CARDS } from '../shared/pacards';
describe('price action reading', () => {
  // a rise, a pullback, a fast gap-up rally, then a drop back through the gap
  const closes = [100, 101, 102, 103, 102, 101, 100.5, 101.5, 103, 106, 109, 110, 109, 107, 104, 101, 99, 98, 99, 100, 101, 102, 101, 100, 99, 98, 97, 98, 99, 100];
  const bars = closes.map((c, i) => ({ time: i * 86400, open: i ? closes[i - 1] : c, high: Math.max(c, i ? closes[i - 1] : c) + 0.3, low: Math.min(c, i ? closes[i - 1] : c) - 0.3, close: c, volume: 1000 + (i === 9 ? 5000 : 0) }));
  it('finds swings, structure, gaps and liquidity without looking past the cut', () => {
    const pa = read(bars, 20);
    expect(pa.swings.length).toBeGreaterThan(1);
    expect(pa.swings.every((s) => s.i < 20)).toBe(true);
    expect(pa.zones.some((z) => z.kind === 'FVG' && z.dir === 'bull')).toBe(true);
    expect(pa.events.length).toBeGreaterThan(0);
    expect(namesAt(pa, 19).length).toBeGreaterThan(0);
  });
  it('explains what happened after the cut', () => {
    const e = explain(bars, 19, 10);
    expect(e.before.length).toBeGreaterThan(1);
    expect(e.after[0]).toMatch(/Closed (up|down)/);
    expect(e.takeaway.length).toBeGreaterThan(10);
  });
  it('price action cards are complete', () => {
    expect(new Set(PA_CARDS.map((c) => c.id)).size).toBe(PA_CARDS.length);
    for (const c of PA_CARDS) { expect(c.what.length && c.use.length).toBeTruthy(); expect(c.wrong.length).toBeGreaterThan(5); }
  });
});
