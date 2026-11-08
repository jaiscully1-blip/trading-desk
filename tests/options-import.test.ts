import { describe, expect, it } from 'vitest';
import { detectAll, mergeFills, optionLabel, parseCsv, parseOption, toFills, trimToHeader } from '../src/lib/csv';
import { viewTrade } from '../src/lib/journal';

describe('option contracts in broker files', () => {
  it('reads OCC, compact and written-out contracts', () => {
    expect(parseOption('NVDA251121C00150000')).toEqual({ root: 'NVDA', expiry: '2025-11-21', type: 'call', strike: 150 });
    expect(parseOption('SPY   251107P00672500')).toEqual({ root: 'SPY', expiry: '2025-11-07', type: 'put', strike: 672.5 });
    expect(parseOption('-TSLA251219C400')).toMatchObject({ root: 'TSLA', strike: 400, type: 'call' });
    expect(parseOption('NVDA 11/21/2025 Call $150.00')).toEqual({ root: 'NVDA', expiry: '2025-11-21', type: 'call', strike: 150 });
    expect(parseOption("AMD Nov 21 '25 $160 Put")).toEqual({ root: 'AMD', expiry: '2025-11-21', type: 'put', strike: 160 });
    expect(parseOption('NVDA')).toBeNull();
    expect(optionLabel({ root: 'NVDA', expiry: '2025-11-21', type: 'call', strike: 150 })).toBe('NVDA 150C 11/21/25');
  });
  it('Webull options orders: imports with 100x contract value and skips cancelled', () => {
    const csv = 'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time\n'
      + 'NVDA 251121 Call 150.00,NVDA251121C00150000,Buy,Filled,2,2,@1.20,1.20,DAY,11/03/2025 09:45:00 EST,11/03/2025 09:45:02 EST\n'
      + 'NVDA 251121 Call 150.00,NVDA251121C00150000,Sell,Filled,2,2,@1.80,1.80,DAY,11/04/2025 10:00:00 EST,11/04/2025 10:00:05 EST\n'
      + 'NVDA 251121 Call 150.00,NVDA251121C00150000,Buy,Cancelled,0,1,@1.00,,DAY,11/05/2025 10:00:00 EST,\n';
    const rows = trimToHeader(parseCsv(csv));
    const { fills } = detectAll(rows);
    const r = toFills(rows, fills);
    expect(r.items).toHaveLength(2);
    expect(r.items[0]).toMatchObject({ sym: 'NVDA 150C 11/21/25', mult: 100, qty: 2 });
    const m = mergeFills([], r.items);
    const v = viewTrade(m.trades[0]);
    expect(m.trades[0]).toMatchObject({ mult: 100, opt: { root: 'NVDA', strike: 150 } });
    expect(v.realized).toBeCloseTo((1.8 - 1.2) * 2 * 100);
  });
  it('Robinhood: option described in Description, BTO / STC codes', () => {
    const csv = 'Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount\n'
      + '11/3/2025,11/3/2025,11/4/2025,AMD,AMD 11/21/2025 Call $160.00,BTO,1,$2.10,($210.00)\n'
      + '11/4/2025,11/4/2025,11/5/2025,AMD,AMD 11/21/2025 Call $160.00,STC,1,$3.00,$300.00\n';
    const rows = trimToHeader(parseCsv(csv));
    const items = toFills(rows, detectAll(rows).fills).items;
    expect(items.map((x) => [x.sym, x.action])).toEqual([['AMD 160C 11/21/25', 'buy'], ['AMD 160C 11/21/25', 'sell']]);
  });
});
