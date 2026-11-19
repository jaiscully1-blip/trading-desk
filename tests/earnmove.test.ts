import { describe, expect, it } from 'vitest';
import { impliedMove, pastReactions, reactionDay } from '../shared/earnmove';

describe('earnings moves', () => {
  it('finds the reaction day', () => {
    expect(reactionDay('2026-11-19', 'amc')).toBe('2026-11-20');
    expect(reactionDay('2026-11-20', 'amc')).toBe('2026-11-23'); // Friday after close -> Monday
    expect(reactionDay('2026-11-19', 'bmo')).toBe('2026-11-19');
  });
  it('prices the at-the-money straddle on the first expiry after the report', () => {
    const c = (exp: string, K: number, cp: 'C' | 'P', bid: number, ask: number) => ({ exp, K, cp, bid, ask, dte: 1, T: 0.01, iv: 0.5, oi: 1, vol: 1 });
    const ch = { sym: 'X', spot: 100, asOf: null, contracts: [c('2026-11-18', 100, 'C', 1, 1.2), c('2026-11-18', 100, 'P', 1, 1.2), c('2026-11-20', 100, 'C', 2.9, 3.1), c('2026-11-20', 100, 'P', 2.9, 3.1), c('2026-11-20', 105, 'C', 1, 1.1), c('2026-11-20', 105, 'P', 6, 6.2)] };
    const m = impliedMove(ch, '2026-11-20')!;
    expect(m.exp).toBe('2026-11-20'); expect(m.strike).toBe(100); expect(m.pct).toBeCloseTo(6);
  });
  it('reads past reactions newest first with 5-day drift', () => {
    const closes = Array.from({ length: 20 }, (_, i) => ({ d: `2026-01-${String(i + 1).padStart(2, '0')}`, c: 100 + (i === 5 ? 10 : 0) + (i > 5 ? 10 + (i - 5) : 0) }));
    const r = pastReactions(closes, [{ date: '2026-01-06', time: 'pre' }]);
    expect(r[0].day).toBe('2026-01-06'); expect(r[0].move).toBeCloseTo(10); expect(r[0].drift5).toBeCloseTo((115 / 110 - 1) * 100);
  });
});
