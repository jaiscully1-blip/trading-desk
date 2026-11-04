// World map data: GDELT GEO hotspots (news layer) and regional "sentiment weather" (news tone + regional ETF move).
import { decode } from './news';

export interface Article { title: string; url: string }
export interface Hotspot { id: string; name: string; country: string; lat: number; lon: number; neg: number; pos: number; tone: number; articles: Article[] }

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
