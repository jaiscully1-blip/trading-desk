import { describe, expect, it } from 'vitest';
import { align, bestPerSeries, bhAdjust, corrP, diff, pearson, qShift, quarterlyReturns, reasonMix, scan, spearman, toneCandidates, yoyPct, type Series } from '../shared/quantlab';

const q = (i: number) => qShift('2010Q1', i);
const ser = (f: (i: number) => number, n = 40): Series => new Map(Array.from({ length: n }, (_, i) => [q(i), f(i)]));
// deterministic pseudo-noise so tests don't depend on randomness
const noise = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1;

describe('quantlab', () => {
  it('shifts quarters across years', () => {
    expect(qShift('2019Q4', 1)).toBe('2020Q1');
    expect(qShift('2020Q1', -1)).toBe('2019Q4');
    expect(qShift('2020Q2', -6)).toBe('2018Q4');
  });
  it('turns month-end closes into quarterly returns', () => {
    const closes = [['2020-01-31', 100], ['2020-03-31', 110], ['2020-06-30', 99], ['2020-12-31', 120]].map(([d, c]) => ({ t: Date.parse(d as string), c: c as number }));
    const r = quarterlyReturns(closes);
    expect(r.get('2020Q2')).toBeCloseTo(-10, 6);
    expect(r.has('2020Q4')).toBe(false); // Q3 missing, so no Q4 return
  });
  it('computes Pearson, Spearman and a sane p-value', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
    expect(spearman([1, 2, 3, 100], [1, 2, 3, 4])).toBeCloseTo(1);
    expect(corrP(0.5, 30)).toBeGreaterThan(0.004); expect(corrP(0.5, 30)).toBeLessThan(0.006); // textbook: about 0.005
    expect(corrP(0.05, 20)).toBeGreaterThan(0.8);
  });
  it('adjusts p-values for many tests (Benjamini-Hochberg)', () => {
    const qv = bhAdjust([0.01, 0.04, 0.03, 0.5]);
    expect(qv[0]).toBeCloseTo(0.04); expect(qv[1]).toBeCloseTo(0.16 / 3); expect(qv[2]).toBeCloseTo(0.16 / 3); expect(qv[3]).toBeCloseTo(0.5);
  });
  it('aligns with a lead so x from last quarter pairs with y now', () => {
    const x = ser((i) => i), y = ser((i) => i * 10);
    const a = align(x, y, 1);
    expect(a.k[0]).toBe('2010Q2'); expect(a.x[0]).toBe(0); expect(a.y[0]).toBe(10);
  });
  it('finds a planted lead-lag link and calls noise noise', () => {
    const driver = ser((i) => noise(i) * 10, 48), target = ser((i) => (driver.get(q(i - 1)) ?? 0) * 0.8 + noise(i + 100) * 2, 48);
    const junk = ser((i) => noise(i + 500) * 10, 48);
    const f = bestPerSeries(scan('XYZ', target, [{ id: 'd', label: 'Driver', group: 'g', s: driver }, { id: 'j', label: 'Junk', group: 'g', s: junk }]));
    expect(f[0].id).toBe('d'); expect(f[0].lag).toBe(1); expect(f[0].significant && f[0].stable).toBe(true);
    const j = f.find((x) => x.id === 'j')!; expect(j.significant && j.stable).toBe(false);
  });
  it('builds change and growth series', () => {
    const s = ser((i) => 100 + i * 10, 8);
    expect(diff(s).get('2010Q2')).toBe(10);
    expect(yoyPct(s).get('2011Q1')).toBeCloseTo(40);
  });
  it('turns review tone rows into candidates and reason mixes', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ q: q(i), n: 100, stars: 4, tone: 0.5 + i / 100, posPct: 0.7, negPct: 0.1, verifiedPct: 0.9, reasons: { taste: [30, 10] as [number, number], 'price/value': [5, 15] as [number, number] } }));
    const c = toneCandidates({ name: 'Co', category: 'x', products: 3, q: rows });
    expect(c.find((x) => x.id === 'rv:tone')!.s.get(q(1))).toBeCloseTo(0.01);
    expect(c.some((x) => x.id === 'rv:why:price/value')).toBe(true);
    const m = reasonMix(rows); expect(m[0].reason).toBe('taste'); expect(m.find((x) => x.reason === 'price/value')!.negShare).toBeCloseTo(0.75);
  });
});
