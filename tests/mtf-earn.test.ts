import { describe, expect, it } from 'vitest';
import { shapeBars } from '../shared/mtf';
import { earningsWindow, parseExtMove } from '../shared/extMove';
import type { EarnItem } from '../shared/eventsCal';

const day = Date.UTC(2026, 10, 11) / 1000; // exchange-local seconds at midnight
const bar = (sod: number, o: number, c: number, v = 10) => ({ time: day + sod, open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: v });

describe('multi-timeframe bars', () => {
  it('builds 3-minute bars aligned to 9:30 and 4-hour bars split at 13:30', () => {
    const ones = Array.from({ length: 7 }, (_, i) => bar(34200 + i * 60, 100 + i, 101 + i));
    const three = shapeBars(ones, '3m');
    expect(three.map((b) => b.time - day)).toEqual([34200, 34380, 34560]);
    expect(three[0]).toMatchObject({ open: 100, close: 103, volume: 30 });
    const hours = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5].map((h, i) => bar(h * 3600, 10 + i, 11 + i));
    const four = shapeBars(hours, '4h');
    expect(four.map((b) => (b.time - day) / 3600)).toEqual([9.5, 13.5]);
    expect(four[1]).toMatchObject({ open: 14, close: 17 });
  });
});

describe('after-hours and premarket moves', () => {
  const chart = (closes: [number, number][], price: number) => ({ chart: { result: [{ meta: { regularMarketPrice: price, currentTradingPeriod: { regular: { start: 1000, end: 2000 } } }, timestamp: closes.map((c) => c[0]), indicators: { quote: [{ close: closes.map((c) => c[1]), volume: closes.map(() => 5) }] } }] } });
  it('reads the latest extended-hours trade against the regular close', () => {
    expect(parseExtMove('X', chart([[1500, 10], [1990, 10], [2300, 9.2]], 10))).toMatchObject({ ext: 9.2, session: 'post', chgPct: expect.any(Number) });
    expect(parseExtMove('X', chart([[1500, 10], [1990, 10]], 10))).toMatchObject({ ext: null, session: null });
    expect(parseExtMove('X', chart([[-5000, 9], [900, 11]], 10))).toMatchObject({ ext: 11, session: 'pre' });
  });
  it('picks tonight and tomorrow morning by the clock', () => {
    const e = (sym: string, date: string, when: EarnItem['when']) => ({ sym, date, when } as EarnItem);
    const rows = [e('A', '2026-11-10', 'amc'), e('B', '2026-11-11', 'bmo'), e('C', '2026-11-11', 'amc'), e('D', '2026-11-12', 'bmo')];
    const days = ['2026-11-10', '2026-11-11', '2026-11-12'];
    const pre = earningsWindow(rows, days, '2026-11-11', 8 * 60);
    expect([pre.tonight.rows[0].sym, pre.morning.rows[0].sym]).toEqual(['A', 'B']);
    const eve = earningsWindow(rows, days, '2026-11-11', 17 * 60);
    expect([eve.tonight.rows[0].sym, eve.morning.rows[0].sym]).toEqual(['C', 'D']);
  });
});
