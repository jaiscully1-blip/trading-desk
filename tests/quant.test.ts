import { describe, expect, it } from 'vitest';
import { alignCloses, garch11, hurst, permEntropy, quantRead } from '../shared/quant';

let seed = 42;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const walk = (n: number, drift: number, vol: number, start = 100) => { const out = [start]; for (let i = 1; i < n; i++) out.push(out[i - 1] * Math.exp(drift + vol * gauss())); return out; };

describe('quant building blocks', () => {
  it('Hurst ~0.5 for noise, high for persistent, low for anti-persistent', () => {
    const noise = Array.from({ length: 2000 }, gauss);
    expect(hurst(noise)!).toBeGreaterThan(0.4);
    expect(hurst(noise)!).toBeLessThan(0.6);
    const pers: number[] = [0]; for (let i = 1; i < 2000; i++) pers.push(0.6 * pers[i - 1] + gauss());
    expect(hurst(pers)!).toBeGreaterThan(0.6);
    const anti: number[] = [0]; for (let i = 1; i < 2000; i++) anti.push(-0.6 * anti[i - 1] + gauss());
    expect(hurst(anti)!).toBeLessThan(0.4);
  });
  it('permutation entropy: 1 for noise, low for a straight line', () => {
    expect(permEntropy(Array.from({ length: 3000 }, gauss))!).toBeGreaterThan(0.98);
    expect(permEntropy(Array.from({ length: 300 }, (_, i) => i))!).toBeCloseTo(0, 5);
  });
  it('GARCH recovers volatility clustering', () => {
    const r: number[] = []; let h = 1e-4;
    for (let i = 0; i < 1500; i++) { const x = Math.sqrt(h) * gauss(); r.push(x); h = 1e-5 + 0.1 * x * x + 0.85 * h; }
    const g = garch11(r)!;
    expect(g.persist).toBeGreaterThan(0.85);
    expect(g.alpha).toBeGreaterThan(0.04);
    expect(g.volLong).toBeGreaterThan(0);
  });
});

describe('quantRead', () => {
  it('a steady uptrend reads bullish with reasons, a downtrend bearish', () => {
    const spy = walk(260, 0.0003, 0.01);
    const up = spy.map((v, i) => v * Math.exp(0.002 * i));
    const q = quantRead({ closes: up, bench: spy })!;
    expect(q.verdict.label).toMatch(/Bullish|Lean bullish/);
    expect(q.capm!.beta).toBeGreaterThan(0.8);
    expect(q.capm!.alpha).toBeGreaterThan(20);
    expect(q.verdict.reasons.length).toBeGreaterThan(4);
    const down = spy.map((v, i) => v * Math.exp(-0.002 * i));
    expect(quantRead({ closes: down, bench: spy })!.verdict.label).toMatch(/Bearish|Lean bearish/);
  });
  it('needs enough history, and aligns by date', () => {
    expect(quantRead({ closes: [1, 2, 3], bench: [] })).toBeNull();
    const a = alignCloses([[1, 10], [2, 11], [3, 12]], [[1, 100], [2, 101], [3, 99]]);
    expect(a.bench).toEqual([100, 101, 99]);
    expect(alignCloses([[1, 10], [2, 11], [3, 12]], [[9, 1]]).bench).toEqual([]);
  });
});
