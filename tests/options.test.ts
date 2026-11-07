import { describe, expect, it } from 'vitest';
import { bs, breakeven, ncdf, plAtExpiry } from '../shared/options';

describe('Black-Scholes', () => {
  it('normal CDF', () => {
    expect(ncdf(0)).toBeCloseTo(0.5, 6);
    expect(ncdf(1.96)).toBeCloseTo(0.975, 3);
    expect(ncdf(-1)).toBeCloseTo(0.158655, 5);
  });
  it('matches the textbook example (S=100, K=100, 1y, 20% vol, 5% rate)', () => {
    const c = bs({ type: 'call', S: 100, K: 100, days: 365, iv: 0.2, r: 0.05 });
    const p = bs({ type: 'put', S: 100, K: 100, days: 365, iv: 0.2, r: 0.05 });
    expect(c.price).toBeCloseTo(10.4506, 3);
    expect(p.price).toBeCloseTo(5.5735, 3);
    expect(c.delta).toBeCloseTo(0.6368, 3);
    expect(p.delta).toBeCloseTo(-0.3632, 3);
    expect(c.gamma).toBeCloseTo(0.01876, 4);
    expect(c.vega).toBeCloseTo(0.3752, 3);
    // put-call parity: C - P = S - K e^{-rT}
    expect(c.price - p.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 4);
    expect(c.thetaDay).toBeLessThan(0);
  });
  it('expiry returns intrinsic', () => {
    expect(bs({ type: 'call', S: 105, K: 100, days: 0, iv: 0.3, r: 0.04 }).price).toBe(5);
    expect(bs({ type: 'put', S: 105, K: 100, days: 0, iv: 0.3, r: 0.04 }).price).toBe(0);
  });
  it('P/L and breakeven per contract', () => {
    expect(plAtExpiry('call', 100, 2.5, 110)).toBeCloseTo(750);
    expect(plAtExpiry('put', 100, 2.5, 110)).toBeCloseTo(-250);
    expect(breakeven('put', 100, 2.5)).toBe(97.5);
  });
});
