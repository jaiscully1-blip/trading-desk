import { describe, expect, it } from 'vitest';
import { parseYahooChart, riskAppetite, rotationRows } from '../shared/rotation';
import type { Bar } from '../shared/types';

const series = (f: (i: number) => number, n = 260): Bar[] => Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 86400, open: f(i), high: f(i), low: f(i), close: f(i), volume: 1000 }));

describe('rotation', () => {
  const spy = series((i) => 100 + i * 0.1);
  it('a ticker beating SPY and speeding up is "leading"; falling behind is "lagging"', () => {
    const rows = rotationRows({ XLK: series((i) => 100 * Math.exp(i * 0.002 + (i > 230 ? (i - 230) * 0.004 : 0))), XLU: series((i) => 100 * Math.exp(-i * 0.001 - (i > 230 ? (i - 230) * 0.004 : 0))) }, spy, [{ sym: 'XLK', label: 'Tech', group: 'sector' }, { sym: 'XLU', label: 'Utilities', group: 'sector' }]);
    const t = rows.find((r) => r.sym === 'XLK')!, u = rows.find((r) => r.sym === 'XLU')!;
    expect(t.quadrant).toBe('leading');
    expect(u.quadrant).toBe('lagging');
    expect(t.rel[20]!).toBeGreaterThan(0);
    expect(u.rel[5]!).toBeLessThan(0);
    expect(t.tail.length).toBe(5);
  });
  it('risk appetite reads high when offense beats defense', () => {
    const r = riskAppetite({ XLK: series((i) => 100 * Math.exp(i > 220 ? (i - 220) * 0.01 : 0)), TLT: series(() => 100) }, spy, [{ sym: 'XLK', label: 'Tech', group: 'sector', side: 'offense' }, { sym: 'TLT', label: 'Bonds', group: 'haven', side: 'defense' }])!;
    expect(r.score).toBeGreaterThan(90);
    expect(r.line.length).toBeGreaterThan(50);
  });
  it('reads Yahoo daily bars on the exchange date', () => {
    const b = parseYahooChart({ chart: { result: [{ meta: { gmtoffset: -18000 }, timestamp: [1762525800], indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [10] }] } }] } });
    expect(new Date(b[0].time * 1000).toISOString().slice(0, 10)).toBe('2025-11-07');
    expect(b[0]).toMatchObject({ close: 1.5, volume: 10 });
  });
});
