import { describe, expect, it } from 'vitest';
import { barIndexFor, decode, isMacro, keywordSentiment, mergeNews, parseFeed, tagSymbols, type NewsItem } from '../shared/news';
import { parseEarningsCsv, parseIpoCsv, parseKalshiFed, avCsvError, usualMove } from '../shared/calendar';
import { barsFrom } from './helpers';

const RSS = `<?xml version="1.0"?><rss><channel><title>X</title>
<item><title><![CDATA[Nvidia beats estimates, raises outlook]]></title><link>https://ex.com/a</link><pubDate>Tue, 03 Nov 2026 21:05:00 GMT</pubDate></item>
<item><title>Fed&#39;s Powell: rates &amp; inflation</title><link>https://ex.com/b</link><pubDate>Tue, 03 Nov 2026 19:00:00 GMT</pubDate></item>
<item><title>No date</title></item>
</channel></rss>`;
const ATOM = `<feed><entry><title type="html">BLS: CPI rises 0.3%</title><link href="https://bls.gov/x"/><updated>2026-11-03T13:30:00Z</updated></entry></feed>`;

describe('feeds', () => {
  it('parses RSS 2.0 (CDATA, entities) and Atom, skipping undated items', () => {
    const r = parseFeed(RSS, 'CNBC');
    expect(r.map((x) => x.title)).toEqual(['Nvidia beats estimates, raises outlook', "Fed's Powell: rates & inflation"]);
    expect(r[0]).toMatchObject({ url: 'https://ex.com/a', t: Date.UTC(2026, 10, 3, 21, 5), src: 'CNBC' });
    expect(parseFeed(ATOM, 'BLS')[0]).toMatchObject({ title: 'BLS: CPI rises 0.3%', url: 'https://bls.gov/x' });
    expect(decode('A &#8217;B&#x27; <b>C</b>')).toBe("A ’B' C");
  });

  it('keyword sentiment, macro detection', () => {
    expect(keywordSentiment('Nvidia beats estimates, raises outlook')).toBe(1);
    expect(keywordSentiment('Tesla shares tumble after recall, analyst downgrade')).toBe(-1);
    expect(keywordSentiment('Apple to hold event on Tuesday')).toBe(0);
    expect(isMacro("Powell says inflation is cooling", 'CNBC')).toBe(true);
    expect(isMacro('Anything at all', 'Federal Reserve')).toBe(true);
    expect(isMacro('Nvidia unveils new chip', 'CNBC')).toBe(false);
  });

  it('tags tickers by $TICKER, plain symbol and company name, but not common words', () => {
    const syms = ['NVDA', 'AMD', 'ON', 'META', 'F'];
    const names = { NVDA: 'NVIDIA Corp', META: 'Meta Platforms Inc' };
    expect(tagSymbols('Nvidia and AMD rally on AI demand', syms, names).sort()).toEqual(['AMD', 'NVDA']);
    expect(tagSymbols('Stocks rise on jobs data', syms, names)).toEqual([]);
    expect(tagSymbols('$ON jumps after earnings', syms, names)).toEqual(['ON']);
    expect(tagSymbols('Meta raises capex', syms, names)).toEqual(['META']);
  });

  it('merges duplicates across feeds and keeps the union of tags', () => {
    const a: NewsItem = { id: '1', t: 2, title: 'Nvidia beats estimates!', src: 'CNBC', url: '', syms: ['NVDA'], macro: false, sentiment: 1 };
    const b: NewsItem = { ...a, id: '2', t: 1, src: 'Yahoo', title: 'Nvidia beats estimates', syms: ['SMCI'] };
    const m = mergeNews([b, a]);
    expect(m).toHaveLength(1);
    expect(m[0].syms.sort()).toEqual(['NVDA', 'SMCI']);
  });

  it('pins a headline to the candle it hit (or the next one after the close)', () => {
    const times = [100, 400, 700]; // 5-minute bars (300s)
    expect(barIndexFor(times, 300, 450)).toBe(1);
    expect(barIndexFor(times, 300, 399)).toBe(0);
    expect(barIndexFor(times, 300, 50)).toBe(-1);
    expect(barIndexFor(times, 300, 5000)).toBe(-1);
    expect(barIndexFor([0, 86400 * 3], 86400, 86400 + 100)).toBe(1); // weekend headline -> Monday's bar
  });
});

describe('calendars', () => {
  it('earnings CSV (real Alpha Vantage row) and IPO CSV; detects AV JSON notes', () => {
    const e = parseEarningsCsv('symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\r\nNVDA,NVIDIA CORPORATION,2026-11-17,2026-10-31,2.49,USD,post-market\r\n');
    expect(e).toEqual([{ sym: 'NVDA', name: 'NVIDIA CORPORATION', date: '2026-11-17', when: 'post-market', estimate: 2.49 }]);
    expect(parseIpoCsv('symbol,name,ipoDate,priceRangeLow,priceRangeHigh,currency,exchange\r\nABCD,Abcd Inc,2026-11-12,14,16,USD,NASDAQ\r\n')[0]).toMatchObject({ sym: 'ABCD', low: 14, high: 16 });
    expect(avCsvError('{"Information":"rate limit reached"}')).toBe('rate limit reached');
    expect(avCsvError('symbol,name')).toBeNull();
  });

  it('Kalshi: nearest Fed meeting, labels from ticker suffix, probability from last trade', () => {
    const o = parseKalshiFed({ markets: [
      { ticker: 'KXFEDDECISION-27JAN-H0', event_ticker: 'KXFEDDECISION-27JAN', title: 'Jan', close_time: '2027-01-27T19:00:00Z', last_price_dollars: '0.6' },
      { ticker: 'KXFEDDECISION-26DEC-H0', event_ticker: 'KXFEDDECISION-26DEC', title: 'Fed decision in Dec 2026?', close_time: '2026-12-09T19:00:00Z', last_price_dollars: '0.8700' },
      { ticker: 'KXFEDDECISION-26DEC-C25', event_ticker: 'KXFEDDECISION-26DEC', close_time: '2026-12-09T19:00:00Z', last_price_dollars: '0', yes_bid_dollars: '0.10', yes_ask_dollars: '0.12' },
      { ticker: 'KXFEDDECISION-26DEC-H25', event_ticker: 'KXFEDDECISION-26DEC', close_time: '2026-12-09T19:00:00Z', yes_sub_title: 'Hike 25bps', last_price_dollars: '0.02' },
    ] });
    expect(o!.event).toBe('KXFEDDECISION-26DEC');
    expect(o!.outcomes).toEqual([{ label: 'Hold', prob: 0.87 }, { label: 'Cut 25bp', prob: 0.11 }, { label: 'Hike 25bps', prob: 0.02 }]);
    expect(parseKalshiFed({ markets: [] })).toBeNull();
  });

  it('"what usually happens": SPY move on release days vs typical', () => {
    const closes = [100, 101, 100, 102, 100, 100.5, 100, 103, 100, 100, ...Array(30).fill(100)];
    const bars = barsFrom(closes, { end: Date.UTC(2026, 10, 3) / 1000 });
    const dayOf = (i: number) => new Date(bars[i].time * 1000).toISOString().slice(0, 10);
    const u = usualMove(bars, [dayOf(3), dayOf(7)])!; // +2% and +3% days
    expect(u.n).toBe(2);
    expect(u.avgAbsMove).toBeCloseTo((2 + 3) / 2, 1);
    expect(u.upPct).toBe(100);
    expect(u.avgAbsMove).toBeGreaterThan(u.baseline);
  });
});
