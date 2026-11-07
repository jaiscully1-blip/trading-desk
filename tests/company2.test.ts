import { describe, expect, it } from 'vitest';
import { cleanCoName, latestShares, secProfile } from '../shared/company';
import { detectAll, fillsReady, parseCsv, toFills, toTransfers, transfersReady, trimToHeader } from '../src/lib/csv';

describe('SEC fallbacks for the company page', () => {
  it('reads exchange, industry, HQ, fiscal year end from submissions', () => {
    const p = secProfile({ name: 'Tesla, Inc.', sicDescription: 'MOTOR VEHICLES & PASSENGER CAR BODIES', exchanges: ['Nasdaq'], fiscalYearEnd: '1231', addresses: { business: { city: 'AUSTIN', stateOrCountry: 'TX', stateOrCountryDescription: 'TX' } }, website: '' });
    expect(p).toMatchObject({ exchange: 'NASDAQ', sic: 'Motor Vehicles & Passenger Car Bodies', hq: 'Austin, TX', fiscalYearEnd: 'December 31', website: null });
  });
  it('cleans SEC-style names', () => {
    expect(cleanCoName('FORD MOTOR CO')).toBe('Ford Motor Co');
    expect(cleanCoName('Rivian Automotive, Inc. / DE')).toBe('Rivian Automotive, Inc.');
    expect(cleanCoName('THOR INDUSTRIES INC')).toBe('Thor Industries Inc');
  });
  it('sums share classes on the latest cover page', () => {
    const j = { units: { shares: [{ end: '2025-10-01', val: 100, accn: 'a' }, { end: '2026-01-20', val: 300, accn: 'b' }, { end: '2026-01-20', val: 50, accn: 'b' }] } };
    expect(latestShares(j)).toEqual({ shares: 350, asOf: '2026-01-20' });
  });
});

describe('one export with trades and cash', () => {
  it('Robinhood activity: trades become fills and ACH becomes a deposit', () => {
    const rows = trimToHeader(parseCsv('Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n11/3/2026,11/3/2026,11/4/2026,AMD,AMD,Buy,5,$100.00,($500.00)\n11/4/2026,11/4/2026,11/5/2026,AMD,AMD,Sell,5,$110.00,$550.00\n11/2/2026,11/2/2026,11/2/2026,,ACH Deposit,ACH,,,$1000\n'));
    const { fills, transfers } = detectAll(rows);
    expect(fillsReady(fills) && transfersReady(transfers)).toBe(true);
    expect(toFills(rows, fills).items).toHaveLength(2);
    expect(toTransfers(rows, transfers).items.map((t) => t.amount)).toEqual([1000]);
  });
});
