import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import av from './fixtures/alphavantage-daily-spy.json';
import td from './fixtures/twelvedata-5min.json';
import fh from './fixtures/finnhub-quote.json';
import fred from './fixtures/fred-dgs10.json';
import { GET as candles } from '../api/candles';
import { GET as quotes } from '../api/quotes';
import { GET as macro } from '../api/macro';
import { GET as health } from '../api/health';
import { _clearCache, _resetLimits } from '../api/_lib/core';

type Route = (url: URL) => { status?: number; body: unknown } | undefined;
let routes: Route[] = [];
const calls: string[] = [];

beforeEach(() => {
  _clearCache();
  _resetLimits();
  routes = [];
  calls.length = 0;
  process.env.TWELVEDATA_API_KEY = 'td-key';
  process.env.FINNHUB_API_KEY = 'fh-key';
  process.env.ALPHAVANTAGE_API_KEY = 'av-key';
  process.env.FRED_API_KEY = 'fred-key';
  vi.stubGlobal('fetch', async (input: string) => {
    const u = new URL(input);
    calls.push(u.host + u.pathname);
    for (const r of routes) {
      const hit = r(u);
      if (hit) return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('not found', { status: 404 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const req = (p: string) => new Request(`http://x${p}`);

describe('/api/candles', () => {
  it('uses Twelve Data first and sets CDN cache headers', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: td } : undefined));
    const r = await candles(req('/api/candles?symbol=spy&tf=5m'));
    const j = await r.json();
    expect(r.status).toBe(200);
    expect(j).toMatchObject({ symbol: 'SPY', tf: '5m', source: 'Twelve Data', freshness: 'live' });
    expect(j.bars).toHaveLength(4);
    expect(r.headers.get('cache-control')).toMatch(/s-maxage=\d+/);
    // keys are never echoed back
    expect(JSON.stringify(j)).not.toContain('td-key');
  });

  it('falls back to Alpha Vantage for daily when Twelve Data is out of credits', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: { code: 429, message: 'out of credits', status: 'error' } } : undefined));
    routes.push((u) => (u.host === 'www.alphavantage.co' ? { body: av } : undefined));
    const j = await (await candles(req('/api/candles?symbol=SPY&tf=D'))).json();
    expect(j).toMatchObject({ source: 'Alpha Vantage', freshness: 'eod' });
    expect(j.bars.at(-1).close).toBe(754.35);
  });

  it('has no free fallback for intraday (Alpha Vantage intraday and Finnhub candles are premium)', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { status: 500, body: {} } : undefined));
    const r = await candles(req('/api/candles?symbol=SPY&tf=5m'));
    expect(r.status).toBe(503);
    expect(calls.every((c) => c.startsWith('api.twelvedata.com'))).toBe(true);
  });

  it('serves the cached series once and does not refetch inside the TTL', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: td } : undefined));
    await candles(req('/api/candles?symbol=SPY&tf=5m'));
    await candles(req('/api/candles?symbol=SPY&tf=5m'));
    expect(calls).toHaveLength(1);
  });

  it('reports a missing key clearly', async () => {
    delete process.env.TWELVEDATA_API_KEY;
    const j = await (await candles(req('/api/candles?symbol=SPY&tf=1H'))).json();
    expect(j.error).toMatch(/TWELVEDATA_API_KEY/);
  });

  it('rejects bad input', async () => {
    expect((await candles(req('/api/candles?symbol=../etc&tf=5m'))).status).toBe(400);
    expect((await candles(req('/api/candles?symbol=SPY&tf=1m'))).status).toBe(400);
  });

  it('respects the Twelve Data per-minute budget (7 of 8 credits)', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: td } : undefined));
    const syms = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const res = await Promise.all(syms.map((s) => candles(req(`/api/candles?symbol=${s}&tf=5m`))));
    expect(res.filter((r) => r.status === 200)).toHaveLength(7);
    expect(calls).toHaveLength(7);
  });
});

