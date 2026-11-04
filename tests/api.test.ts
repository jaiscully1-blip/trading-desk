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
    expect(j.providers).toEqual({ twelvedata: true, finnhub: true, alphavantage: true, fred: false });
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
