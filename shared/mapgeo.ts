// Tiny map maths for the world map: Natural Earth projection (same as d3's geoNaturalEarth1, with the scale and offset
// baked into src/data/worldLand.ts), the day/night edge for a moment in time, and which stock markets are open.
// No map library is needed in the browser, so the map draws immediately.

export interface Fit { scale: number; tx: number; ty: number }
const R = Math.PI / 180;

/** [lon, lat] degrees -> [x, y] pixels */
export function project(lon: number, lat: number, f: Fit): [number, number] {
  const l = lon * R, p = lat * R, p2 = p * p, p4 = p2 * p2;
  const x = l * (0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4)));
  const y = p * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  return [f.tx + f.scale * x, f.ty - f.scale * y];
}

/** Where the sun is straight overhead (approximate: ignores the equation of time, good to about 4 degrees). */
export function subsolar(ms: number): { lat: number; lon: number } {
  const d = new Date(ms);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400_000;
  const lat = -23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10));
  const hours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  let lon = -15 * (hours - 12);
  lon = ((lon + 540) % 360) - 180;
  return { lat, lon };
}

/** SVG path of the night side of the map. */
export function nightPath(ms: number, f: Fit): string {
  const s = subsolar(ms);
  const dec = Math.abs(s.lat) < 0.5 ? (s.lat < 0 ? -0.5 : 0.5) : s.lat;
  const term = (lon: number) => Math.atan(-Math.cos((lon - s.lon) * R) / Math.tan(dec * R)) / R; // latitude of the day/night edge at this longitude
  const pole = dec > 0 ? -90 : 90; // the pole that sits in the dark
  const pts: [number, number][] = [];
  for (let lon = -180; lon <= 180; lon += 5) pts.push([lon, term(lon)]);
  const t180 = term(180), tm180 = term(-180);
  for (let k = 1; k <= 6; k++) pts.push([180, t180 + ((pole - t180) * k) / 6]);
  for (let k = 1; k <= 6; k++) pts.push([180 - (360 * k) / 6, pole]);
  for (let k = 1; k < 6; k++) pts.push([-180, pole + ((tm180 - pole) * k) / 6]);
  return 'M' + pts.map(([lo, la]) => project(lo, la, f).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';
}

export interface Market { id: string; name: string; tz: string; open: [number, number]; close: [number, number]; lat: number; lon: number }
/** Regular trading hours in each exchange's own time zone (lunch breaks and holidays are not modelled). */
export const MARKETS: Market[] = [
  { id: 'tse', name: 'Tokyo', tz: 'Asia/Tokyo', open: [9, 0], close: [15, 30], lat: 35.7, lon: 139.7 },
  { id: 'hkex', name: 'Hong Kong', tz: 'Asia/Hong_Kong', open: [9, 30], close: [16, 0], lat: 22.3, lon: 114.2 },
  { id: 'nse', name: 'Mumbai', tz: 'Asia/Kolkata', open: [9, 15], close: [15, 30], lat: 19.1, lon: 72.9 },
  { id: 'lse', name: 'London', tz: 'Europe/London', open: [8, 0], close: [16, 30], lat: 51.5, lon: -0.1 },
  { id: 'nyse', name: 'New York', tz: 'America/New_York', open: [9, 30], close: [16, 0], lat: 40.7, lon: -74 },
  { id: 'asx', name: 'Sydney', tz: 'Australia/Sydney', open: [10, 0], close: [16, 0], lat: -33.9, lon: 151.2 },
];

/** Is this market inside its regular hours right now (weekdays only)? */
export function isOpen(m: Market, ms: number): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: m.tz, weekday: 'short', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const mins = +p.hour * 60 + +p.minute;
  return mins >= m.open[0] * 60 + m.open[1] && mins < m.close[0] * 60 + m.close[1];
}
