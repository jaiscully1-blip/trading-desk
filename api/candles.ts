// GET /api/candles?symbol=SPY&tf=5m|1H|D
import type { ApiError, SeriesResult, TF } from '../shared/types';
import { ProviderError } from '../shared/parse';
import { SERIES_CHAIN } from './_lib/adapters';
import { SYMBOL_RE, cached, json, ttl } from './_lib/core';

const TTL: Record<TF, [number, number]> = { '5m': [60, 1800], '1H': [300, 3600], D: [300, 6 * 3600] };

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') ?? '').toUpperCase();
  const tf = u.searchParams.get('tf') as TF;
  if (!SYMBOL_RE.test(symbol) || !['5m', '1H', 'D'].includes(tf)) return json({ error: 'bad symbol or tf' } satisfies ApiError, { status: 400 });

  const life = ttl(...TTL[tf]);
  const chain = SERIES_CHAIN.filter((a) => a.supports(tf));
  const tried: string[] = [];
  const errs: ProviderError[] = [];
  try {
    const { val, stale } = await cached<SeriesResult>(`candles:${symbol}:${tf}`, life, async () => {
      let last: unknown;
      for (const a of chain) {
        try {
          const bars = await a.fetch(symbol, tf);
          if (!bars.length) throw new ProviderError(a.provider, 'empty series');
          return { symbol, tf, bars, source: a.name, freshness: a.provider === 'alphavantage' ? 'eod' : 'live', asOf: Date.now() };
        } catch (e) {
          tried.push((e as Error).message);
          if (e instanceof ProviderError) errs.push(e);
          last = e;
        }
      }
      throw last ?? new Error('no adapter');
    });
    return json(stale ? { ...val, note: 'Served from cache: providers are rate-limited right now.' } : val, { sMaxAge: stale ? 15 : life });
  } catch (e) {
    // "unavailable" only when every configured source says this isn't on its free tier
    const unavailable = errs.length > 0 && errs.every((x) => x.notOnFreeTier);
    return json({ error: (e as Error).message, tried, unavailable } satisfies ApiError, { status: 503 });
  }
}
