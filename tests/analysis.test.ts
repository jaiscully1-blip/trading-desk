import { describe, expect, it } from 'vitest';
import { betaStats, compareSeries, parseApeWisdom, pickWikidata, returnDist, valuation, wikidataQuery, type Closes } from '../shared/analysis';
import { DEFAULT_SIZE } from '../src/lib/grid';
import { WIDGETS } from '../src/components/HomeWidgets';

const D = 86400;
const series = (vals: number[], start = 20000): Closes => vals.map((v, i) => [(start + i) * D, v]);

describe('analysis', () => {
  it('compare: rebased to 0% on shared days', () => {
    const c = compareSeries({ A: series([100, 110, 121]), B: [[20001 * D, 50], [20002 * D, 55]] });
    expect(c.times).toEqual([20001 * D, 20002 * D]);
    expect(c.lines.A[1]).toBeCloseTo(10);
    expect(c.lines.B).toEqual([0, 10.000000000000009]);
  });
  it('beta: a stock that moves twice the benchmark', () => {
    const b: number[] = [100], a: number[] = [100];
    for (let i = 1; i < 120; i++) { const r = Math.sin(i) / 100; b.push(b[i - 1] * (1 + r)); a.push(a[i - 1] * (1 + 2 * r)); }
    const s = betaStats(series(a), series(b))!;
    expect(s.beta).toBeCloseTo(2, 5);
    expect(s.corr).toBeCloseTo(1, 5);
    expect(s.alphaAnn).toBeCloseTo(0, 3);
    expect(betaStats(series([1, 2, 3]), series([1, 2, 3]))).toBeNull();
  });
  it('return distribution', () => {
    const v = [100]; for (let i = 1; i < 60; i++) v.push(v[i - 1] * (i % 2 ? 1.01 : 0.995));
    const d = returnDist(series(v))!;
    expect(d.n).toBe(59);
    expect(d.upPct).toBeCloseTo((30 / 59) * 100);
    expect(d.best.pct).toBeCloseTo(1);
    expect(d.worst.pct).toBeCloseTo(-0.5);
    expect(d.bins.reduce((a, b) => a + b.n, 0)).toBe(59);
  });
  it('ApeWisdom, Wikidata, valuation', () => {
    expect(parseApeWisdom({ results: [{ ticker: 'SPY', name: 'SPDR S&amp;P 500', rank: 3, mentions: 10, mentions_24h_ago: 5, rank_24h_ago: 4 }, { ticker: '' }] })).toEqual([{ sym: 'SPY', name: 'SPDR S&P 500', rank: 3, mentions: 10, mentions24hAgo: 5, rank24hAgo: 4, upvotes: 0 }]);
    expect(wikidataQuery('GOOGL"; DROP')).toContain('"GOOGLDROP"');
    const b = (c: string, label: string, extra: Record<string, string>) => ({ c: { value: c }, cLabel: { value: label }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { value: v }])) });
    const w = pickWikidata({ results: { bindings: [b('Q95', 'Google', { ceoLabel: 'Sundar Pichai', emp: '187000', founded: '1998-09-04T00:00:00Z' }), b('Q20800404', 'Alphabet Inc.', { ceoLabel: 'Sundar Pichai', emp: '190234', hqLabel: 'Q123', founded: '2015-10-02T00:00:00Z' }), b('Q20800404', 'Alphabet Inc.', { hqLabel: 'Mountain View' })] } }, 'Alphabet Inc.');
    expect(w).toEqual({ entity: 'Q20800404', label: 'Alphabet Inc.', ceo: 'Sundar Pichai', employees: 190234, hq: 'Mountain View', founded: '2015-10-02' });
    expect(valuation({ peExclExtraTTM: 21, psTTM: '7.5', beta: 1.23, foo: 1 })).toMatchObject({ pe: 21, ps: 7.5, beta: 1.23, pb: null });
  });
  it('every Home widget has a default size (else adding it from the library breaks)', () => {
    for (const k of Object.keys(WIDGETS)) expect(DEFAULT_SIZE[k as keyof typeof DEFAULT_SIZE], k).toBeTruthy();
  });
});
