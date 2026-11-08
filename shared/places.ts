// Small gazetteer for placing news on the map when GDELT's GEO endpoint is down: an article goes to the first place its
// headline names, else to the country of the outlet that published it. Coarse on purpose (country / hotspot level).

// [display name, lat, lon, extra words that mean this place]
type Place = [string, number, number, string[]?];
const PLACES: Place[] = [
  // hotspots and waterways first so "Gaza" wins over "Israel"
  ['Gaza', 31.42, 34.37], ['West Bank', 31.95, 35.25], ['Kyiv, Ukraine', 50.45, 30.52, ['kiev']], ['Donbas, Ukraine', 48.0, 37.8, ['donetsk', 'luhansk', 'donbass']],
  ['Crimea', 45.0, 34.1], ['Kharkiv, Ukraine', 49.99, 36.23], ['Odesa, Ukraine', 46.48, 30.72, ['odessa']], ['Moscow, Russia', 55.76, 37.62, ['kremlin']],
  ['Strait of Hormuz', 26.57, 56.25, ['hormuz']], ['Red Sea', 20.0, 38.5, ['houthi', 'houthis']], ['Bab el-Mandeb', 12.6, 43.4], ['Suez Canal', 30.6, 32.3, ['suez']],
  ['Panama Canal', 9.1, -79.7], ['Strait of Malacca', 2.5, 101.5, ['malacca']], ['South China Sea', 12.0, 114.0], ['Taiwan Strait', 24.5, 119.5],
  ['Black Sea', 43.4, 34.0], ['Persian Gulf', 26.5, 52.0], ['Beirut, Lebanon', 33.89, 35.5, ['hezbollah']], ['Tehran, Iran', 35.69, 51.39],
  ['Khartoum, Sudan', 15.5, 32.56, ['darfur']], ['Wall Street', 40.706, -74.009, ['nyse', 'nasdaq']], ['Washington, D.C.', 38.9, -77.04, ['white house', 'congress', 'pentagon', 'federal reserve', 'the fed', 'capitol hill']],
  ['Silicon Valley', 37.39, -122.06], ['Brussels (EU)', 50.85, 4.35, ['european union', 'european commission']], ['Frankfurt (ECB)', 50.11, 8.68, ['ecb']],
  ['London', 51.51, -0.13], ['Tokyo', 35.68, 139.69, ['bank of japan', 'boj']], ['Beijing', 39.9, 116.4], ['Shanghai', 31.23, 121.47], ['Hong Kong', 22.32, 114.17],
  ['Shenzhen', 22.54, 114.06], ['Mumbai', 19.08, 72.88], ['New Delhi', 28.61, 77.21], ['Dubai', 25.2, 55.27], ['Riyadh', 24.71, 46.68], ['Singapore', 1.35, 103.82],
  ['Seoul', 37.57, 126.98], ['Sydney', -33.87, 151.21], ['Toronto', 43.65, -79.38], ['Mexico City', 19.43, -99.13], ['São Paulo', -23.55, -46.63, ['sao paulo']],
  ['New York', 40.71, -74.01], ['Texas', 31.0, -99.0], ['California', 37.0, -120.0], ['Venezuela', 7.0, -66.0], ['Caracas, Venezuela', 10.48, -66.9],
  // countries
  ['United States', 39.8, -98.6, ['u.s.', 'america', 'american']], ['Canada', 56.1, -106.3], ['Mexico', 23.6, -102.5], ['Brazil', -14.2, -51.9], ['Argentina', -38.4, -63.6],
  ['Chile', -35.7, -71.5], ['Peru', -9.2, -75.0], ['Colombia', 4.6, -74.3], ['Ecuador', -1.8, -78.2], ['Bolivia', -16.3, -63.6], ['Cuba', 21.5, -77.8], ['Haiti', 18.97, -72.3],
  ['Panama', 8.5, -80.8], ['Guatemala', 15.8, -90.2], ['United Kingdom', 54.0, -2.0, ['britain', 'british', 'u.k.', 'england', 'scotland']], ['Ireland', 53.4, -8.2],
  ['France', 46.2, 2.2, ['french', 'paris']], ['Germany', 51.2, 10.4, ['german', 'berlin']], ['Netherlands', 52.1, 5.3, ['dutch', 'amsterdam']], ['Belgium', 50.5, 4.5],
  ['Switzerland', 46.8, 8.2, ['swiss', 'zurich', 'geneva']], ['Austria', 47.5, 14.6], ['Italy', 41.9, 12.6, ['italian', 'rome', 'milan']], ['Spain', 40.5, -3.7, ['spanish', 'madrid']],
  ['Portugal', 39.4, -8.2], ['Poland', 51.9, 19.1, ['polish', 'warsaw']], ['Czech Republic', 49.8, 15.5], ['Hungary', 47.2, 19.5], ['Romania', 45.9, 25.0], ['Greece', 39.1, 21.8],
  ['Serbia', 44.0, 21.0], ['Sweden', 60.1, 18.6], ['Norway', 60.5, 8.5], ['Finland', 61.9, 25.7], ['Denmark', 56.3, 9.5, ['greenland']], ['Estonia', 58.6, 25.0], ['Latvia', 56.9, 24.6],
  ['Lithuania', 55.2, 23.9], ['Belarus', 53.7, 27.95], ['Ukraine', 48.4, 31.2, ['ukrainian']], ['Russia', 61.5, 105.3, ['russian', 'putin']], ['Moldova', 47.4, 28.4], ['Tbilisi, Georgia', 41.7, 44.8],
  ['Armenia', 40.1, 45.0], ['Azerbaijan', 40.1, 47.6], ['Turkey', 39.0, 35.2, ['turkish', 'türkiye', 'ankara', 'istanbul']], ['Israel', 31.0, 34.9, ['israeli', 'idf', 'netanyahu']],
  ['Lebanon', 33.9, 35.9], ['Syria', 34.8, 39.0, ['syrian', 'damascus']], ['Jordan', 30.6, 36.2], ['Iraq', 33.2, 43.7, ['iraqi', 'baghdad']], ['Iran', 32.4, 53.7, ['iranian']],
  ['Saudi Arabia', 23.9, 45.1, ['saudi', 'aramco']], ['United Arab Emirates', 23.4, 53.8, ['uae', 'abu dhabi']], ['Qatar', 25.35, 51.2], ['Kuwait', 29.3, 47.5], ['Oman', 21.5, 55.9],
  ['Yemen', 15.6, 48.5, ['yemeni', 'aden']], ['Egypt', 26.8, 30.8, ['egyptian', 'cairo']], ['Libya', 26.3, 17.2], ['Tunisia', 33.9, 9.5], ['Algeria', 28.0, 1.7], ['Morocco', 31.8, -7.1],
  ['Sudan', 12.9, 30.2, ['sudanese', 'rsf']], ['South Sudan', 6.9, 31.3], ['Ethiopia', 9.1, 40.5], ['Somalia', 5.2, 46.2], ['Kenya', -0.02, 37.9, ['nairobi']], ['Nigeria', 9.1, 8.7, ['nigerian', 'lagos']],
  ['Ghana', 7.9, -1.0], ['Mali', 17.6, -4.0], ['Niger', 17.6, 8.1], ['Burkina Faso', 12.2, -1.6], ['Congo (DRC)', -4.0, 21.8, ['drc', 'kinshasa', 'goma', 'congo']],
  ['South Africa', -30.6, 22.9, ['johannesburg', 'cape town']], ['Mozambique', -18.7, 35.5], ['Zimbabwe', -19.0, 29.2], ['Afghanistan', 33.9, 67.7, ['taliban', 'kabul']],
  ['Pakistan', 30.4, 69.3, ['pakistani', 'islamabad', 'karachi']], ['India', 20.6, 79.0, ['indian', 'modi']], ['Bangladesh', 23.7, 90.4], ['Sri Lanka', 7.9, 80.8], ['Nepal', 28.4, 84.1],
  ['Myanmar', 21.9, 95.96, ['burma']], ['Thailand', 15.9, 100.99, ['thai', 'bangkok']], ['Cambodia', 12.6, 104.99], ['Vietnam', 14.1, 108.3, ['vietnamese', 'hanoi']],
  ['Malaysia', 4.2, 101.98], ['Indonesia', -0.8, 113.9, ['indonesian', 'jakarta']], ['Philippines', 12.9, 121.8, ['philippine', 'manila']], ['China', 35.9, 104.2, ['chinese', 'xi jinping']],
  ['Taiwan', 23.7, 121.0, ['taiwanese', 'taipei', 'tsmc']], ['North Korea', 40.3, 127.5, ['pyongyang']], ['South Korea', 35.9, 127.8, ['korean']], ['Japan', 36.2, 138.3, ['japanese']],
  ['Mongolia', 46.9, 103.8], ['Kazakhstan', 48.0, 66.9], ['Uzbekistan', 41.4, 64.6], ['Australia', -25.3, 133.8, ['australian']], ['New Zealand', -40.9, 174.9],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = PLACES.map(([name, lat, lon, alt]) => {
  const words = [name.split(/[,(]/)[0].trim(), ...(alt ?? [])].map((w) => w.toLowerCase());
  return { name, lat, lon, re: new RegExp(`(^|[^a-z])(${words.map((w) => esc(w.trim())).join('|')})(?=$|[^a-z])`, 'i') };
});

export function placeOf(text: string): { name: string; lat: number; lon: number } | null {
  for (const m of MATCHERS) if (m.re.test(text)) return m;
  return null;
}

/** GDELT DOC ArtList articles -> map points shaped like the GEO API's. */
import { safeUrl } from './safeurl.js';
export function pointsFromArticles(arts: { title?: string; url?: string; sourcecountry?: string }[]) {
  const by = new Map<string, { name: string; lat: number; lon: number; count: number; articles: { title: string; url: string }[] }>();
  for (const a of arts) {
    const title = String(a.title ?? '').trim();
    if (!title) continue;
    const p = placeOf(title) ?? (a.sourcecountry ? placeOf(a.sourcecountry) : null);
    if (!p) continue;
    const v = by.get(p.name) ?? { name: p.name, lat: p.lat, lon: p.lon, count: 0, articles: [] };
    v.count++;
    if (v.articles.length < 25) v.articles.push({ title, url: safeUrl(a.url) });
    by.set(p.name, v);
  }
  return [...by.values()].sort((a, b) => b.count - a.count);
}
