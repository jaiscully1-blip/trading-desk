import { describe, expect, it } from 'vitest';
import { detect, mergeFills, parseCsv, parseTime, toFills, toTransfers } from '../src/lib/csv';
import { etToUtc } from '../shared/clock';
import type { Trade } from '../src/lib/journal';

// Shape modeled on Webull's order-history export; real column names vary by version, which is why mapping is editable.
const WEBULL = `Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time
NVIDIA Corp,NVDA,Buy,Filled,100,100,@205.50,205.48,DAY,11/04/2026 09:41:02 EST,11/04/2026 09:41:03 EST
NVIDIA Corp,NVDA,Sell,Filled,50,50,208.00,208.02,DAY,11/04/2026 10:15:40 EST,11/04/2026 10:15:41 EST
NVIDIA Corp,NVDA,Sell,Cancelled,0,50,212.00,,GTC,11/04/2026 10:16:00 EST,
NVIDIA Corp,NVDA,Sell,Filled,50,50,207.00,206.90,DAY,11/04/2026 11:02:00 EST,11/04/2026 11:02:01 EST
"Tesla, Inc.",TSLA,Sell,Filled,20,20,250.00,250.10,DAY,11/04/2026 12:00:00 EST,11/04/2026 12:00:01 EST
"Tesla, Inc.",TSLA,Buy,Filled,20,20,248.00,247.90,DAY,11/04/2026 12:30:00 EST,11/04/2026 12:30:02 EST`;

const TRANSFERS = `Date,Type,Amount,Status
10/01/2026,Deposit,"$5,000.00",Completed
10/20/2026,Withdrawal,"($1,200.00)",Completed
10/21/2026,Dividend,$3.10,Completed`;

describe('csv', () => {
  it('parses quoted cells with commas', () => {
    const r = parseCsv('a,"b, c","d ""q"""\n1,2,3\n');
    expect(r).toEqual([['a', 'b, c', 'd "q"'], ['1', '2', '3']]);
  });

  it('parses broker timestamps as US Eastern', () => {
    expect(parseTime('11/04/2026 09:41:03 EST')).toBe(etToUtc(2026, 11, 4, 9, 41) + 3000);
    expect(parseTime('2026-07-01 09:30')).toBe(etToUtc(2026, 7, 1, 9, 30)); // EDT
    expect(parseTime('11/4/26 1:05 PM')).toBe(etToUtc(2026, 11, 4, 13, 5));
    expect(parseTime('2026-11-04T14:30:00Z')).toBe(Date.UTC(2026, 10, 4, 14, 30));
    expect(parseTime('garbage')).toBeNull();
  });

  it('detects a Webull-style fills export, prefers Filled/Avg Price/Filled Time, skips unfilled', () => {
    const rows = parseCsv(WEBULL);
    const m = detect(rows);
    expect(m.kind).toBe('fills');
    expect(rows[0][m.cols.qty!]).toBe('Filled');
    expect(rows[0][m.cols.price!]).toBe('Avg Price');
    expect(rows[0][m.cols.time!]).toBe('Filled Time');
    const r = toFills(rows, m);
    expect(r.items).toHaveLength(5);
    expect(r.skipped).toEqual([{ row: 4, why: 'status Cancelled' }]);
    expect(r.items[0]).toMatchObject({ sym: 'NVDA', action: 'buy', qty: 100, price: 205.48 });
  });

  it('detects deposits and withdrawals; ignores other cash rows', () => {
    const rows = parseCsv(TRANSFERS);
    const m = detect(rows);
    expect(m.kind).toBe('transfers');
    const r = toTransfers(rows, m);
    expect(r.items.map((x) => x.amount)).toEqual([5000, -1200]);
    expect(r.skipped).toHaveLength(1);
  });

  it('groups fills into round trips, matches a journal plan, imports the rest, and never doubles on re-import', () => {
    const fills = toFills(parseCsv(WEBULL), detect(parseCsv(WEBULL))).items;
    const plan: Trade = {
      id: 'plan', created: etToUtc(2026, 11, 4, 9, 38), updated: 0, sym: 'NVDA', side: 'long', initialStop: 203, stop: 203, stopHistory: [], target: 212, plannedSize: 100,
      thesis: 'ORB', setup: 'ORB', emotion: 'calm', grade: null, checklist: [], fills: [{ id: 'm1', t: etToUtc(2026, 11, 4, 9, 41), action: 'buy', qty: 100, price: 205.5, src: 'manual' }],
    };
    const r = mergeFills([plan], fills);
    expect(r).toMatchObject({ added: 5, matched: 1, created: 1, duplicate: 0 });
    const nv = r.trades.find((t) => t.id === 'plan')!;
    expect(nv.fills.every((f) => f.src === 'csv')).toBe(true); // broker fills replace the hand-entered one
    expect(nv.fills).toHaveLength(3);
    const ts = r.trades.find((t) => t.sym === 'TSLA')!;
    expect(ts).toMatchObject({ side: 'short', imported: true });
    const again = mergeFills(r.trades, fills);
    expect(again).toMatchObject({ added: 0, duplicate: 5 });
    expect(again.trades).toHaveLength(2);
  });
});
