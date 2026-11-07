// GET /api/movers -> Alpha Vantage top gainers / most active / losers (filtered), to discover names outside your list.
import { alphaMovers } from './_lib/adapters.js';
import { cached, json, ttl } from './_lib/core.js';

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const minPrice = Math.max(0, Number(u.searchParams.get('minPrice') ?? 2) || 2);
  const minVol = Math.max(0, Number(u.searchParams.get('minVolume') ?? 500_000) || 500_000);
  try {
    // hourly in session: Alpha Vantage's free key allows 25 requests a day in total
    const life = ttl(3600, 6 * 3600);
    const { val, stale } = await cached(`movers:${minPrice}:${minVol}`, life, () => alphaMovers(minPrice, minVol));
    return json({ ...val, source: 'Alpha Vantage', stale }, { sMaxAge: life });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 503 });
  }
}
