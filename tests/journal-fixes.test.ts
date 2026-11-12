import { describe, expect, it } from 'vitest';
import { detect, mergeFills, parseCsv, toFills } from '../src/lib/csv';
import { buildRecap, liveRecaps } from '../src/lib/recap';
import { DEFAULT_SETTINGS, guard, openRisk, viewTrade, violations, type Trade } from '../src/lib/journal';

// these fixtures are dated around Nov 10, 2026: view them as of then, so options don't hit the after-expiry rule as real time passes
const AS_OF = Date.parse('2026-11-10T20:00:00Z');
const vt = (t: Trade) => viewTrade(t, { now: AS_OF });
import { etToUtc } from '../shared/clock';

const HEAD = 'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time';
const fills = (csv: string) => { const rows = parseCsv(csv); return toFills(rows, detect(rows)).items; };
const BUY = `${HEAD}\nSPY Put,SPY261111P00742000,Buy,Filled,2,2,1.50,1.50,DAY,11/10/2026 10:00:00 EST,11/10/2026 10:00:01 EST`;
const SELL = `${HEAD}\nSPY Put,SPY261111P00742000,Sell,Filled,2,2,2.25,2.25,DAY,11/11/2026 11:00:00 EST,11/11/2026 11:00:01 EST`;

describe('broker CSV added late', () => {
  it('an option bought one day and still open gives a recap that says so, not a blank one', () => {
    const { trades } = mergeFills([], fills(BUY));
    const vs = trades.map((t) => vt(t));
    const r = buildRecap('2026-11-10', vs, violations(vs, [], DEFAULT_SETTINGS, []), undefined)!;
    expect(r).toMatchObject({ trades: 0, opened: 1, pnl: 0, winRate: null });
    expect(r.open).toHaveLength(1);
    expect(r.lesson).toMatch(/Every trade goes through the ticket|opened/i);
  });
  it('the sell arriving in a later file closes the same trade (no phantom short), and the recap for that day updates', () => {
    const a = mergeFills([], fills(BUY));
    const b = mergeFills(a.trades, fills(SELL));
    const live = b.trades.filter((t) => !t.deleted);
    expect(live).toHaveLength(1);
    const vs = live.map((t) => vt(t));
    expect(vs[0]).toMatchObject({ status: 'closed' });
    expect(vs[0].realized).toBeCloseTo((2.25 - 1.5) * 2 * 100, 6);
    const stored = [buildRecap('2026-11-10', a.trades.map((t) => vt(t)), [], undefined)!]; // the card made before the sell was imported
    const all = liveRecaps(stored, vs, violations(vs, [], DEFAULT_SETTINGS, []), '2026-11-12', undefined, false);
    expect(all.map((r) => r.day)).toEqual(['2026-11-11', '2026-11-10']);
    expect(all[0]).toMatchObject({ trades: 1, pnl: 150, winRate: 100 });
    expect(all[1]).toMatchObject({ trades: 0, opened: 1 });
    expect(all[1].open).toEqual([]); // no longer open now that the exit is in
    expect(all[1].created).toBe(stored[0].created);
  });
  it('importing the same file twice adds nothing', () => {
    const a = mergeFills([], fills(BUY));
    const b = mergeFills(a.trades, fills(BUY));
    expect(b.duplicate).toBe(1);
    expect(b.trades).toHaveLength(1);
  });
  it('keeps the filled part of a cancelled order and still skips an unfilled one', () => {
    const csv = `${HEAD}\nNVIDIA,NVDA,Buy,Cancelled,30,100,205.00,205.10,DAY,11/04/2026 09:41:02 EST,11/04/2026 09:41:03 EST\nNVIDIA,NVDA,Buy,Cancelled,0,50,212.00,,GTC,11/04/2026 10:16:00 EST,`;
    const f = fills(csv);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ sym: 'NVDA', qty: 30, action: 'buy' });
  });
});

describe('risk maths with options and missing stops', () => {
  const opt: Trade = mergeFills([], fills(BUY)).trades[0];
  it('a long option with no stop risks the premium paid, times 100', () => {
    expect(openRisk(vt(opt))).toBeCloseTo(1.5 * 2 * 100, 6);
  });
  it('a stock with no stop is still unbounded, and a stop on an option counts the multiplier', () => {
    const stock: Trade = { ...opt, id: 's', sym: 'AAA', opt: undefined, mult: undefined, fills: [{ id: 'x', t: etToUtc(2026, 11, 10, 10, 0), action: 'buy', qty: 10, price: 100, src: 'manual' }] };
    expect(openRisk(vt(stock))).toBe(Infinity);
    expect(openRisk(vt({ ...opt, stop: 1.0 }), 1.5)).toBeCloseTo(0.5 * 2 * 100, 6);
  });
  it('a max daily loss of 0 means no limit, not locked all day', () => {
    const g = guard([], [], { ...DEFAULT_SETTINGS, startBalance: 10_000, maxDailyLossPct: 0 }, etToUtc(2026, 11, 10, 11, 0));
    expect(g.lockout).toBe('Clear');
  });
});
