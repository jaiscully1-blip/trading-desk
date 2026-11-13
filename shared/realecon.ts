// Real Economy: airports, airlines, weather-alert sectors and series math (pure, tested).

export const AIRPORTS: { code: string; name: string; lat: number; lon: number }[] = [
  { code: 'ATL', name: 'Atlanta', lat: 33.6407, lon: -84.4277 }, { code: 'DFW', name: 'Dallas–Fort Worth', lat: 32.8998, lon: -97.0403 },
  { code: 'DEN', name: 'Denver', lat: 39.8561, lon: -104.6737 }, { code: 'ORD', name: "Chicago O'Hare", lat: 41.9742, lon: -87.9073 },
  { code: 'LAX', name: 'Los Angeles', lat: 33.9416, lon: -118.4085 }, { code: 'JFK', name: 'New York JFK', lat: 40.6413, lon: -73.7781 },
  { code: 'CLT', name: 'Charlotte', lat: 35.2140, lon: -80.9431 }, { code: 'LAS', name: 'Las Vegas', lat: 36.0840, lon: -115.1537 },
];
/** ICAO callsign prefix -> airline and ticker. */
export const AIRLINES: { prefix: string; name: string; sym: string }[] = [
  { prefix: 'DAL', name: 'Delta', sym: 'DAL' }, { prefix: 'AAL', name: 'American', sym: 'AAL' }, { prefix: 'UAL', name: 'United', sym: 'UAL' },
  { prefix: 'SWA', name: 'Southwest', sym: 'LUV' }, { prefix: 'JBU', name: 'JetBlue', sym: 'JBLU' }, { prefix: 'ASA', name: 'Alaska', sym: 'ALK' },
  { prefix: 'FFT', name: 'Frontier', sym: 'ULCC' }, { prefix: 'SKW', name: 'SkyWest', sym: 'SKYW' }, { prefix: 'FDX', name: 'FedEx', sym: 'FDX' }, { prefix: 'UPS', name: 'UPS', sym: 'UPS' },
];

/** OpenSky state vectors: [icao24, callsign, country, timePos, lastContact, lon, lat, baroAlt, onGround, ...] */
export function countNear(states: any[], lat: number, lon: number, km = 40): { airborne: number; ground: number } {
  let airborne = 0, ground = 0;
  for (const s of Array.isArray(states) ? states : []) {
    const la = Number(s?.[6]), lo = Number(s?.[5]);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || distKm(lat, lon, la, lo) > km) continue;
    if (s[8]) ground++; else airborne++;
  }
  return { airborne, ground };
}
export function countAirlines(states: any[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of Array.isArray(states) ? states : []) {
    const cs = String(s?.[1] ?? '').trim().toUpperCase();
    if (s?.[8]) continue; // airborne only
    const a = AIRLINES.find((x) => cs.startsWith(x.prefix) && /\d/.test(cs.slice(x.prefix.length, x.prefix.length + 1)));
    if (a) out[a.prefix] = (out[a.prefix] ?? 0) + 1;
  }
  return out;
}
export function distKm(a1: number, o1: number, a2: number, o2: number): number {
  const r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  const h = Math.sin(dA / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
/** bounding box around a point for OpenSky's states query */
export const bbox = (lat: number, lon: number, km = 40) => { const d = km / 111, e = km / (111 * Math.cos((lat * Math.PI) / 180)); return { lamin: lat - d, lamax: lat + d, lomin: lon - e, lomax: lon + e }; };

/** Which kinds of stocks a weather alert touches, by event and state. */
const SECTOR_RULES: { re: RegExp; states?: string[]; sector: string }[] = [
  { re: /hurricane|tropical storm|storm surge/i, sector: 'Insurers, Gulf refiners and energy, utilities' },
  { re: /winter storm|blizzard|ice storm|extreme cold|freeze|hard freeze/i, states: ['TX', 'OK', 'LA', 'ND', 'NM'], sector: 'Natural gas and power (production and demand), utilities' },
  { re: /freeze|frost|drought/i, states: ['IA', 'IL', 'NE', 'KS', 'MN', 'IN', 'SD', 'MO', 'OH', 'CA', 'FL', 'GA'], sector: 'Agriculture (grains, citrus), farm equipment' },
  { re: /extreme heat|excessive heat|heat advisory|heat warning/i, sector: 'Power demand, utilities, natural gas' },
  { re: /flood|flash flood/i, sector: 'Insurers, rail and trucking, agriculture' },
  { re: /fire|red flag/i, states: ['CA', 'OR', 'WA', 'CO', 'AZ', 'NM', 'TX'], sector: 'Utilities (wildfire liability), insurers' },
  { re: /tornado|severe thunderstorm/i, sector: 'Insurers' },
];
export function sectorsFor(event: string, states: string[]): string[] {
  return [...new Set(SECTOR_RULES.filter((r) => r.re.test(event) && (!r.states || r.states.some((s) => states.includes(s)))).map((r) => r.sector))];
}
const US = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '));
/** NWS alert -> US states (from UGC zone codes like "TXZ123"; marine zones such as PK or GM are left out). */
export const alertStates = (p: any): string[] => [...new Set(((p?.geocode?.UGC ?? []) as string[]).map((z) => z.slice(0, 2)).filter((s) => US.has(s)))];

/** FRED CSV -> [{ date, value }] (drops "." gaps). */
export const fredCsv = (csv: string) => csv.trim().split('\n').slice(1).map((l) => l.split(',')).filter((r) => r[1] && r[1] !== '.').map((r) => ({ date: r[0], value: Number(r[1]) })).filter((r) => Number.isFinite(r.value));
/** change vs the value `back` rows earlier, % */
export const chg = (s: { value: number }[], back: number) => (s.length > back && s[s.length - 1 - back].value ? (s[s.length - 1].value / s[s.length - 1 - back].value - 1) * 100 : null);
