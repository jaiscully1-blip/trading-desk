// World map data: GDELT GEO hotspots (news layer) and regional "sentiment weather" (news tone + regional ETF move).
import { decode } from './news.js';

export interface Article { title: string; url: string }
/** neu = neutral-tone headlines (only when placed from the desk's own news feeds) */
export interface Hotspot { id: string; name: string; country: string; lat: number; lon: number; neg: number; pos: number; neu?: number; tone: number; articles: Article[] }
export const spotTotal = (h: Hotspot) => h.pos + h.neg + (h.neu ?? 0);

/** Article links embedded in the GEO API popup HTML. */
export function parsePopupHtml(html: string): Article[] {
  const out: Article[] = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) { const title = decode(m[2]); if (title) out.push({ url: m[1], title }); }
  return out;
}

/** One GEO 2.0 GeoJSON response (PointData) -> points with article counts. */
export function parseGeo(j: any): { name: string; lat: number; lon: number; count: number; articles: Article[] }[] {
  const fs: any[] = Array.isArray(j?.features) ? j.features : [];
  return fs.flatMap((f) => {
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) return [];
    const name = String(f.properties?.name ?? '').trim();
    return [{ name, lon: +c[0], lat: +c[1], count: +(f.properties?.count ?? 1) || 1, articles: parsePopupHtml(String(f.properties?.html ?? '')) }];
  }).filter((p) => p.name && Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

export const countryOf = (name: string) => name.split(',').map((s) => s.trim()).filter(Boolean).at(-1) ?? name;

/**
 * Merge the negative-tone and positive-tone queries into hotspots. Tone = (pos - neg) / (pos + neg), -1..1.
 * Locations within ~1 degree are merged so the same city from both queries lines up.
 */
export function mergeHotspots(neg: ReturnType<typeof parseGeo>, pos: ReturnType<typeof parseGeo>, max = 120): Hotspot[] {
  const m = new Map<string, Hotspot>();
  const key = (p: { lat: number; lon: number }) => `${Math.round(p.lat)}:${Math.round(p.lon)}`;
  const add = (p: ReturnType<typeof parseGeo>[number], side: 'neg' | 'pos') => {
    const k = key(p);
    const h = m.get(k) ?? { id: k, name: p.name, country: countryOf(p.name), lat: p.lat, lon: p.lon, neg: 0, pos: 0, tone: 0, articles: [] };
    h[side] += p.count;
    for (const a of p.articles) if (!h.articles.some((x) => x.url === a.url)) h.articles.push(a);
    m.set(k, h);
  };
  neg.forEach((p) => add(p, 'neg'));
  pos.forEach((p) => add(p, 'pos'));
  return [...m.values()].map((h) => ({ ...h, tone: (h.pos - h.neg) / Math.max(1, h.pos + h.neg) })).sort((a, b) => b.pos + b.neg - (a.pos + a.neg)).slice(0, max);
}

/** Regions for the weather layer: a country ETF for the market's reaction and the GDELT country names for news tone. */
export interface Region { id: string; label: string; etf: string; lat: number; lon: number; countries: string[] }
export const REGIONS: Region[] = [
  { id: 'us', label: 'United States', etf: 'SPY', lat: 39, lon: -98, countries: ['United States'] },
  { id: 'ca', label: 'Canada', etf: 'EWC', lat: 56, lon: -106, countries: ['Canada'] },
  { id: 'mx', label: 'Mexico', etf: 'EWW', lat: 23, lon: -102, countries: ['Mexico'] },
  { id: 'br', label: 'Brazil', etf: 'EWZ', lat: -10, lon: -52, countries: ['Brazil'] },
  { id: 'uk', label: 'United Kingdom', etf: 'EWU', lat: 54, lon: -2, countries: ['United Kingdom', 'England', 'Scotland'] },
  { id: 'eu', label: 'Germany / Eurozone', etf: 'EWG', lat: 51, lon: 10, countries: ['Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Belgium'] },
  { id: 'jp', label: 'Japan', etf: 'EWJ', lat: 36, lon: 138, countries: ['Japan'] },
  { id: 'cn', label: 'China', etf: 'FXI', lat: 35, lon: 104, countries: ['China', 'Hong Kong'] },
  { id: 'tw', label: 'Taiwan', etf: 'EWT', lat: 23.7, lon: 121, countries: ['Taiwan'] },
  { id: 'kr', label: 'South Korea', etf: 'EWY', lat: 36, lon: 128, countries: ['South Korea', 'Korea, South'] },
  { id: 'in', label: 'India', etf: 'INDA', lat: 21, lon: 78, countries: ['India'] },
  { id: 'au', label: 'Australia', etf: 'EWA', lat: -25, lon: 134, countries: ['Australia'] },
];

export type Weather = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm';
export interface RegionWeather { id: string; label: string; etf: string; lat: number; lon: number; chgPct: number | null; tone: number | null; score: number | null; weather: Weather | null; articles: number }

/**
 * Score -1 (fear) .. +1 (greed): 60% the regional ETF's move today (±2% maps to ±1), 40% news tone in that region.
 * Either half alone is used if the other is missing.
 */
export function regionWeather(r: Region, chgPct: number | null, hotspots: Hotspot[]): RegionWeather {
  const hs = hotspots.filter((h) => r.countries.some((c) => h.country === c));
  const n = hs.reduce((a, h) => a + h.pos + h.neg, 0);
  const tone = n >= 3 ? hs.reduce((a, h) => a + h.pos - h.neg, 0) / n : null;
  const mkt = chgPct == null ? null : Math.max(-1, Math.min(1, chgPct / 2));
  const score = mkt != null && tone != null ? 0.6 * mkt + 0.4 * tone : mkt ?? tone;
  const weather: Weather | null = score == null ? null : score >= 0.5 ? 'sun' : score >= 0.15 ? 'partly' : score > -0.15 ? 'cloud' : score > -0.5 ? 'rain' : 'storm';
  return { id: r.id, label: r.label, etf: r.etf, lat: r.lat, lon: r.lon, chgPct, tone, score, weather, articles: n };
}

export const MARKET_QUERY = '(stocks OR markets OR economy OR inflation OR "central bank" OR tariffs OR "oil prices" OR recession OR earnings)';

/* ---------------- extra layers: conflicts, shipping & oil, lawsuits, deals ---------------- */
export type ExtraLayer = 'conflict' | 'shipping' | 'legal' | 'deals';
/** GDELT GEO queries (last 24h). Each point is a place news articles mention, sized by article count. */
export const LAYER_QUERY: Record<ExtraLayer, string> = {
  conflict: '(airstrike OR "missile strike" OR shelling OR "armed clashes" OR "drone attack" OR insurgents OR "military offensive")',
  shipping: '("oil tanker" OR tanker OR "shipping lane" OR "strait of hormuz" OR "red sea" OR "suez canal" OR "panama canal" OR "freight rates")',
  legal: '(lawsuit OR "class action" OR antitrust OR indicted OR "sued" OR "settlement" OR "court ruling") (company OR corporation OR inc)',
  deals: '(acquisition OR merger OR "new factory" OR "new plant" OR "breaks ground" OR "billion investment" OR "data center")',
};
export const LAYER_LABEL: Record<ExtraLayer, string> = { conflict: 'Conflicts', shipping: 'Shipping & oil', legal: 'Lawsuits', deals: 'Deals & developments' };

/** Word filters for placing the desk's own headlines on the extra layers when GDELT is unavailable. */
export const LAYER_WORDS: Record<ExtraLayer, RegExp> = {
  conflict: /\b(airstrikes?|missiles?|shelling|clashes|drone (attack|strike)s?|insurgents?|offensive|troops|ceasefire|war|militants?|bombing)\b/i,
  shipping: /\b(tankers?|shipping|strait of hormuz|hormuz|red sea|suez|panama canal|freight|vessels?|ports?|oil prices?|crude|opec)\b/i,
  legal: /\b(lawsuits?|class action|antitrust|indicted|indictment|sued|sues|settlements?|court|judge|ruling|probe|regulators?|sec charges)\b/i,
  deals: /\b(acquires?|acquisition|merger|merge|buyout|takeover|new (factory|plant)|breaks ground|billion investment|data cent(er|re)s?|to buy|deal)\b/i,
};

/** gazetteer places without a country in their name -> the country the weather layer matches on */
const CITY_COUNTRY: Record<string, string> = {
  'Wall Street': 'United States', 'Washington, D.C.': 'United States', 'Silicon Valley': 'United States', 'New York': 'United States', Texas: 'United States', California: 'United States',
  London: 'United Kingdom', Tokyo: 'Japan', Beijing: 'China', Shanghai: 'China', Shenzhen: 'China', 'Hong Kong': 'Hong Kong', Mumbai: 'India', 'New Delhi': 'India',
  Seoul: 'South Korea', Sydney: 'Australia', Toronto: 'Canada', 'Mexico City': 'Mexico', 'São Paulo': 'Brazil', 'Frankfurt (ECB)': 'Germany', 'Brussels (EU)': 'Belgium',
};

/**
 * The desk's own headlines (RSS + Finnhub) -> hotspots, placed by the place each headline names and split by keyword tone.
 * Used when GDELT is rate-limited or down, so the map is never empty while the news feeds work.
 */
export function headlineHotspots(items: { title: string; url: string; sentiment: -1 | 0 | 1 }[], placeOf: (t: string) => { name: string; lat: number; lon: number } | null, max = 120): Hotspot[] {
  const m = new Map<string, Hotspot>();
  const seen = new Set<string>();
  for (const it of items) {
    const k0 = it.title.toLowerCase().slice(0, 80);
    if (!it.title || seen.has(k0)) continue;
    seen.add(k0);
    const p = placeOf(it.title);
    if (!p) continue;
    const h = m.get(p.name) ?? { id: `d:${p.name}`, name: p.name, country: CITY_COUNTRY[p.name] ?? countryOf(p.name), lat: p.lat, lon: p.lon, neg: 0, pos: 0, neu: 0, tone: 0, articles: [] };
    if (it.sentiment > 0) h.pos++; else if (it.sentiment < 0) h.neg++; else h.neu = (h.neu ?? 0) + 1;
    if (h.articles.length < 25) h.articles.push({ title: it.title, url: it.url });
    m.set(p.name, h);
  }
  return [...m.values()].map((h) => ({ ...h, tone: (h.pos - h.neg) / Math.max(1, spotTotal(h)) })).sort((a, b) => spotTotal(b) - spotTotal(a)).slice(0, max);
}

/** One-sided GEO points -> hotspots (no tone split for these layers). */
export function layerHotspots(pts: ReturnType<typeof parseGeo>, max = 150): Hotspot[] {
  return mergeHotspots(pts, [], max).map((h) => ({ ...h, tone: 0 }));
}

/** World oil chokepoints (U.S. EIA "World Oil Transit Chokepoints"). Drawn on the Shipping & oil layer. */
export interface Chokepoint { id: string; name: string; lat: number; lon: number; note: string; box: [[number, number], [number, number]] }
export const CHOKEPOINTS: Chokepoint[] = [
  { id: 'hormuz', name: 'Strait of Hormuz', lat: 26.6, lon: 56.3, note: 'The world’s most important oil chokepoint: about a fifth of global oil use passes through it (EIA).', box: [[24.5, 54.5], [27.5, 58.0]] },
  { id: 'malacca', name: 'Strait of Malacca', lat: 2.5, lon: 101.3, note: 'Shortest sea route between the Persian Gulf and East Asia; among the largest oil flows (EIA).', box: [[1.0, 98.5], [5.5, 104.0]] },
  { id: 'suez', name: 'Suez Canal / SUMED', lat: 30.6, lon: 32.3, note: 'Links the Red Sea and the Mediterranean; disruptions reroute tankers around Africa.', box: [[29.5, 32.0], [31.5, 33.0]] },
  { id: 'bab', name: 'Bab el-Mandeb', lat: 12.6, lon: 43.4, note: 'Southern gate of the Red Sea; attacks on shipping here raise freight and insurance costs.', box: [[11.5, 42.5], [13.5, 44.5]] },
  { id: 'panama', name: 'Panama Canal', lat: 9.1, lon: -79.7, note: 'Key for U.S. Gulf Coast exports to Asia; low water levels limit transits.', box: [[8.5, -80.2], [9.6, -79.3]] },
  { id: 'bosporus', name: 'Turkish Straits', lat: 41.1, lon: 29.05, note: 'Carries Russian and Caspian oil from the Black Sea to world markets.', box: [[40.0, 26.0], [41.5, 29.5]] },
  { id: 'danish', name: 'Danish Straits', lat: 55.6, lon: 11.0, note: 'Route for Russian Baltic oil exports to Europe and beyond.', box: [[54.5, 10.0], [57.8, 12.8]] },
  { id: 'cape', name: 'Cape of Good Hope', lat: -34.4, lon: 18.5, note: 'The long way around Africa when the Red Sea is disrupted.', box: [[-35.5, 17.0], [-33.5, 21.0]] },
];

/** aisstream.io messages -> vessels (latest position per ship; tanker when its static data says AIS type 80-89). */
export interface Vessel { mmsi: number; name: string; lat: number; lon: number; tanker: boolean; sog?: number }
export function collectVessels(msgs: any[]): Vessel[] {
  const by = new Map<number, Vessel>();
  const types = new Map<number, number>();
  for (const m of msgs) {
    const md = m?.MetaData;
    const mmsi = Number(md?.MMSI);
    if (!mmsi) continue;
    const st = m?.Message?.ShipStaticData;
    if (st && Number.isFinite(Number(st.Type))) types.set(mmsi, Number(st.Type));
    const lat = Number(md.latitude), lon = Number(md.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
    const pr = m?.Message?.PositionReport;
    by.set(mmsi, { mmsi, name: String(md.ShipName ?? '').trim() || `MMSI ${mmsi}`, lat, lon, tanker: false, sog: pr ? Number(pr.Sog) : by.get(mmsi)?.sog });
  }
  return [...by.values()].map((v) => ({ ...v, tanker: (types.get(v.mmsi) ?? 0) >= 80 && (types.get(v.mmsi) ?? 0) <= 89 }));
}
