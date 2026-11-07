// GET /api/candles?symbol=SPY&tf=5m|1H|D|W|M
import type { ApiError, TF } from '../shared/types.js';
import { json, SYMBOL_RE } from './_lib/core.js';
import { loadSeries } from './_lib/series.js';

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const symbol = (u.searchParams.get('symbol') ?? '').toUpperCase();
  const tf = u.searchParams.get('tf') as TF;
  if (!SYMBOL_RE.test(symbol) || !['5m', '1H', 'D', 'W', 'M'].includes(tf)) return json({ error: 'bad symbol or tf' } satisfies ApiError, { status: 400 });

  const r = await loadSeries(symbol, tf);
  if (!r.ok) return json({ error: r.error, tried: r.tried, unavailable: r.unavailable } satisfies ApiError, { status: 503 });
  return json(r.stale ? { ...r.val, note: 'Served from cache: providers are rate-limited right now.' } : r.val, { sMaxAge: r.stale ? 15 : r.life });
}