describe('/api/quotes', () => {
  it('uses Finnhub per symbol', async () => {
    routes.push((u) => (u.host === 'finnhub.io' ? { body: { ...fh, c: u.searchParams.get('symbol') === 'QQQ' ? 680 : fh.c } } : undefined));
    const j = await (await quotes(req('/api/quotes?symbols=SPY,QQQ'))).json();
    expect(j.quotes.map((q: { symbol: string; last: number }) => [q.symbol, q.last])).toEqual([['SPY', 754.35], ['QQQ', 680]]);
    expect(j.missing).toEqual([]);
  });

  it('falls back to Twelve Data batch quote when Finnhub fails', async () => {
    routes.push((u) => (u.host === 'finnhub.io' ? { status: 429, body: {} } : undefined));
    const one = { symbol: 'SPY', open: '1', high: '2', low: '1', close: '1.5', previous_close: '1', percent_change: '50', timestamp: 1793739600 };
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: one } : undefined));
    const j = await (await quotes(req('/api/quotes?symbols=SPY'))).json();
    expect(j.quotes[0]).toMatchObject({ symbol: 'SPY', source: 'Twelve Data', last: 1.5 });
  });
});

describe('/api/macro and /api/health', () => {
  it('reads VIX and 10Y from FRED as end-of-day', async () => {
    routes.push((u) => (u.host === 'api.stlouisfed.org' ? { body: fred } : undefined));
    const j = await (await macro()).json();
    expect(j).toMatchObject({ freshness: 'eod', tnx: { value: 4.21, prev: 4.18 } });
  });
  it('health lists which keys exist, never the keys', async () => {
    delete process.env.FRED_API_KEY;
    const j = await (await health()).json();
    expect(j.providers).toEqual({ twelvedata: true, finnhub: true, alphavantage: true, fred: false, sec: false, gemini: false, alpaca: false });
    expect(JSON.stringify(j)).not.toMatch(/key/);
  });
});

import { GET as scan } from '../api/scan';
import { GET as moversApi } from '../api/movers';
import moversFx from './fixtures/alphavantage-movers.json';
import { barsFrom, ramp } from './helpers';

const tdDaily = (closes: number[]) => ({
  meta: { symbol: 'X', interval: '1day' },
  status: 'ok',
  values: barsFrom(closes).reverse().map((b) => ({ datetime: new Date(b.time * 1000).toISOString().slice(0, 10), open: String(b.open), high: String(b.high), low: String(b.low), close: String(b.close), volume: String(b.volume) })),
});

describe('/api/scan', () => {
  it('fills progressively within the per-minute budget (leaving 2 credits for charts) and never uses Alpha Vantage', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: tdDaily(ramp(50, 100, 120)) } : undefined));
    routes.push((u) => (u.host === 'api.finra.org' ? { body: [{ symbolCode: 'AAA', currentShortPositionQuantity: 5e6, daysToCoverQuantity: 6, changePercent: 10, settlementDate: '2026-10-31' }] } : undefined));
    routes.push((u) => (u.pathname.endsWith('/company-news') ? { body: [{ datetime: Math.floor(Date.now() / 1000) - 3600, headline: 'AAA wins contract', id: 1 }] } : undefined));
    routes.push((u) => (u.pathname.endsWith('/profile2') ? { body: { name: 'Acme', shareOutstanding: 25 } } : undefined));
    const r = await scan(req('/api/scan?symbols=AAA,BBB,CCC,DDD,EEE,FFF,GGG'));
    const j = await r.json();
    expect(j.rows.map((x: { sym: string }) => x.sym)).toEqual(['SPY', 'AAA', 'BBB', 'CCC', 'DDD']); // 5 of 7/min
    expect(j.pending).toEqual(['EEE', 'FFF', 'GGG']);
    expect(calls.some((c) => c.includes('alphavantage'))).toBe(false);
    const aaa = j.rows.find((x: { sym: string }) => x.sym === 'AAA');
    expect(aaa.si).toMatchObject({ daysToCover: 6, pctOut: 20 });
    expect(aaa.catalyst).toMatchObject({ count: 1, latest: 'AAA wins contract' });
    expect(j.rows.find((x: { sym: string }) => x.sym === 'BBB').si).toBeNull(); // looked up, not reported
    expect(r.headers.get('cache-control')).toBe('no-store'); // incomplete scans aren't cached at the CDN
  });

  it('marks short interest unavailable (undefined) when FINRA is down', async () => {
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: tdDaily(ramp(50, 100, 120)) } : undefined));
    routes.push((u) => (u.host === 'api.finra.org' ? { status: 500, body: {} } : undefined));
    const j = await (await scan(req('/api/scan?symbols=AAA'))).json();
    expect(j.siSource).toBeNull();
    expect('si' in j.rows[1]).toBe(false);
  });
});

