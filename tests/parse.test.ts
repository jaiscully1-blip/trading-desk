import { describe, expect, it } from 'vitest';
import av from './fixtures/alphavantage-daily-spy.json';
import td from './fixtures/twelvedata-5min.json';
import fh from './fixtures/finnhub-quote.json';
import fred from './fixtures/fred-dgs10.json';
import { ProviderError, encodeEtWall, encodeInstant, parseAlphaDaily, parseFinnhubQuote, parseFredLatest, parseTwelveQuote, parseTwelveSeries } from '../shared/parse';

describe('Alpha Vantage daily (real response captured 2026-11-03)', () => {
  it('parses and sorts ascending', () => {
    const b = parseAlphaDaily(av);
    expect(b).toHaveLength(5);
    expect(b[0].time).toBe(Date.UTC(2026, 9, 28) / 1000);
    expect(b.at(-1)).toEqual({ time: Date.UTC(2026, 10, 3) / 1000, open: 752.73, high: 757.07, low: 752.39, close: 754.35, volume: 32891580 });
  });
  it('flags premium and rate-limit responses', () => {
    const prem = (() => { try { parseAlphaDaily({ Information: 'Thank you for using Alpha Vantage! This is a premium endpoint.' }); } catch (e) { return e as ProviderError; } })();
    expect(prem?.notOnFreeTier).toBe(true);
    const rl = (() => { try { parseAlphaDaily({ Note: 'Our standard API rate limit is 25 requests per day.' }); } catch (e) { return e as ProviderError; } })();
    expect(rl?.retryable).toBe(true);
  });
});

describe('Twelve Data', () => {
  it('parses time_series (newest-first) into ascending ET-encoded bars', () => {
    const b = parseTwelveSeries(td);
    expect(b.map((x) => x.time)).toEqual([
      encodeEtWall('2026-11-02 15:55:00'), encodeEtWall('2026-11-03 09:30:00'), encodeEtWall('2026-11-03 09:35:00'), encodeEtWall('2026-11-03 09:40:00'),
    ]);
    expect(b[1]).toMatchObject({ open: 752.73, high: 754, low: 752.39, close: 753.6, volume: 1_400_000 });
  });
  it('throws a retryable error on 429', () => {
    try { parseTwelveSeries({ code: 429, message: 'You have run out of API credits for the current minute.', status: 'error' }); expect.unreachable(); }
    catch (e) { expect((e as ProviderError).retryable).toBe(true); }
  });
  it('parses single and batch quotes', () => {
    const one = { symbol: 'SPY', open: '752.73', high: '757.07', low: '752.39', close: '754.35', previous_close: '752.10', percent_change: '0.29916', timestamp: 1793739600 };
    expect(parseTwelveQuote(one, 'SPY')).toMatchObject({ last: 754.35, prevClose: 752.1, chgPct: 0.29916, t: 1793739600000 });
    expect(parseTwelveQuote({ SPY: one, QQQ: { ...one, symbol: 'QQQ' } }, 'QQQ').symbol).toBe('QQQ');
  });
});

describe('Finnhub quote', () => {
  it('maps c/dp/pc/t', () => {
    expect(parseFinnhubQuote(fh, 'SPY')).toMatchObject({ last: 754.35, chgPct: 0.2992, prevClose: 752.1, high: 757.07, t: 1793739600000, source: 'Finnhub' });
  });
  it('rejects an unknown symbol (all zeros)', () => {
    expect(() => parseFinnhubQuote({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }, 'ZZZZ')).toThrow(/no data/);
  });
});

describe('FRED', () => {
  it('skips "." missing values and returns latest + previous', () => {
    expect(parseFredLatest(fred)).toEqual({ value: 4.21, prev: 4.18, date: '2026-11-02' });
  });
});

describe('time encoding', () => {
  it('encodes a real instant as ET wall clock across DST', () => {
    // 2026-11-03 14:30 UTC = 09:30 EST
    expect(encodeInstant(Date.UTC(2026, 10, 3, 14, 30))).toBe(encodeEtWall('2026-11-03 09:30:00'));
    // 2026-07-01 13:30 UTC = 09:30 EDT
    expect(encodeInstant(Date.UTC(2026, 6, 1, 13, 30))).toBe(encodeEtWall('2026-07-01 09:30:00'));
  });
});
