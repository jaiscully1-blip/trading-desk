import { describe, expect, it } from 'vitest';
import { eventDayPnl } from '../src/lib/eventDayPnl';

describe('your trading on event days', () => {
  it('groups day P&L by kind of day', () => {
    const m = new Map<string, number>([['2026-10-28', -300], ['2026-11-20', 200], ['2026-11-30', 50], ['2026-11-11', 80], ['2026-11-05', 40]]);
    const g = Object.fromEntries(eventDayPnl(m).map((x) => [x.key, x]));
    expect(g.fed.days).toBe(1); expect(g.fed.total).toBe(-300);          // Oct 28 FOMC
    expect(g.expiry.days).toBe(1); expect(g.expiry.total).toBe(200);     // Nov 20 monthly expiry
    expect(g.month.days).toBe(1);                                        // Nov 30 last day of month
    expect(g.plain.days).toBe(2); expect(g.plain.avg).toBe(60);          // Nov 5, Nov 11
  });
});