describe('/api/movers', () => {
  it('filters to plain tickers ≥ $2 with ≥ 500k volume', async () => {
    routes.push((u) => (u.host === 'www.alphavantage.co' ? { body: moversFx } : undefined));
    const j = await (await moversApi(req('/api/movers'))).json();
    expect(j.movers.map((m: { sym: string }) => m.sym)).toEqual(['CHSN', 'RDAC', 'PARA', 'INTC', 'NVDA', 'SOXL']);
  });
});

import { GET as newsApi } from '../api/news';
import { GET as calApi } from '../api/calendar';

describe('/api/news', () => {
  it('merges RSS + Finnhub, tags, reports failing feeds without failing', async () => {
    const rss = `<rss><channel><item><title>Nvidia beats estimates</title><link>https://x/1</link><pubDate>${new Date(Date.now() - 3600e3).toUTCString()}</pubDate></item></channel></rss>`;
    routes.push((u) => (u.host === 'search.cnbc.com' ? { body: undefined as unknown } : undefined));
    routes.push((u) => (u.host === 'finnhub.io' && u.pathname.endsWith('/news') ? { body: [{ datetime: Math.floor(Date.now() / 1000) - 600, headline: 'Fed holds rates steady', id: 1, source: 'Reuters', url: 'https://x/2' }] } : undefined));
    routes.push((u) => (u.host === 'finnhub.io' && u.pathname.endsWith('/company-news') ? { body: [{ datetime: Math.floor(Date.now() / 1000) - 1200, headline: 'Supplier deal announced', id: 2, source: 'X', url: 'https://x/3' }] } : undefined));
    routes.push((u) => (u.host === 'finnhub.io' && u.pathname.endsWith('/profile2') ? { body: u.searchParams.get('symbol') === 'NVDA' ? { name: 'NVIDIA Corp', shareOutstanding: 24300 } : { name: 'Advanced Micro Devices Inc' } } : undefined));
    // text feeds: stub fetch returns JSON-encoded bodies, so route the RSS through a raw Response
    vi.stubGlobal('fetch', async (input: string) => {
      const u = new URL(input);
      calls.push(u.host + u.pathname);
      if (u.host === 'feeds.content.dowjones.io') return new Response(rss, { status: 200 });
      if (u.host === 'www.bls.gov') return new Response('forbidden', { status: 403 });
      for (const r of routes) { const hit = r(u); if (hit && hit.body !== undefined) return new Response(JSON.stringify(hit.body), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return new Response('nope', { status: 404 });
    });
    const j = await (await newsApi(req('/api/news?symbols=NVDA,AMD'))).json();
    const titles = j.items.map((x: { title: string }) => x.title);
    expect(titles).toEqual(['Fed holds rates steady', 'Supplier deal announced', 'Nvidia beats estimates']);
    expect(j.items.find((x: { title: string }) => x.title === 'Supplier deal announced').syms).toContain('NVDA'); // explicit company-news symbol
    expect(j.items[0]).toMatchObject({ macro: true });
    expect(j.items[2]).toMatchObject({ syms: ['NVDA'], sentiment: 1, src: 'MarketWatch' });
    const bls = j.sources.find((s: { name: string }) => s.name === 'BLS');
    expect(bls).toMatchObject({ ok: false });
  });
});

describe('/api/calendar', () => {
  it('builds econ events with SPY history, Kalshi odds, earnings for my tickers; one failure doesn’t sink the rest', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
    routes.push((u) => (u.pathname === '/fred/releases' ? { body: { releases: [{ id: 10, name: 'Consumer Price Index' }, { id: 50, name: 'Employment Situation' }] } } : undefined));
    routes.push((u) => (u.pathname === '/fred/release/dates' ? { body: { release_dates: [{ date: '2026-09-11' }, { date: '2026-10-15' }, { date: future }] } } : undefined));
    routes.push((u) => (u.host === 'api.twelvedata.com' ? { body: tdDaily(ramp(600, 760, 120)) } : undefined));
    routes.push((u) => (u.host === 'external-api.kalshi.com' ? { body: { markets: [{ ticker: 'KXFEDDECISION-26DEC-H0', event_ticker: 'KXFEDDECISION-26DEC', title: 'Fed decision in Dec 2026?', close_time: '2026-12-09T19:00:00Z', last_price_dollars: '0.87' }] } } : undefined));
    vi.stubGlobal('fetch', async (input: string) => {
      const u = new URL(input);
      if (u.host === 'www.alphavantage.co' && u.searchParams.get('function') === 'EARNINGS_CALENDAR')
        return new Response(`symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay\r\nNVDA,NVIDIA CORPORATION,${future},2026-10-31,2.49,USD,post-market\r\nZZZZ,Other,${future},2026-10-31,,USD,pre-market\r\n`);
      if (u.host === 'www.alphavantage.co') return new Response('{"Information":"We have detected your API key and our standard API rate limit is 25 requests per day."}');
      for (const r of routes) { const hit = r(u); if (hit) return new Response(JSON.stringify(hit.body), { status: 200, headers: { 'content-type': 'application/json' } }); }
      return new Response('nope', { status: 404 });
    });
    const j = await (await calApi(req('/api/calendar?symbols=NVDA'))).json();
    expect(j.econ.map((e: { label: string; date: string }) => [e.label, e.date])).toEqual([['CPI', future], ['Jobs report (NFP)', future]]);
    expect(j.odds.outcomes[0]).toEqual({ label: 'Hold', prob: 0.87 });
    expect(j.earnings.mine.map((e: { sym: string }) => e.sym)).toEqual(['NVDA']);
    expect(j.earnings.week.length).toBe(2);
    expect(j.ipos).toBeNull();
    expect(j.errors.ipos).toMatch(/25 requests per day/);
    expect(j.fomc.length).toBeGreaterThan(8);
    expect(today).toBeTruthy();
  });
});

describe('/api/macro fear inputs', () => {
  it('adds yield curve and the SPY put/call ratio (real Alpha Vantage shape)', async () => {
    routes.push((u) => (u.host === 'api.stlouisfed.org' ? { body: { observations: [{ date: '2026-11-02', value: u.searchParams.get('series_id') === 'T10Y2Y' ? '0.52' : '4.21' }] } } : undefined));
    routes.push((u) => (u.host === 'www.alphavantage.co' ? { body: { symbol: 'SPY', put_call_ratio_full_chain: '1.12', put_call_ratio_by_expiration: [{ date: '2026-11-04', value: '1.03' }] } } : undefined));
    const j = await (await macro()).json();
    expect(j.t10y2y).toMatchObject({ value: 0.52 });
    expect(j.putCall.ratio).toBe(1.12);
  });
});

import { GET as marketStatus } from '../api/market-status';
import { resetMarketCalendar } from '../shared/marketCalendar';

describe('/api/market-status', () => {
  afterEach(() => resetMarketCalendar());
  it('merges Finnhub holidays/early closes with the published calendar and reports live status', async () => {
    routes.push((u) => (u.pathname.endsWith('/market-holiday') ? { body: { exchange: 'US', data: [{ eventName: 'Christmas', atDate: '2028-12-25', tradingHour: '' }, { eventName: 'Day before Independence Day', atDate: '2028-07-03', tradingHour: '09:30-13:00' }, { eventName: 'New one', atDate: '2029-01-01', tradingHour: '' }] } } : undefined));
    routes.push((u) => (u.pathname.endsWith('/market-status') ? { body: { exchange: 'US', holiday: null, isOpen: true, session: 'regular', timezone: 'America/New_York', t: 1793797200 } } : undefined));
    const j = await (await marketStatus()).json();
    expect(j.calendar.holidays['2029-01-01']).toBe('New one');
    expect(j.calendar.holidays['2026-11-26']).toBe('Thanksgiving Day'); // published calendar always kept
    expect(j.calendar.early['2028-07-03'].close).toBe(13 * 3600);
    expect(j.status).toMatchObject({ isOpen: true, session: 'regular', source: 'Finnhub' });
  });
  it('falls back to Alpha Vantage status (real response shape) when Finnhub fails', async () => {
    routes.push((u) => (u.host === 'finnhub.io' ? { status: 500, body: {} } : undefined));
    routes.push((u) => (u.host === 'www.alphavantage.co' ? { body: { endpoint: 'Global Market Open & Close Status', markets: [{ market_type: 'Equity', region: 'United States', primary_exchanges: 'NASDAQ, NYSE, AMEX, BATS', local_open: '09:30', local_close: '16:15', current_status: 'closed', notes: '' }] } } : undefined));
    const j = await (await marketStatus()).json();
    expect(j.status).toMatchObject({ isOpen: false, source: 'Alpha Vantage' });
    expect(j.sources.find((s: { name: string }) => s.name === 'Finnhub status').ok).toBe(false);
  });
});

import { GET as worldApi } from '../api/world';
import { GET as flowsApi } from '../api/flows';

describe('/api/world and /api/flows', () => {
  it('world: GDELT tone-split hotspots + country ETF weather', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const feat = (n: string, lon: number, lat: number, c: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { name: n, count: c, html: `<a href="https://x/${n}">${n} markets</a>` } });
    routes.push((u) => (u.host === 'api.gdeltproject.org' ? { body: { type: 'FeatureCollection', features: decodeURIComponent(u.search).includes('tone<-2') ? [feat('Tokyo, Japan', 139.7, 35.7, 30)] : [feat('London, United Kingdom', -0.1, 51.5, 20)] } } : undefined));
    routes.push((u) => (u.host === 'finnhub.io' ? { body: { c: 70, d: -1.5, dp: u.searchParams.get('symbol') === 'EWJ' ? -2.4 : 0.8, h: 71, l: 69, o: 70, pc: 71, t: 1793797200 } } : undefined));
    const p = worldApi();
    await vi.advanceTimersByTimeAsync(12_000); // GDELT spacing: 5.2s between requests
    const j = await (await p).json();
    vi.useRealTimers();
    expect(j.hotspots.map((h: { country: string; tone: number }) => [h.country, h.tone])).toEqual([['Japan', -1], ['United Kingdom', 1]]);
    const jp = j.regions.find((r: { id: string }) => r.id === 'jp');
    expect(jp).toMatchObject({ etf: 'EWJ', chgPct: -2.4, weather: 'storm' });
    expect(calls.filter((c) => c.startsWith('api.gdeltproject.org')).length).toBe(2);
  });
  it('flows: sector rotation from Yahoo daily bars (rows, rotation map, risk appetite)', async () => {
    const yh = (n: number) => ({ chart: { result: [{ meta: { gmtoffset: -18000 }, timestamp: Array.from({ length: n }, (_, i) => 1730000000 + i * 86400), indicators: { quote: [{ open: Array(n).fill(1), high: Array(n).fill(1), low: Array(n).fill(1), close: Array.from({ length: n }, (_, i) => 100 + i * 0.1 + Math.sin(i / 7)), volume: Array(n).fill(1000) }] } }] } });
    routes.push((u) => (u.host === 'query1.finance.yahoo.com' ? { body: yh(250) } : undefined));
    const j = await (await flowsApi()).json();
    expect(j.pending).toEqual([]);
    expect(j.sources).toContain('Yahoo Finance');
    expect(j.rows.map((r: { sym: string }) => r.sym)).toEqual(expect.arrayContaining(['XLK', 'BTC', 'TLT', 'SMH']));
    expect(j.rows[0].rel[20]).not.toBeNull();
    expect(j.risk.line.length).toBeGreaterThan(50);
  });
});
