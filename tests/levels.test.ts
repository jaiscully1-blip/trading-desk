import { describe, expect, it } from 'vitest';
import { computeLevels, detectLevelEvents } from '../src/lib/levels';
import type { Bar } from '../src/types';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d) / 1000;
const at = (y: number, m: number, d: number, h: number, mi: number) => Date.UTC(y, m - 1, d, h, mi) / 1000;
const bar = (time: number, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ time, open: o, high: h, low: l, close: c, volume: v });

const daily: Bar[] = [
  bar(day(2026, 10, 30), 761.38, 761.46, 750.36, 755.72),
  bar(day(2026, 11, 2), 759.45, 763.86, 751.6, 752.1),
  bar(day(2026, 11, 3), 752.73, 757.07, 752.39, 754.35), // today's forming daily bar
];
// 2026-11-03: six 5-minute bars from 9:30
const intraday: Bar[] = [
  bar(at(2026, 11, 2, 15, 55), 752.5, 752.9, 751.9, 752.1, 5000),
  bar(at(2026, 11, 3, 9, 30), 752.73, 754.0, 752.39, 753.6, 1000),
  bar(at(2026, 11, 3, 9, 35), 753.6, 754.2, 752.9, 753.1, 1000),
  bar(at(2026, 11, 3, 9, 40), 753.1, 753.5, 752.8, 753.3, 1000),
  bar(at(2026, 11, 3, 9, 45), 753.3, 755.0, 753.2, 754.8, 1000),
  bar(at(2026, 11, 3, 9, 50), 754.8, 755.4, 754.5, 755.1, 1000),
  bar(at(2026, 11, 3, 9, 55), 755.1, 755.6, 754.9, 755.3, 1000),
];
const get = (ls: ReturnType<typeof computeLevels>, id: string) => ls.find((l) => l.id === id)!;

describe('levels', () => {
  it('prior day uses the last completed daily bar before the session, not today', () => {
    const L = computeLevels({ daily, intraday, orMinutes: 15 });
    expect(get(L, 'pdh').value).toBe(763.86);
    expect(get(L, 'pdl').value).toBe(751.6);
    expect(get(L, 'pdc').value).toBe(752.1);
  });

  it('opening range 5/15/30', () => {
    expect(get(computeLevels({ daily, intraday, orMinutes: 5 }), 'orh').value).toBe(754.0);
    const or15 = computeLevels({ daily, intraday, orMinutes: 15 });
    expect(get(or15, 'orh').value).toBe(754.2);
    expect(get(or15, 'orl').value).toBe(752.39);
    expect(get(computeLevels({ daily, intraday, orMinutes: 30 }), 'orh').value).toBe(755.6);
  });

  it('30-minute range is "forming" until 10:00', () => {
    const early = intraday.slice(0, 5); // through 9:45 bar (ends 9:50)
    const L = computeLevels({ daily, intraday: early, orMinutes: 30 });
    expect(get(L, 'orh').value).toBeNull();
    expect(get(L, 'orh').status).toBe('forming');
  });

  it('VWAP only uses the current session', () => {
    const L = computeLevels({ daily, intraday, orMinutes: 15 });
    const today = intraday.slice(1);
    const exp = today.reduce((s, b) => s + ((b.high + b.low + b.close) / 3) * b.volume, 0) / today.reduce((s, b) => s + b.volume, 0);
    expect(get(L, 'vwap').value).toBeCloseTo(exp, 6);
  });

  it('premarket levels are marked unavailable without extended-hours data', () => {
    const L = computeLevels({ daily, intraday, orMinutes: 15, hasExtendedHours: false });
    expect(get(L, 'pmh')).toMatchObject({ value: null, status: 'unavailable' });
  });

  it('before the open: prior day = yesterday, VWAP/OR forming', () => {
    const L = computeLevels({ daily: daily.slice(0, 2), intraday: intraday.slice(0, 1), orMinutes: 15, sessionDay: day(2026, 11, 3) / 86400 });
    expect(get(L, 'pdh').value).toBe(763.86);
    expect(get(L, 'vwap').status).toBe('forming');
    expect(get(L, 'orh').status).toBe('forming');
  });
});

describe('level alerts', () => {
  const levels = [{ id: 'pdh' as const, label: 'PDH', value: 100 }];
  it('break when price crosses', () => {
    expect(detectLevelEvents('SPY', 99.5, 100.5, levels)).toEqual([{ sym: 'SPY', id: 'pdh', kind: 'break', dir: 'up', level: 100, price: 100.5 }]);
    expect(detectLevelEvents('SPY', 100.5, 99.5, levels)[0]).toMatchObject({ kind: 'break', dir: 'down' });
  });
  it('touch when price arrives within tolerance (0.02%)', () => {
    expect(detectLevelEvents('SPY', 99.5, 99.99, levels)[0]).toMatchObject({ kind: 'touch' });
  });
  it('nothing when price stays away or stays at the level', () => {
    expect(detectLevelEvents('SPY', 98, 99, levels)).toEqual([]);
    expect(detectLevelEvents('SPY', 99.99, 100.01, levels)).toEqual([]);
  });
});
