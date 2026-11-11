import { describe, expect, it } from 'vitest';
import { fuzzyScore } from '../shared/fuzzy';
import { computeBase } from '../shared/scan';

describe('command bar matching', () => {
  it('ranks prefix, then substring, then in-order letters; misses return null', () => {
    const s = (q: string, t: string) => fuzzyScore(q, t) ?? -1;
    expect(s('jour', 'Journal')).toBeGreaterThan(s('jour', 'Open journal tab'));
    expect(s('jr', 'Journal')).toBeGreaterThan(0);
    expect(s('jr', 'Journal')).toBeGreaterThan(s('jr', 'major'));
    expect(fuzzyScore('xq', 'Journal')).toBeNull();
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('sparkline data', () => {
  it('the scan base keeps the last 30 completed closes', () => {
    const bars = Array.from({ length: 40 }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: 10, high: 11, low: 9, close: 10 + i / 3, volume: 1000 }));
    const b = computeBase('X', bars as any, 1_700_000_000 + 60 * 86400, Date.now(), 'test');
    expect(b.spark).toHaveLength(30);
    expect(b.spark![29]).toBeCloseTo(10 + 39 / 3, 3);
  });
});
