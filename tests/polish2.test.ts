import { afterEach, describe, expect, it } from 'vitest';
import { tokenInfo, tokenMessage } from '../shared/webull';
import { DAY_LEVEL_IDS, levelsForHours, toolHours } from '../shared/toolHours';
import { etToUtc } from '../shared/clock';
import { resetMarketCalendar } from '../shared/marketCalendar';
import { beltOrder, splitBelt, toFront } from '../shared/belt';
import { makeCandles } from '../src/lib/demo';

afterEach(() => resetMarketCalendar());
const hrs = (mo: number, d: number, h: number, mi = 0) => toolHours(etToUtc(2026, mo, d, h, mi));

describe('Webull token flow', () => {
  it('reads token and status at the top level or under data', () => {
    expect(tokenInfo({ token: 'abc', status: 'pending', expires: 1700000000000 })).toEqual({ token: 'abc', status: 'PENDING', expires: 1700000000000 });
    expect(tokenInfo({ data: { token: 'abc', status: 'NORMAL' } })).toMatchObject({ token: 'abc', status: 'NORMAL' });
    expect(tokenInfo(null)).toEqual({ token: undefined, status: undefined, expires: undefined });
  });
  it('gives a plain-English line for each status', () => {
    expect(tokenMessage('NORMAL').ok).toBe(true);
    expect(tokenMessage('PENDING').text).toMatch(/Not approved yet/);
    expect(tokenMessage('EXPIRED').text).toMatch(/Create token/);
    expect(tokenMessage(undefined).ok).toBe(false);
  });
});

describe('time-of-day chart tools', () => {
  it('ORH / ORL appear at 9:45 ET and not before', () => {
    expect(hrs(11, 4, 9, 44).orReady).toBe(false);
    expect(hrs(11, 4, 9, 45).orReady).toBe(true);
    expect(hrs(11, 4, 9, 44).regular).toBe(true);
  });
  it('day tools show only in regular hours; after hours switches to long-term', () => {
    expect(hrs(11, 4, 12).phase).toBe('day');
    expect(hrs(11, 4, 8).phase).toBe('long'); // pre-market
    expect(hrs(11, 4, 16, 1).phase).toBe('long');
    expect(hrs(11, 7, 12).phase).toBe('long'); // Saturday
    expect(hrs(11, 26, 12).phase).toBe('long'); // Thanksgiving
    expect(hrs(11, 27, 13, 5).phase).toBe('long'); // early close day, after 1 PM
    expect(hrs(11, 27, 12, 30).phase).toBe('day');
  });
  it('filters levels by the clock; prior-day levels always stay', () => {
    const all = ['pdh', 'pdl', 'pdc', 'pmh', 'pml', 'vwap', 'orh', 'orl'].map((id) => ({ id }));
    const ids = (h: ReturnType<typeof toolHours>) => levelsForHours(all, h).map((l) => l.id);
    expect(ids(hrs(11, 4, 9, 40))).toEqual(['pdh', 'pdl', 'pdc', 'pmh', 'pml', 'vwap']);
    expect(ids(hrs(11, 4, 10))).toEqual(all.map((l) => l.id));
    expect(ids(hrs(11, 4, 17))).toEqual(['pdh', 'pdl', 'pdc']);
    expect([...DAY_LEVEL_IDS].sort()).toEqual(['orh', 'orl', 'pmh', 'pml', 'vwap']);
  });
});

describe('filter conveyor belt', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  it('shows the first few and keeps the rest in More', () => {
    const { shown, more } = splitBelt(items, beltOrder([], items.map((i) => i.id)), 3);
    expect(shown.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(more.map((x) => x.id)).toEqual(['d', 'e']);
  });
  it('a picked one jumps to the front and the last visible rolls off', () => {
    const o = toFront(['a', 'b', 'c', 'd', 'e'], 'e');
    expect(o).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(splitBelt(items, o, 3).shown.map((x) => x.id)).toEqual(['e', 'a', 'b']);
  });
  it('a newly added one goes to the front; removed ones drop out', () => {
    expect(beltOrder(['a', 'b', 'c'], ['a', 'b', 'c', 'n'])).toEqual(['n', 'a', 'b', 'c']);
    expect(beltOrder(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });
});

describe('15-minute timeframe', () => {
  it('demo candles are on a 15-minute grid', () => {
    const bars = makeCandles('SPY', '15m', 600);
    expect(bars.length).toBeGreaterThan(10);
    expect(bars.every((b) => (b.time / 60) % 15 === 0)).toBe(true);
  });
});
