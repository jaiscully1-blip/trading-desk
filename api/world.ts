// GET /api/world -> GDELT hotspots (news layer) + regional sentiment weather (ETF move today + news tone)
// GET /api/world?layer=conflict|shipping|legal|deals -> GDELT points for that layer (+ chokepoints and ships for shipping)
// When GDELT is rate-limited (HTTP 429) or down, dots come from the desk's own news feeds instead (via: 'desk').
import { CHOKEPOINTS, LAYER_QUERY, LAYER_WORDS, REGIONS, headlineHotspots, layerHotspots, mergeHotspots, regionWeather, type ExtraLayer, type Hotspot } from '../shared/world.js';
import { keywordSentiment } from '../shared/news.js';
import { placeOf } from '../shared/places.js';
import { FEEDS, aisSnapshot, finnhubMarketNews, gdeltHotspots, gdeltLayer, geoIsDown, rssFeed, QUOTE_CHAIN } from './_lib/adapters.js';
import { cached, hasKey, json, ttl } from './_lib/core.js';
import { snapshot } from './_lib/research/markets.js';

export const maxDuration = 30;

/** Last 24h of headlines from the same feeds (and cache keys) as /api/news. */
async function deskHeadlines(): Promise<{ title: string; url: string; sentiment: -1 | 0 | 1 }[]> {
  const out: { title: string; url: string; t: number }[] = [];
  await Promise.all(FEEDS.map(async (f) => {
    try { out.push(...(await cached(`rss:${f.name}`, ttl(300, 1800), () => rssFeed(f.name, f.url))).val); } catch { /* optional feed */ }
  }));
  if (hasKey('finnhub')) {
    try { for (const n of (await cached('fh:general', ttl(180, 900), finnhubMarketNews)).val) out.push({ title: n.headline, url: n.url, t: n.t }); } catch { /* optional */ }
  }
  return out.filter((x) => Date.now() - x.t < 86400_000).sort((a, b) => b.t - a.t).map((x) => ({ title: x.title, url: x.url, sentiment: keywordSentiment(x.title) }));
}

const softNote = (err: string) => /429/.test(err)
  ? 'GDELT (the global news map service) is rate-limiting right now, so dots come from the desk’s own news feeds, placed by the place each headline names. Fewer dots than usual; GDELT is retried every 10 minutes.'
  : 'GDELT (the global news map service) is not answering right now, so dots come from the desk’s own news feeds, placed by the place each headline names. Fewer dots than usual.';

async function extra(layer: ExtraLayer): Promise<Response> {
  const errors: Record<string, string> = {};
  let hotspots: Hotspot[] = [];
  let via: 'gdelt' | 'desk' = 'gdelt', note: string | undefined;
  let gerr = '';
  try { hotspots = layerHotspots((await cached(`world:${layer}`, 1800, () => gdeltLayer(LAYER_QUERY[layer]))).val); } catch (e) { gerr = (e as Error).message.slice(0, 160); }
  if (!hotspots.length) {
    const desk = headlineHotspots((await deskHeadlines()).filter((h) => LAYER_WORDS[layer].test(h.title)), placeOf, 150)
      .map((h) => ({ ...h, neg: h.pos + h.neg + (h.neu ?? 0), pos: 0, neu: 0, tone: 0 })); // one-sided layer: count = all articles
    if (desk.length) { hotspots = desk; via = 'desk'; note = softNote(gerr); } else if (gerr) errors.gdelt = gerr;
  }
  let ships = null as Awaited<ReturnType<typeof aisSnapshot>> | null;
  if (layer === 'shipping' && hasKey('aisstream')) {
    try { ships = (await cached('world:ais', 300, () => aisSnapshot(CHOKEPOINTS.map((c) => c.box)))).val; } catch (e) { errors.ships = (e as Error).message.slice(0, 160); }
  }
  return json({ layer, hotspots, chokepoints: layer === 'shipping' ? CHOKEPOINTS : [], ships, shipsKey: hasKey('aisstream'), placement: via === 'desk' || geoIsDown() ? 'headline' : 'geo', via, note, errors, asOf: Date.now() }, { sMaxAge: hotspots.length && via === 'gdelt' ? 600 : 120 });
}

export async function GET(req?: Request): Promise<Response> {
  const layer = req ? new URL(req.url).searchParams.get('layer') : null;
  if (layer && layer in LAYER_QUERY) return extra(layer as ExtraLayer);
  const errors: Record<string, string> = {};
  let hotspots: Hotspot[] = [];
  let via: 'gdelt' | 'desk' = 'gdelt', note: string | undefined;
  let gerr = '';
  try {
    const { val } = await cached('world:gdelt', 1800, gdeltHotspots);
    hotspots = mergeHotspots(val.neg, val.pos);
  } catch (e) { gerr = (e as Error).message.slice(0, 160); }
  if (!hotspots.length) {
    const desk = headlineHotspots(await deskHeadlines(), placeOf);
    if (desk.length) { hotspots = desk; via = 'desk'; note = softNote(gerr); } else if (gerr) errors.gdelt = gerr;
  }

  // country ETF moves: Finnhub when keyed, else the screener snapshot (~15 min delayed)
  const chg: Record<string, number> = {};
  let etfSrc = '';
  if (hasKey('finnhub')) {
    try {
      const { val } = await cached('world:etfs', 180, () => QUOTE_CHAIN[0].fetch(REGIONS.map((r) => r.etf)));
      for (const q of val) if (Number.isFinite(q.chgPct)) chg[q.symbol] = q.chgPct;
      if (Object.keys(chg).length) etfSrc = 'Country ETFs via Finnhub';
    } catch { /* fall through to the snapshot */ }
  }
  if (!Object.keys(chg).length) {
    try {
      const s = await snapshot();
      for (const r of REGIONS) { const v = s.snap[r.etf]; if (v && Number.isFinite(v.c)) chg[r.etf] = v.c; }
      if (Object.keys(chg).length) etfSrc = `Country ETFs via ${s.source}`;
    } catch (e) { errors.etfs = (e as Error).message.slice(0, 160); }
  }
  const regions = REGIONS.map((r) => regionWeather(r, chg[r.etf] ?? null, hotspots));
  return json({
    hotspots, regions, via, note, placement: via === 'desk' || geoIsDown() ? 'headline' : 'geo', errors, asOf: Date.now(),
    sources: { news: via === 'desk' ? 'Desk news feeds (RSS + Finnhub, last 24h, keyword tone)' : 'GDELT GEO 2.0 (last 24h, market query, split by tone)', market: etfSrc || 'Country ETFs (unavailable)' },
  }, { sMaxAge: hotspots.length && via === 'gdelt' ? 600 : 120 });
}
