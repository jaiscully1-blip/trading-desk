// Shared candle loading (used by /api/candles and /api/scan) so both hit the same cache.
import type { SeriesResult, TF } from '../../shared/types.js';
import { ProviderError } from '../../shared/parse.js';
import { SERIES_CHAIN } from './adapters.js';
import { cached, getCached, ttl } from './core.js';

/** [in-session, off-hours] seconds. Daily bars only change once a day; the forming bar is patched from live quotes. */
export const SERIES_TTL: Record<TF, [number, number]> = { '5m': [240, 1800], '1H': [900, 3600], D: [3600, 6 * 3600], W: [6 * 3600, 12 * 3600], M: [12 * 3600, 24 * 3600] };

export interface LoadOpts {
  /** false = primary (Twelve Data) only. The scanner uses this so it never spends the 25/day Alpha Vantage budget. */
  fallback?: boolean;
  /** leave this many Twelve Data credits per minute for charts and levels */
  reserve?: number;
}

export async function loadSeries(symbol: string, tf: TF, opts: LoadOpts = {}) {
  const life = ttl(...SERIES_TTL[tf]);
  const chain = SERIES_CHAIN.filter((a) => a.supports(tf)).slice(0, opts.fallback === false ? 1 : undefined);
  const tried: string[] = [];
  const errs: ProviderError[] = [];
  try {
    const r = await cached<SeriesResult>(`candles:${symbol}:${tf}`, life, async () => {
      let last: unknown;
      for (const a of chain) {
        try {
          const bars = await a.fetch(symbol, tf, opts.reserve ?? 0);
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
    return { ok: true as const, ...r, life };
  } catch (e) {
    return {
      ok: false as const,
      error: (e as Error).message,
      tried,
      unavailable: errs.length > 0 && errs.every((x) => x.notOnFreeTier),
      budget: errs.some((x) => /local rate limit/.test(x.message)),
    };
  }
}

export const peekSeries = (symbol: string, tf: TF) => getCached<SeriesResult>(`candles:${symbol}:${tf}`);
