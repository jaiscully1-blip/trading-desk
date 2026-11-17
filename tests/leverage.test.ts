import { describe, expect, it } from 'vitest';
import { assess, DEFAULT_LIMITS } from '../shared/leverage';

describe('leverage check', () => {
  it('asks for conviction first', () => {
    expect(assess({ conviction: null, atRisk: 100, equity: 10000 }).flags.some((f) => /conviction/i.test(f.text))).toBe(true);
  });
  it('warns when the loss is over the limit for that conviction', () => {
    const over = assess({ conviction: 2, atRisk: 300, equity: 10000 }); // 3% > 1%
    expect(over.pct).toBeCloseTo(3); expect(over.cap).toBe(DEFAULT_LIMITS.capPct[1]);
    expect(over.flags.some((f) => f.level === 'warn')).toBe(true);
    expect(assess({ conviction: 5, atRisk: 300, equity: 10000 }).flags.some((f) => f.level === 'warn')).toBe(false); // 3% < 4%
  });
  it('cuts size and asks for more time when macro or company risk is high', () => {
    const hi = assess({ conviction: 3, atRisk: 100, equity: 10000, macro: 'high', company: 'high', option: true, dte: 100 }); // 1% of account
    expect(hi.baseCap).toBe(1.5); expect(hi.cap).toBeCloseTo(0.375); expect(hi.minDte).toBe(120);
    expect(hi.flags.filter((f) => f.level === 'warn')).toHaveLength(2); // over the cut limit, and 100 < 120 days
    const lo = assess({ conviction: 3, atRisk: 180, equity: 10000, macro: 'low' }); // 1.8% < 1.5 x 1.25 = 1.875%
    expect(lo.cap).toBeCloseTo(1.875); expect(lo.flags.some((f) => f.level === 'warn')).toBe(false);
  });
  it('flags short-dated options and leverage over account size', () => {
    expect(assess({ conviction: 3, atRisk: 50, equity: 10000, option: true, dte: 5 }).flags.some((f) => /5 days/.test(f.text))).toBe(true);
    expect(assess({ conviction: 3, atRisk: 50, equity: 10000, option: true, dte: 30 }).flags.some((f) => /at least 60/.test(f.text))).toBe(true);
    expect(assess({ conviction: 3, atRisk: 50, equity: 10000, option: true, dte: 120 }).flags.some((f) => f.level === 'warn')).toBe(false);
    expect(assess({ conviction: 3, atRisk: 50, equity: 1000, position: 2000 }).flags.some((f) => /leverage/i.test(f.text))).toBe(true);
  });
});
