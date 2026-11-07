// Provider adapters. Each one fetches + normalizes. Swap or reorder them in the chains below.
import type { Bar, MacroPoint, QuoteResult, TF } from '../../shared/types.js';
import { isPlainTicker, parseAlphaMovers, parseFinnhubNews, parseFinnhubProfile, parseFinraShortInterest, type FinraSI, type Mover, type NewsItem } from '../../shared/parse.js';
import { ProviderError, parseAlphaDaily, parseFinnhubQuote, parseFredLatest, parseTwelveQuote, parseTwelveSeries } from '../../shared/parse.js';
import { getJson, key, take, type Provider } from './core.js';
import { parseFeed } from '../../shared/news.js';
import { MARKET_QUERY, collectVessels, parseGeo, type Vessel } from '../../shared/world.js';
import { parseBinanceKlines, parseGeckoChart } from '../../shared/flows.js';
import { avCsvError, parseEarningsCsv, parseIpoCsv, parseKalshiFed, type Earning, type Ipo, type Odds } from '../../shared/calendar.js';

export interface SeriesAdapter {
  name: string;
  provider: Provider;
  supports: (tf: TF) => boolean;
  fetch: (symbol: string, tf: TF, reserve?: number) => Promise<Bar[]>;
}

const need = (p: Provider, cost = 1, reserve = 0) => {
  key(p); // throws if missing
  if (!take(p, cost, Date.now(), reserve)) throw new ProviderError(p, 'local rate limit reached (free tier budget)', true);
};

const TD_INTERVAL: Record<TF, { interval: string; size: number }> = {
  D: { interval: '1day', size: 300 },
  '1H': { interval: '1h', size: 500 },
  '5m': { interval: '5min', size: 800 }, // ~10 regular sessions
  W: { interval: '1week', size: 260 }, // ~5 years
  M: { interval: '1month', size: 240 }, // ~20 years
};

export const twelveSeries: SeriesAdapter = {
  name: 'Twelve Data',
  provider: 'twelvedata',
  supports: () => true,
  async fetch(symbol, tf, reserve = 0) {
    need('twelvedata', 1, reserve);
    const { interval, size } = TD_INTERVAL[tf];
    const u = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${size}&timezone=America/New_York&apikey=${key('twelvedata')}`;
    return parseTwelveSeries(await getJson(u, 'twelvedata'));
  },
};

export const alphaDaily: SeriesAdapter = {
  name: 'Alpha Vantage',
  provider: 'alphavantage',
  supports: (tf) => tf === 'D', // intraday is a premium endpoint on Alpha Vantage
  async fetch(symbol) {
    need('alphavantage');
    const u = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=compact&apikey=${key('alphavantage')}`;
    return parseAlphaDaily(await getJson(u, 'alphavantage'));
  },
};

/** Candle chain. Finnhub is not here: its /stock/candle endpoint is not on the free plan. */
export const SERIES_CHAIN: SeriesAdapter[] = [twelveSeries, alphaDaily];

export interface QuoteAdapter {
  name: string;
  provider: Provider;
  fetch: (symbols: string[]) => Promise<QuoteResult[]>;
}

