// GET /api/world -> GDELT hotspots (news layer) + regional sentiment weather (ETF move today + news tone)
import { REGIONS, mergeHotspots, regionWeather, type Hotspot } from '../shared/world.js';
import { gdeltHotspots, QUOTE_CHAIN } from './_lib/adapters.js';
import { cached, hasKey, json } from './_lib/core.js';

export async function GET(): Promise<Response> {
  const errors: Record<string, string> = {};
  let hotspots: Hotspot[] = [];
  try {
    const { val } = await cached('world:gdelt', 1800, gdeltHotspots);
    hotspots = mergeHotspots(val.neg, val.pos);
  } catch (e) { errors.gdelt = (e as Error).message.slice(0, 160); }

  const chg: Record<string, number> = {};
  if (hasKey('finnhub')) {
    try {
      const { val } = await cached('world:etfs', 180, () => QUOTE_CHAIN[0].fetch(REGIONS.map((r) => r.etf)));
      for (const q of val) if (Number.isFinite(q.chgPct)) chg[q.symbol] = q.chgPct;
    } catch (e) { errors.etfs = (e as Error).message.slice(0, 160); }
  }
  const regions = REGIONS.map((r) => regionWeather(r, chg[r.etf] ?? null, hotspots));
  return json({ hotspots, regions, errors, asOf: Date.now(), sources: { news: 'GDELT GEO 2.0 (last 24h, market query, split by tone)', market: 'Country ETFs via Finnhub' } }, { sMaxAge: hotspots.length ? 600 : 60 });
}
