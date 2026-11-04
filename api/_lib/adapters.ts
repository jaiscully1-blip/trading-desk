// Provider adapters. Each one fetches + normalizes. Swap or reorder them in the chains below.
import type { Bar, MacroPoint, QuoteResult, TF } from '../../shared/types';
import { isPlainTicker, parseAlphaMovers, parseFinnhubNews, parseFinnhubProfile, parseFinraShortInterest, type FinraSI, type Mover, type NewsItem } from '../../shared/parse';
import { ProviderError, parseAlphaDaily, parseFinnhubQuote, parseFredLatest, parseTwelveQuote, parseTwelveSeries } from '../../shared/parse';
import { getJson, key, take, type Provider } from './core';

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
export async function fredLatest(series: 'VIXCLS' | 'DGS10'): Promise<MacroPoint> {
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
