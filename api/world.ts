// GET /api/world -> GDELT hotspots (news layer) + regional sentiment weather (ETF move today + news tone)
// GET /api/world?layer=conflict|shipping|legal|deals -> GDELT points for that layer (+ chokepoints and ships for shipping)
import { CHOKEPOINTS, LAYER_QUERY, REGIONS, layerHotspots, mergeHotspots, regionWeather, type ExtraLayer, type Hotspot } from '../shared/world.js';
import { aisSnapshot, gdeltHotspots, gdeltLayer, geoIsDown, QUOTE_CHAIN } from './_lib/adapters.js';
import { cached, hasKey, json } from './_lib/core.js';

export const maxDuration = 30;

async function extra(layer: ExtraLayer): Promise<Response> {
  const errors: Record<string, string> = {};
  let hotspots: Hotspot[] = [];
  try { hotspots = layerHotspots((await cached(`world:${layer}`, 1800, () => gdeltLayer(LAYER_QUERY[layer]))).val); } catch (e) { errors.gdelt = (e as Error).message.slice(0, 160); }
  let ships = null as Awaited<ReturnType<typeof aisSnapshot>> | null;
  if (layer === 'shipping' && hasKey('aisstream')) {
    try { ships = (await cached('world:ais', 300, () => aisSnapshot(CHOKEPOINTS.map((c) => c.box)))).val; } catch (e) { errors.ships = (e as Error).message.slice(0, 160); }
  }
  return json({ layer, hotspots, chokepoints: layer === 'shipping' ? CHOKEPOINTS : [], ships, shipsKey: hasKey('aisstream'), placement: geoIsDown() ? 'headline' : 'geo', errors, asOf: Date.now() }, { sMaxAge: hotspots.length ? 600 : 60 });
}

export async function GET(req?: Request): Promise<Response> {
  const layer = req ? new URL(req.url).searchParams.get('layer') : null;
  if (layer && layer in LAYER_QUERY) return extra(layer as ExtraLayer);
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
  return json({ hotspots, regions, placement: geoIsDown() ? 'headline' : 'geo', errors, asOf: Date.now(), sources: { news: 'GDELT GEO 2.0 (last 24h, market query, split by tone)', market: 'Country ETFs via Finnhub' } }, { sMaxAge: hotspots.length ? 600 : 60 });
}
