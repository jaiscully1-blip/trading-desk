import { describe, expect, it } from 'vitest';
import { durationSeries, fundSeries, instantSeries, yoy } from '../shared/fundseries';

const r = (start: string, end: string, val: number, form = '10-Q', filed = '2026-01-01') => ({ start, end, val, form, filed });

describe('fundamentals over time', () => {
  it('quarters from year-to-date totals, Q4 from the annual figure, newest filing wins', () => {
    const s = durationSeries([
      r('2025-01-01', '2025-03-31', 10), // Q1 (3 months)
      r('2025-01-01', '2025-06-30', 25), // 6 months year-to-date
      r('2025-01-01', '2025-09-30', 45), // 9 months
      r('2025-01-01', '2025-12-31', 70, '10-K'), // full year
      r('2025-01-01', '2025-03-31', 11, '10-Q', '2026-05-01'), // restated Q1 in a later filing
    ]);
    expect([...s.quarters.entries()].sort()).toEqual([['2025-03-31', 11], ['2025-06-30', 14], ['2025-09-30', 20], ['2025-12-31', 25]]);
    expect(s.years.get('2025-12-31')).toBe(70);
  });
  it('direct quarterly figures are kept over derived ones', () => {
    const s = durationSeries([r('2025-01-01', '2025-03-31', 10), r('2025-04-01', '2025-06-30', 12), r('2025-01-01', '2025-06-30', 22.5)]);
    expect(s.quarters.get('2025-06-30')).toBe(12);
  });
  it('instant values: newest filing per date', () => {
    const m = instantSeries([{ end: '2025-12-31', val: 5, filed: '2026-02-01' }, { end: '2025-12-31', val: 6, filed: '2026-05-01' }, { start: 'x', end: '2025-06-30', val: 9 } as any]);
    expect([...m.entries()]).toEqual([['2025-12-31', 6]]);
  });
  it('company facts -> annual and quarterly points with margins, FCF and labels', () => {
    const usd = (rows: any[]) => ({ units: { USD: rows } });
    const j = { facts: { 'us-gaap': {
      Revenues: usd([r('2024-01-01', '2024-12-31', 100, '10-K'), r('2025-01-01', '2025-12-31', 150, '10-K'), r('2025-07-01', '2025-09-30', 40)]),
      NetIncomeLoss: usd([r('2024-01-01', '2024-12-31', 10, '10-K'), r('2025-01-01', '2025-12-31', 30, '10-K')]),
      GrossProfit: usd([r('2025-01-01', '2025-12-31', 90, '10-K')]),
      NetCashProvidedByUsedInOperatingActivities: usd([r('2025-01-01', '2025-12-31', 50, '10-K')]),
      PaymentsToAcquirePropertyPlantAndEquipment: usd([r('2025-01-01', '2025-12-31', 20, '10-K')]),
      EarningsPerShareDiluted: { units: { 'USD/shares': [r('2025-01-01', '2025-12-31', 1.5, '10-K')] } },
      CommonStockSharesOutstanding: { units: { shares: [{ end: '2025-12-31', val: 20, filed: '2026-02-01' }] } },
    } } };
    const f = fundSeries(j);
    expect(f.annual.map((p) => p.label)).toEqual(['FY24', 'FY25']);
    expect(f.annual[1]).toMatchObject({ revenue: 150, netIncome: 30, eps: 1.5, grossMargin: 60, netMargin: 20, fcf: 30, shares: 20 });
    expect(f.quarterly.map((p) => p.label)).toEqual(['25Q3']);
    expect(yoy(f.annual, 'revenue', false)).toEqual([null, 50]);
    expect(yoy(f.annual, 'netMargin', false)[1]).toBeCloseTo(10); // margins change in points
  });
});
