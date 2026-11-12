import { describe, expect, it } from 'vitest';
import { dayFibs, priorDayHL } from '../shared/dayfib';
import { tradeDay } from '../src/components/JournalCalendar';
import type { TradeView } from '../src/lib/journal';

describe('day fib levels', () => {
  it('retracements from the high, extensions beyond both ends', () => {
    const f = dayFibs(110, 100);
    const at = (label: string) => f.find((x) => x.label === label)!.price;
    expect(at('Fib 50')).toBeCloseTo(105);
    expect(at('Fib 61.8')).toBeCloseTo(103.82);
    expect(at('Fib 23.6')).toBeCloseTo(107.64);
    expect(at('Fib 1.618 ↑')).toBeCloseTo(116.18);
    expect(at('Fib 1.618 ↓')).toBeCloseTo(93.82);
    expect(f[0].price).toBeGreaterThan(f[f.length - 1].price); // highest first
    expect(dayFibs(100, 100)).toEqual([]);
  });
  it('prior session high / low from intraday or daily bars', () => {
    const t = (d: string, h: number) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`) / 1000;
    const bars = [{ time: t('2026-11-10', 10), high: 101, low: 99 }, { time: t('2026-11-10', 15), high: 104, low: 98 }, { time: t('2026-11-11', 10), high: 107, low: 103 }];
    expect(priorDayHL(bars)).toEqual({ high: 104, low: 98, day: '2026-11-10' });
    expect(priorDayHL(bars.slice(0, 2))).toBeNull(); // one session only
  });
});

describe('journal calendar day', () => {
  const v = (p: Partial<TradeView>, opt?: TradeView['t']['opt']): TradeView => ({ t: { id: 'x', sym: 'SPY', side: 'long', opt, fills: [] } as unknown as TradeView['t'], status: 'closed', openQty: 0, maxQty: 1, avgEntry: 1, avgExit: 1, openedAt: Date.parse('2026-11-10T15:00:00Z'), closedAt: Date.parse('2026-11-12T19:00:00Z'), realized: 10, fees: 0, risk: null, r: null, events: [], ...p });
  it('closed trades sit on their close day, open options on expiry, open shares on the open day', () => {
    expect(tradeDay(v({}), 'close')).toBe('2026-11-12');
    expect(tradeDay(v({}), 'open')).toBe('2026-11-10');
    expect(tradeDay(v({ status: 'open', closedAt: null }, { root: 'SPY', type: 'call', strike: 600, expiry: '2026-11-20' }), 'close')).toBe('2026-11-20');
    expect(tradeDay(v({ status: 'open', closedAt: null }), 'close')).toBe('2026-11-10');
  });
});
