import { describe, expect, it } from 'vitest';
import { boxAround, changes, fullness, parseStats, quarters, rdwMonths } from '../shared/tesla';

describe('Tesla registrations', () => {
  const rows = rdwMonths([
    { m: '2025-10-01T00:00:00.000', merk: 'TESLA', n: '400' }, { m: '2026-09-01T00:00:00.000', merk: 'TESLA', n: '3177' },
    { m: '2026-10-01T00:00:00.000', merk: 'TESLA', n: '328' }, { m: '2026-10-01T00:00:00.000', merk: 'BYD', n: '602' },
    { m: '2026-07-01T00:00:00.000', merk: 'TESLA', n: '358' }, { m: '2026-08-01T00:00:00.000', merk: 'TESLA', n: '1035' }, { m: 'bad', merk: 'X', n: '1' },
  ], 'merk');
  it('groups RDW rows by month, oldest first', () => {
    expect(rows.map((r) => r.month)).toEqual(['2025-10', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(rows.at(-1)!.counts).toEqual({ TESLA: 328, BYD: 602 });
  });
  it('month over month and year over year', () => {
    const c = changes(rows, 'TESLA', '2026-10');
    expect(c.value).toBe(328);
    expect(c.mom).toBeCloseTo((328 / 3177 - 1) * 100);
    expect(c.yoy).toBeCloseTo((328 / 400 - 1) * 100);
    expect(changes(rows, 'BYD', '2026-10').mom).toBeNull();
  });
  it('quarter totals', () => {
    expect(quarters(rows, 'TESLA').find((q) => q.q === '2026 Q3')).toEqual({ q: '2026 Q3', value: 358 + 1035 + 3177, months: 3 });
  });
});

describe('lot fullness', () => {
  it('keeps clear passes only and scales months between the emptiest and fullest', () => {
    const j = { data: [
      { interval: { from: '2026-01-05T00:00:00Z' }, outputs: { bright: { bands: { B0: { stats: { mean: 0.10, sampleCount: 100, noDataCount: 0 } } } } } },
      { interval: { from: '2026-01-20T00:00:00Z' }, outputs: { bright: { bands: { B0: { stats: { mean: 0.50, sampleCount: 100, noDataCount: 60 } } } } } }, // cloudy: dropped
      { interval: { from: '2026-02-03T00:00:00Z' }, outputs: { bright: { bands: { B0: { stats: { mean: 0.20, sampleCount: 100, noDataCount: 5 } } } } } },
      { interval: { from: '2026-03-03T00:00:00Z' }, outputs: { bright: { bands: { B0: { stats: { mean: 0.15, sampleCount: 100, noDataCount: 0 } } } } } },
    ] };
    const obs = parseStats(j);
    expect(obs).toHaveLength(3);
    expect(fullness(obs)).toEqual([{ month: '2026-01', index: 0, n: 1 }, { month: '2026-02', index: 100, n: 1 }, { month: '2026-03', index: 50, n: 1 }]);
  });
  it('box is about the right size', () => {
    const b = boxAround(37.5, -121.9, 1000);
    expect((b[2][1] - b[0][1]) * 111_320).toBeCloseTo(1000, -1);
    expect(b[0]).toEqual(b[4]);
  });
});
