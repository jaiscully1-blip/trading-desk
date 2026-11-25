import { describe, expect, it } from 'vitest';
import { cdsTrades, impliedSpread, parseCsv, summarize } from '../shared/cds';
import { deltas, divergence, merton, annVol } from '../shared/credit2';

const H = ['Dissemination Identifier', 'Original Dissemination Identifier', 'Action type', 'Execution Timestamp', 'Expiration Date', 'Notional amount-Leg 1', 'Fixed rate-Leg 1', 'Spread-Leg 1', 'Other payment amount', 'Other payment type', 'UPI FISN', 'UPI Underlier Name', 'Cleared', 'Platform identifier', 'Underlier ID-Leg 1'];
const row = (o: Record<string, string>) => H.map((k) => `"${o[k] ?? ''}"`).join(',');
const csv = [H.map((k) => `"${k}"`).join(','),
  row({ 'Dissemination Identifier': '1', 'Action type': 'NEWT', 'Execution Timestamp': '2026-11-24T16:00:00Z', 'Expiration Date': '2031-12-20', 'Notional amount-Leg 1': '1,000,000', 'Fixed rate-Leg 1': '0.01', 'Other payment amount': '100665.75', 'Other payment type': 'UFRO', 'UPI FISN': 'NA/CDS Corp SN Sr', 'UPI Underlier Name': 'ORACLE CORPORATION', Cleared: 'I' }),
  row({ 'Dissemination Identifier': '2', 'Action type': 'NEWT', 'Execution Timestamp': '2026-11-24T17:00:00Z', 'Expiration Date': '2031-12-20', 'Notional amount-Leg 1': '5,000,000+', 'Fixed rate-Leg 1': '0.01', 'Spread-Leg 1': '0.0365', 'Other payment amount': '515800.72', 'Other payment type': 'UFRO', 'UPI FISN': 'NA/CDS Corp SN Sr', 'UPI Underlier Name': 'ORACLE CORPORATION', Cleared: 'I' }),
  row({ 'Dissemination Identifier': '3', 'Action type': 'NEWT', 'Execution Timestamp': '2026-11-24T17:30:00Z', 'Expiration Date': '2031-12-20', 'Notional amount-Leg 1': '1,000,000', 'Fixed rate-Leg 1': '0.01', 'Other payment amount': '5', 'Other payment type': 'UFRO', 'UPI FISN': 'NA/CDS Corp SN Sr', 'UPI Underlier Name': 'ORACLE CORPORATION' }),
  row({ 'Dissemination Identifier': '4', 'Original Dissemination Identifier': '3', 'Action type': 'EROR', 'UPI FISN': 'NA/CDS Corp SN Sr', 'UPI Underlier Name': 'ORACLE CORPORATION' }),
  row({ 'Dissemination Identifier': '5', 'Action type': 'NEWT', 'Execution Timestamp': '2026-11-24T18:00:00Z', 'Expiration Date': '2031-12-20', 'Notional amount-Leg 1': '10,000,000', 'Fixed rate-Leg 1': '0.05', 'Spread-Leg 1': '0.010489', 'UPI FISN': 'NA/CDS Corp Idx', 'UPI Underlier Name': 'CDX.NA.HY' }),
  row({ 'Dissemination Identifier': '6', 'Action type': 'NEWT', 'Execution Timestamp': '2026-11-24T18:00:00Z', 'Expiration Date': '2031-12-20', 'Notional amount-Leg 1': '1,000,000', 'Fixed rate-Leg 1': '0.01', 'Other payment amount': '1000', 'Other payment type': 'UFRO', 'UPI FISN': 'NA/CDS Corp SN Sr', 'UPI Underlier Name': 'GBP 4,75 MARKS+SPENCER PLC (REGS/129) 12-2025' }),
].join('\n');

describe('DTCC CDS tape', () => {
  const ts = cdsTrades(parseCsv(csv));
  it('drops errored trades, keeps quoted spreads, backs out the rest from the upfront', () => {
    const o = ts.filter((t) => t.name === 'ORACLE CORPORATION');
    expect(o).toHaveLength(2);
    expect(o[1]).toMatchObject({ spreadBp: 365, spreadSrc: 'quoted', capped: true });
    expect(o[0].spreadSrc).toBe('implied');
    expect(Math.abs(o[0].spreadBp! - 360)).toBeLessThan(15); // 10.07 points upfront on a 1% coupon, 5.1 years
  });
  it('reads price-quoted indexes (CDX HY at 104.9) as a spread under the 5% coupon', () => {
    const hy = ts.find((t) => t.name === 'CDX.NA.HY')!;
    expect(hy.spreadBp!).toBeGreaterThan(350); expect(hy.spreadBp!).toBeLessThan(420);
  });
  it('marks a small upfront as ambiguous and hides bond-description names', () => {
    const m = ts.find((t) => t.id === '6')!;
    expect(m.name).toBe(''); expect(m.spreadSrc).toBe('ambiguous');
    expect(summarize(ts).map((s) => s.name)).toEqual(['ORACLE CORPORATION', 'CDX.NA.HY']);
  });
  it('implied spread round-trips', () => {
    expect(impliedSpread(0, 100, 5, 1)).toBeCloseTo(100, 0);
  });
});

describe('credit tab math', () => {
  it('compares now vs a month and a year ago', () => {
    const d = deltas([['2025-11-20', 3], ['2026-10-20', 3.2], ['2026-11-20', 3.5]]);
    expect(d).toEqual({ last: 3.5, date: '2026-11-20', m1: 3.2, y1: 3 });
  });
  it('flags stocks rising while spreads widen', () => {
    expect(divergence(3.6, 3.2, 2).flag).toBe('credit-warns');
    expect(divergence(3.25, 3.2, 2).flag).toBe('both-calm');
  });
  it('gives a lower distance to default with more debt or more volatility', () => {
    const a = merton(100e9, 5e9, 20e9, 0.3)!, b = merton(100e9, 5e9, 80e9, 0.3)!, c = merton(100e9, 5e9, 20e9, 0.6)!;
    expect(a.dd).toBeGreaterThan(b.dd); expect(a.dd).toBeGreaterThan(c.dd); expect(a.pd).toBeLessThan(0.01);
    expect(annVol([100, 101, 100, 101])).toBeNull();
  });
});