export const finnhubQuotes: QuoteAdapter = {
  name: 'Finnhub',
  provider: 'finnhub',
  async fetch(symbols) {
    key('finnhub');
    const out: QuoteResult[] = [];
    // one call per symbol; Finnhub free allows 60/min
    await Promise.all(
      symbols.map(async (s) => {
        if (!take('finnhub')) return;
        try {
          out.push(parseFinnhubQuote(await getJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key('finnhub')}`, 'finnhub'), s));
        } catch { /* skip this symbol; fallback fills gaps */ }
      }),
    );
    if (!out.length) throw new ProviderError('finnhub', 'no quotes returned', true);
    return out;
  },
};

export const twelveQuotes: QuoteAdapter = {
  name: 'Twelve Data',
  provider: 'twelvedata',
  async fetch(symbols) {
    // batch request costs one credit per symbol
    need('twelvedata', symbols.length);
    const j = await getJson(`https://api.twelvedata.com/quote?symbol=${symbols.map(encodeURIComponent).join(',')}&apikey=${key('twelvedata')}`, 'twelvedata');
    const out: QuoteResult[] = [];
    for (const s of symbols) {
      try { out.push(parseTwelveQuote(j, s)); } catch { /* skip */ }
    }
    if (!out.length) throw new ProviderError('twelvedata', 'no quotes returned', true);
    return out;
  },
};

export const QUOTE_CHAIN: QuoteAdapter[] = [finnhubQuotes, twelveQuotes];

/** FRED daily series: VIXCLS (VIX close) and DGS10 (10-year Treasury yield). End of day. */
export async function fredLatest(series: 'VIXCLS' | 'DGS10' | 'T10Y2Y' | 'T10Y3M'): Promise<MacroPoint> {
  need('fred');
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${key('fred')}&file_type=json&sort_order=desc&limit=10`;
  return parseFredLatest(await getJson(u, 'fred'));
}

/* ---------------- scanner extras ---------------- */

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** FINRA consolidated short interest (public, keyless; published twice a month). One request for many symbols. */
export async function finraShortInterest(symbols: string[]): Promise<Map<string, FinraSI>> {
  need('finra');
  const body = {
    limit: 5000,
    fields: ['symbolCode', 'currentShortPositionQuantity', 'daysToCoverQuantity', 'changePercent', 'settlementDate'],
    domainFilters: [{ fieldName: 'symbolCode', values: symbols }],
    dateRangeFilters: [{ fieldName: 'settlementDate', startDate: ymd(Date.now() - 45 * 86400_000), endDate: ymd(Date.now()) }],
  };
  return parseFinraShortInterest(await getJson('https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest', 'finra', 10_000, { method: 'POST', body: JSON.stringify(body) }));
}

/** Finnhub company news for the last 2 days (catalyst check). */
export async function finnhubNews(symbol: string): Promise<NewsItem[]> {
  need('finnhub');
  const now = Date.now();
  const u = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${ymd(now - 2 * 86400_000)}&to=${ymd(now)}&token=${key('finnhub')}`;
  return parseFinnhubNews(await getJson(u, 'finnhub'), symbol);
}

export async function finnhubProfile(symbol: string) {
  need('finnhub');
  return parseFinnhubProfile(await getJson(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${key('finnhub')}`, 'finnhub'));
}

/** Alpha Vantage top gainers / losers / most active, filtered to plain tickers with real size. */
export async function alphaMovers(minPrice = 2, minVolume = 500_000): Promise<{ lastUpdated: string; movers: Mover[] }> {
  need('alphavantage');
  const r = parseAlphaMovers(await getJson(`https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${key('alphavantage')}`, 'alphavantage'));
  return { lastUpdated: r.lastUpdated, movers: r.movers.filter((m) => isPlainTicker(m.sym) && m.price >= minPrice && m.volume >= minVolume) };
}

/* ---------------- news / calendar / fear strip (M5) ---------------- */

/** RSS feeds (no keys). Each one is optional: a failing feed is reported, never fatal. */
export const FEEDS: { name: string; url: string }[] = [
  { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { name: 'BLS', url: 'https://www.bls.gov/feed/bls_latest.rss' },
];

export async function getText(url: string, timeoutMs = 8000): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // BLS and some feeds reject requests without a descriptive user agent
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'trading-desk/1.0 (personal dashboard)', accept: 'application/rss+xml, application/xml, text/xml, text/csv, */*' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

export async function rssFeed(name: string, url: string) {
  return parseFeed(await getText(url), name);
}

/** Finnhub general market news (free). Same item shape as company news. */
export async function finnhubMarketNews(): Promise<NewsItem[]> {
  need('finnhub');
  return parseFinnhubNews(await getJson(`https://finnhub.io/api/v1/news?category=general&token=${key('finnhub')}`, 'finnhub'), '');
}

/** Kalshi Fed decision markets: public market data, no key. */
export async function kalshiFedOdds(): Promise<Odds | null> {
  return parseKalshiFed(await getJson('https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXFEDDECISION&status=open&limit=200', 'kalshi'));
}

export async function alphaEarnings(): Promise<Earning[]> {
  need('alphavantage');
  const txt = await getText(`https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${key('alphavantage')}`, 15_000);
  const err = avCsvError(txt);
  if (err) throw new ProviderError('alphavantage', err, /frequency|rate limit|requests per/i.test(err), /premium/i.test(err));
  return parseEarningsCsv(txt);
}

export async function alphaIpos(): Promise<Ipo[]> {
  need('alphavantage');
  const txt = await getText(`https://www.alphavantage.co/query?function=IPO_CALENDAR&apikey=${key('alphavantage')}`);
  const err = avCsvError(txt);
  if (err) throw new ProviderError('alphavantage', err, /frequency|rate limit|requests per/i.test(err), /premium/i.test(err));
  return parseIpoCsv(txt);
}

/** SPY put/call ratio across the whole option chain (Alpha Vantage; worked on a free key in Nov 2026). */
export async function alphaPutCall(symbol = 'SPY'): Promise<{ ratio: number; symbol: string }> {
  need('alphavantage');
  const j = await getJson(`https://www.alphavantage.co/query?function=REALTIME_PUT_CALL_RATIO&symbol=${symbol}&apikey=${key('alphavantage')}`, 'alphavantage');
  const ratio = parseFloat(j?.put_call_ratio_full_chain);
  if (!Number.isFinite(ratio)) {
    const msg = String(j?.Information ?? j?.Note ?? 'no put/call ratio');
    throw new ProviderError('alphavantage', msg, /frequency|rate limit/i.test(msg), /premium/i.test(msg));
  }
  return { ratio, symbol };
}

/** FRED: release list (name -> id) and the dates for one release. */
export async function fredReleases(): Promise<{ id: number; name: string }[]> {
  need('fred');
  const j = await getJson(`https://api.stlouisfed.org/fred/releases?api_key=${key('fred')}&file_type=json&limit=1000`, 'fred');
  return (j?.releases ?? []).map((r: any) => ({ id: +r.id, name: String(r.name) }));
}
export async function fredReleaseDates(id: number, start: string, end: string): Promise<string[]> {
  need('fred');
  const j = await getJson(`https://api.stlouisfed.org/fred/release/dates?release_id=${id}&api_key=${key('fred')}&file_type=json&realtime_start=${start}&realtime_end=${end}&include_release_dates_with_no_data=true&sort_order=asc&limit=1000`, 'fred');
  return (j?.release_dates ?? []).map((d: any) => String(d.date));
}

/* ---------------- market status (M7) ---------------- */
export interface LiveStatus { isOpen: boolean; session: string | null; holiday: string | null; source: string; t: number }

/** Finnhub /stock/market-status -> { exchange, holiday, isOpen, session, timezone, t } */
export async function finnhubMarketStatus(): Promise<LiveStatus> {
  need('finnhub');
  const j = await getJson(`https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${key('finnhub')}`, 'finnhub');
  if (typeof j?.isOpen !== 'boolean') throw new ProviderError('finnhub', String(j?.error ?? 'unexpected market-status response'));
  return { isOpen: j.isOpen, session: j.session ?? null, holiday: j.holiday ?? null, source: 'Finnhub', t: (Number(j.t) || Date.now() / 1000) * 1000 };
}

/** Finnhub /stock/market-holiday -> { data: [{ eventName, atDate, tradingHour: "" | "09:30-13:00" }] } */
export async function finnhubHolidays(): Promise<{ holidays: Record<string, string>; early: Record<string, { close: number; name: string }> }> {
  need('finnhub');
  const j = await getJson(`https://finnhub.io/api/v1/stock/market-holiday?exchange=US&token=${key('finnhub')}`, 'finnhub');
  if (!Array.isArray(j?.data)) throw new ProviderError('finnhub', String(j?.error ?? 'unexpected market-holiday response'));
  const holidays: Record<string, string> = {}, early: Record<string, { close: number; name: string }> = {};
  for (const h of j.data) {
    const d = String(h.atDate ?? ''), name = String(h.eventName ?? 'Market holiday');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const m = /-(\d{2}):(\d{2})$/.exec(String(h.tradingHour ?? ''));
    if (m) early[d] = { close: +m[1] * 3600 + +m[2] * 60, name };
    else if (!h.tradingHour) holidays[d] = name;
  }
  return { holidays, early };
}

/** Alpha Vantage MARKET_STATUS (free): open/closed per region. Used as the backup status feed. */
export async function alphaMarketStatus(): Promise<LiveStatus> {
  need('alphavantage');
  const j = await getJson(`https://www.alphavantage.co/query?function=MARKET_STATUS&apikey=${key('alphavantage')}`, 'alphavantage');
  const us = (j?.markets ?? []).find((m: any) => m.market_type === 'Equity' && m.region === 'United States');
  if (!us) throw new ProviderError('alphavantage', String(j?.Information ?? j?.Note ?? 'no US market status'));
  return { isOpen: String(us.current_status).toLowerCase() === 'open', session: null, holiday: us.notes || null, source: 'Alpha Vantage', t: Date.now() };
}

/* ---------------- world map + money flow (M8) ---------------- */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastGdelt = 0;
/** GDELT asks for at most one request per 5 seconds. */
async function gdelt(url: string) {
  const wait = lastGdelt + 5200 - Date.now();
  if (wait > 0) await sleep(wait);
  lastGdelt = Date.now();
  return getJson(url, 'gdelt', 15_000);
}

/** GDELT GEO 2.0 PointData for market news, split by tone. */
export async function gdeltHotspots(timespan = '24h') {
  const base = 'https://api.gdeltproject.org/api/v2/geo/geo?format=GeoJSON&mode=PointData&maxpoints=250';
  const q = (tone: string) => `${base}&timespan=${timespan}&query=${encodeURIComponent(`${MARKET_QUERY} ${tone}`)}`;
  const neg = parseGeo(await gdelt(q('tone<-2')));
  const pos = parseGeo(await gdelt(q('tone>2')));
  return { neg, pos };
}

/** Daily crypto bars: Binance's public market-data mirror (the main host returns 451 to US servers), else CoinGecko. */
export async function cryptoDaily(sym: 'BTC' | 'ETH'): Promise<{ bars: Bar[]; source: string }> {
  try {
    const j = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}USDT&interval=1d&limit=60`, 'binance');
    return { bars: parseBinanceKlines(j), source: 'Binance' };
  } catch {
    const id = sym === 'BTC' ? 'bitcoin' : 'ethereum';
    const j = await getJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=60&interval=daily`, 'coingecko');
    return { bars: parseGeckoChart(j), source: 'CoinGecko' };
  }
}

/* ---------------- company page: history news, peers, earnings, SEC, Wikipedia, Gemini ---------------- */

/** Finnhub company news for a date range (free plan returns roughly the last year). */
export async function finnhubNewsRange(symbol: string, from: string, to: string): Promise<NewsItem[]> {
  need('finnhub');
  return parseFinnhubNews(await getJson(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${key('finnhub')}`, 'finnhub', 12000), symbol);
}

/** Finnhub peers: same-industry companies (free). */
export async function finnhubPeers(symbol: string): Promise<string[]> {
  need('finnhub');
  const j = await getJson(`https://finnhub.io/api/v1/stock/peers?symbol=${encodeURIComponent(symbol)}&token=${key('finnhub')}`, 'finnhub');
  if (!Array.isArray(j)) throw new ProviderError('finnhub', String(j?.error ?? 'unexpected peers response'));
  return j.map(String).filter((s) => s !== symbol && isPlainTicker(s)).slice(0, 12);
}

export interface EarningRow { sym: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
/** Finnhub earnings calendar (free): estimates before, actuals once reported. */
export async function finnhubEarnings(from: string, to: string, symbol = ''): Promise<EarningRow[]> {
  need('finnhub');
  const j = await getJson(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}&token=${key('finnhub')}`, 'finnhub', 12000);
  if (!Array.isArray(j?.earningsCalendar)) throw new ProviderError('finnhub', String(j?.error ?? 'unexpected earnings response'));
  const n = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  return j.earningsCalendar.map((r: any) => ({ sym: String(r.symbol), date: String(r.date), hour: String(r.hour ?? ''), epsEst: n(r.epsEstimate), epsAct: n(r.epsActual), revEst: n(r.revenueEstimate), revAct: n(r.revenueActual) }));
}

const secHeaders = () => ({ 'user-agent': key('sec'), 'accept-encoding': 'gzip, deflate' });
export async function secJson(url: string): Promise<any> {
  need('sec');
  return getJson(url, 'sec', 12000, { headers: secHeaders() });
}
export async function secText(url: string, timeoutMs = 20000): Promise<string> {
  need('sec');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { ...secHeaders(), accept: 'text/html,*/*' } });
    if (!r.ok) throw new ProviderError('sec', `HTTP ${r.status}`, r.status >= 500);
    return await r.text();
  } finally { clearTimeout(t); }
}

/** Wikipedia: best-matching article summary for a company name (keyless). */
export async function wikiSummary(name: string): Promise<{ title: string; extract: string; url: string } | null> {
  need('wikipedia');
  const h = { 'user-agent': 'trading-desk/1.0 (personal dashboard)' };
  const s = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${name} company`)}&srlimit=1&format=json&origin=*`, 'wikipedia', 8000, { headers: h });
  const title = s?.query?.search?.[0]?.title;
  if (!title) return null;
  const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, 'wikipedia', 8000, { headers: h });
  return j?.extract ? { title, extract: String(j.extract), url: j?.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` } : null;
}

/** Gemini (free tier) structured extraction. Model is configurable; defaults to a stable Flash-Lite. */
export async function geminiJson(prompt: string, schema: object): Promise<{ data: any; model: string }> {
  need('gemini');
  const models = [process.env.GEMINI_MODEL, 'gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash'].filter(Boolean) as string[];
  let last: unknown;
  for (const model of [...new Set(models)]) {
    try {
      const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, 'gemini', 55000, {
        method: 'POST',
        headers: { 'x-goog-api-key': key('gemini') },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: schema } }),
      });
      const text = j?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
      if (!text) throw new ProviderError('gemini', `empty answer (${j?.candidates?.[0]?.finishReason ?? j?.promptFeedback?.blockReason ?? 'unknown'})`);
      return { data: JSON.parse(text), model };
    } catch (e) {
      last = e;
      // 404 = model id retired; try the next one. Anything else (quota, bad key) stops here.
      if (!(e instanceof ProviderError && /HTTP 404/.test(e.message))) throw e;
    }
  }
  throw last;
}

/** GDELT GEO points for any query (last 24h), for the extra map layers. */
export async function gdeltLayer(query: string, timespan = '24h') {
  return parseGeo(await gdelt(`https://api.gdeltproject.org/api/v2/geo/geo?format=GeoJSON&mode=PointData&maxpoints=250&timespan=${timespan}&query=${encodeURIComponent(query)}`));
}

/** aisstream.io (free key): listen for a few seconds to ships inside the given boxes, then hang up. A snapshot, not a stream. */
export async function aisSnapshot(boxes: [[number, number], [number, number]][], ms = 8000): Promise<Vessel[]> {
  need('aisstream');
  const WS = (globalThis as any).WebSocket;
  if (!WS) throw new ProviderError('aisstream', 'WebSocket not available in this runtime');
  const msgs: any[] = [];
  await new Promise<void>((resolve, reject) => {
    const ws = new WS('wss://stream.aisstream.io/v0/stream');
    const done = () => { try { ws.close(); } catch { /* closed */ } resolve(); };
    const timer = setTimeout(done, ms);
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key('aisstream'), BoundingBoxes: boxes, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    ws.onmessage = async (ev: any) => {
      try { const raw = typeof ev.data === 'string' ? ev.data : await new Response(ev.data).text(); const j = JSON.parse(raw); if (j?.error) { clearTimeout(timer); reject(new ProviderError('aisstream', String(j.error))); return; } msgs.push(j); } catch { /* skip */ }
      if (msgs.length > 4000) { clearTimeout(timer); done(); }
    };
    ws.onerror = () => { clearTimeout(timer); msgs.length ? done() : reject(new ProviderError('aisstream', 'connection failed', true)); };
  });
  return collectVessels(msgs);
}

/** Any crypto vs USDT from Binance's public data mirror, all timeframes (time = UTC open of the bar). */
export async function cryptoBars(base: string, tf: TF): Promise<{ bars: Bar[]; source: string }> {
  const iv: Record<TF, string> = { '5m': '5m', '1H': '1h', D: '1d', W: '1w', M: '1M' };
  const j = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(base)}USDT&interval=${iv[tf]}&limit=500`, 'binance');
  return { bars: parseBinanceKlines(j), source: 'Binance (USDT pair)' };
}

/** Finnhub crypto news (free). */
export async function finnhubCryptoNews(): Promise<NewsItem[]> {
  need('finnhub');
  return parseFinnhubNews(await getJson(`https://finnhub.io/api/v1/news?category=crypto&token=${key('finnhub')}`, 'finnhub'), '');
}

/** Can this page be shown inside the desk? Reads X-Frame-Options and CSP frame-ancestors. */
export async function frameCheck(url: string): Promise<{ embeddable: boolean; reason?: string; finalUrl: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (trading-desk embed check)' } });
    const xfo = (r.headers.get('x-frame-options') ?? '').toLowerCase();
    const csp = (r.headers.get('content-security-policy') ?? '').toLowerCase();
    const fa = /frame-ancestors([^;]*)/.exec(csp)?.[1]?.trim() ?? '';
    if (xfo.includes('deny') || xfo.includes('sameorigin')) return { embeddable: false, reason: `X-Frame-Options: ${xfo}`, finalUrl: r.url };
    if (fa && !fa.includes('*')) return { embeddable: false, reason: `frame-ancestors ${fa}`, finalUrl: r.url };
    return { embeddable: r.ok, reason: r.ok ? undefined : `HTTP ${r.status}`, finalUrl: r.url };
  } finally { clearTimeout(t); }
}
