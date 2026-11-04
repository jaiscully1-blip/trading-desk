import { describe, expect, it } from 'vitest';
import { clock, etToUtc } from '../shared/clock';
import { nextRefreshMs, patchWithQuote } from '../src/data/live';
import { encodeEtWall } from '../shared/parse';
import type { Bar, QuoteResult } from '../src/types';

describe('market clock', () => {
  it('converts ET to UTC on both sides of DST', () => {
    expect(etToUtc(2026, 11, 3, 9, 30)).toBe(Date.UTC(2026, 10, 3, 14, 30)); // EST
    expect(etToUtc(2026, 10, 30, 9, 30)).toBe(Date.UTC(2026, 9, 30, 13, 30)); // EDT
  });
  it('modes by Eastern time', () => {
    const at = (h: number, m: number) => clock(etToUtc(2026, 11, 4, h, m)); // Wednesday
    expect(at(5, 0).mode).toBe('pre');
    expect(at(9, 45).mode).toBe('open');
    expect(at(12, 0).mode).toBe('midday');
    expect(at(15, 30).mode).toBe('power');
    expect(at(17, 0).mode).toBe('after');
    expect(at(9, 45).toClose).toBe(6 * 3600 + 15 * 60);
  });
  it('weekend counts down to Monday open', () => {
    const c = clock(etToUtc(2026, 11, 7, 12, 0)); // Saturday noon
    expect(c.session).toBe('Closed');
    expect(c.toOpen).toBe((24 + 21) * 3600 + 30 * 60);
  });
});

describe('quote patching between candle refreshes', () => {
  const q = (t: number, last: number): QuoteResult => ({ symbol: 'SPY', last, prevClose: 750, chgPct: 0, open: 752, high: 760, low: 748, t, source: 'Finnhub', freshness: 'live' });
  const bars: Bar[] = [{ time: encodeEtWall('2026-11-04 10:00:00'), open: 750, high: 751, low: 749, close: 750.5, volume: 1000 }];

  it('updates the forming 5m bar', () => {
    const out = patchWithQuote(bars, q(etToUtc(2026, 11, 4, 10, 3), 752), '5m');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ close: 752, high: 752, low: 749, volume: 1000 });
  });
  it('starts the next 5m bar at its slot boundary', () => {
    const out = patchWithQuote(bars, q(etToUtc(2026, 11, 4, 10, 7) + 30_000, 748), '5m');
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({ time: encodeEtWall('2026-11-04 10:05:00'), open: 748, volume: 0 });
  });
  it('updates today\'s daily bar with quote high/low', () => {
    const d: Bar[] = [{ time: encodeEtWall('2026-11-04'), open: 752, high: 755, low: 751, close: 753, volume: 1 }];
    expect(patchWithQuote(d, q(etToUtc(2026, 11, 4, 11, 0), 754), 'D')[0]).toMatchObject({ close: 754, high: 760, low: 748 });
  });
  it('refreshes 5m candles 20s after each bar closes during the session', () => {
    expect(nextRefreshMs('5m', etToUtc(2026, 11, 4, 10, 2))).toBe(3 * 60_000 + 20_000);
    expect(nextRefreshMs('5m', etToUtc(2026, 11, 4, 20, 0))).toBe(30 * 60_000);
  });
});
