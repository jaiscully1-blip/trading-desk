import { describe, expect, it } from 'vitest';
import { blockPrints, printLevels, usdShort } from '../shared/prints';

const t = (i: number) => new Date(Date.UTC(2026, 10, 18, 15, i)).toISOString();

describe('dark-pool and phantom prints', () => {
  const prints = blockPrints([
    { t: t(0), x: 'P', p: 500, s: 100 },                          // on-exchange: sets the market price
    { t: t(1), x: 'D', p: 500.02, s: 300 },                      // off-exchange but small: skipped
    { t: t(2), x: 'D', p: 500.01, s: 4000 },                     // $2.0M block
    { t: t(3), x: 'D', p: 500.03, s: 2500 },                     // $1.25M block, same level
    { t: t(4), x: 'D', p: 497.0, s: 30000, c: ['Z'] },           // late and 0.6% away: phantom
    { t: t(5), x: 'D', p: 500.0, s: 12000, c: ['W'] },           // average-price trade: phantom
  ]);
  it('keeps off-exchange blocks only', () => { expect(prints.length).toBe(4); });
  it('flags phantom prints with reasons', () => {
    const late = prints.find((p) => p.price === 497)!;
    expect(late.phantom).toBe(true);
    expect(late.why.join(' ')).toMatch(/late/); expect(late.why.join(' ')).toMatch(/away/);
    expect(prints.find((p) => p.price === 500.01)!.phantom).toBe(false);
    expect(prints.find((p) => p.price === 500)!.why).toEqual(['average-price trade']);
  });
  it('groups blocks into levels ranked by dollars', () => {
    const lv = printLevels(prints);
    expect(lv[0].price).toBe(497); expect(lv[0].phantom).toBe(1);
    expect(lv.some((l) => l.n >= 2 && Math.abs(l.price - 500) < 0.3)).toBe(true);
  });
  it('formats dollars', () => { expect(usdShort(14_900_000)).toBe('$14.9M'); expect(usdShort(2.1e9)).toBe('$2.1B'); });
});
