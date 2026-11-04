// Provider adapters. Each one fetches + normalizes. Swap or reorder them in the chains below.
import type { Bar, MacroPoint, QuoteResult, TF } from '../../shared/types';
import { ProviderError, parseAlphaDaily, parseFinnhubQuote, parseFredLatest, parseTwelveQuote, parseTwelveSeries } from '../../shared/parse';
import { getJson, key, take, type Provider } from './core';

export interface SeriesAdapter {
  name: string;
  provider: Provider;
  supports: (tf: TF) => boolean;
  fetch: (symbol: string, tf: TF) => Promise<Bar[]>;
}

const need = (p: Provider, cost = 1) => {
  key(p); // throws if missing
  if (!take(p, cost)) throw new ProviderError(p, 'local rate limit reached (free tier budget)', true);
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
  async fetch(symbol, tf) {
    need('twelvedata');
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
