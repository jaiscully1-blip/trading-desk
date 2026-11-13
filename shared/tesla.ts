// Tesla & Lots: pure helpers (tested).
//  - registrations: monthly counts by brand / model from the Netherlands' official vehicle register (RDW open data)
//  - month over month and year over year changes
//  - lot fullness: a satellite brightness proxy for how full a big parking lot is (Sentinel-2, 10 m pixels). Cars are smaller
//    than a pixel, so this is NOT a car count: it's how bright and busy the lot looks vs its own emptiest and fullest months.

export interface MonthRow { month: string; counts: Record<string, number> }

/** RDW rows ({ m: '2026-08-01T00:00:00.000', merk|handelsbenaming: 'TESLA', n: '1035' }) -> months oldest first. */
export function rdwMonths(rows: any[], key: 'merk' | 'handelsbenaming'): MonthRow[] {
  const by = new Map<string, Record<string, number>>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const m = typeof r?.m === 'string' ? r.m.slice(0, 7) : '', k = String(r?.[key] ?? '').trim().toUpperCase(), n = Number(r?.n);
    if (!/^\d{4}-\d{2}$/.test(m) || !k || !Number.isFinite(n)) continue;
    const c = by.get(m) ?? {}; c[k] = (c[k] ?? 0) + n; by.set(m, c);
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, counts]) => ({ month, counts }));
}

const prevMonth = (m: string, back: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 - back, 1)); return d.toISOString().slice(0, 7); };

/** Change vs last month and the same month a year ago (null when that month isn't in the data or was zero). */
export function changes(rows: MonthRow[], key: string, month: string): { value: number; mom: number | null; yoy: number | null } {
  const get = (m: string) => rows.find((r) => r.month === m)?.counts[key];
  const v = get(month) ?? 0, p = get(prevMonth(month, 1)), y = get(prevMonth(month, 12));
  return { value: v, mom: p ? (v / p - 1) * 100 : null, yoy: y ? (v / y - 1) * 100 : null };
}

/** Quarter totals (Tesla reports deliveries by quarter; the Netherlands spikes in the last month of each quarter). */
export function quarters(rows: MonthRow[], key: string): { q: string; value: number; months: number }[] {
  const by = new Map<string, { value: number; months: number }>();
  for (const r of rows) {
    const [y, m] = r.month.split('-').map(Number);
    const q = `${y} Q${Math.ceil(m / 3)}`;
    const v = by.get(q) ?? { value: 0, months: 0 };
    v.value += r.counts[key] ?? 0; v.months++; by.set(q, v);
  }
  return [...by.entries()].map(([q, v]) => ({ q, ...v }));
}

/* ---------------- lots ---------------- */
export interface Lot { id: string; name: string; what: string; lat: number; lon: number; size: number }
/** Starting set. Centers are approximate (factory / terminal areas): adjust them on the page to sit on the lot itself. */
export const DEFAULT_LOTS: Lot[] = [
  { id: 'fremont', name: 'Tesla Fremont', what: 'Factory outbound lots, California', lat: 37.4925, lon: -121.9440, size: 800 },
  { id: 'austin', name: 'Giga Texas', what: 'Factory lots, Austin', lat: 30.2220, lon: -97.6210, size: 900 },
  { id: 'berlin', name: 'Giga Berlin', what: 'Factory lots, Grünheide', lat: 52.3970, lon: 13.7920, size: 800 },
  { id: 'shanghai', name: 'Giga Shanghai', what: 'Factory lots, Lingang', lat: 30.8790, lon: 121.7800, size: 900 },
  { id: 'zeebrugge', name: 'Port of Zeebrugge', what: 'Car import terminal, Belgium', lat: 51.3330, lon: 3.1930, size: 900 },
  { id: 'baltimore', name: 'Port of Baltimore', what: 'Dundalk car terminal, Maryland', lat: 39.2560, lon: -76.5260, size: 800 },
  { id: 'bremerhaven', name: 'Bremerhaven', what: 'Car terminal, Germany', lat: 53.5900, lon: 8.5300, size: 1000 },
  { id: 'walmart', name: 'Walmart Bentonville', what: 'Supercenter lot (retail traffic check)', lat: 36.3550, lon: -94.2090, size: 400 },
];

/** Square box around a point, as a GeoJSON polygon ring (lon, lat). */
export function boxAround(lat: number, lon: number, sizeM: number): [number, number][] {
  const dLat = sizeM / 2 / 111_320, dLon = sizeM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [[lon - dLon, lat - dLat], [lon + dLon, lat - dLat], [lon + dLon, lat + dLat], [lon - dLon, lat + dLat], [lon - dLon, lat - dLat]];
}

export interface Obs { date: string; mean: number; valid: number }
/** Sentinel Hub Statistical API answer -> clear observations (at least 80% of the box cloud-free). */
export function parseStats(j: any): Obs[] {
  const out: Obs[] = [];
  for (const d of Array.isArray(j?.data) ? j.data : []) {
    const s = d?.outputs?.bright?.bands?.B0?.stats;
    const n = Number(s?.sampleCount), nd = Number(s?.noDataCount), mean = Number(s?.mean);
    if (!Number.isFinite(mean) || !(n > 0)) continue;
    const valid = (n - (Number.isFinite(nd) ? nd : 0)) / n;
    if (valid < 0.8) continue;
    out.push({ date: String(d.interval?.from ?? '').slice(0, 10), mean, valid });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Monthly fullness 0-100: each month's median brightness, scaled between the lot's own lowest and highest month. */
export function fullness(obs: Obs[]): { month: string; index: number; n: number }[] {
  const by = new Map<string, number[]>();
  for (const o of obs) { const m = o.date.slice(0, 7); by.set(m, [...(by.get(m) ?? []), o.mean]); }
  const med = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, xs]) => { const s = [...xs].sort((a, b) => a - b); return { month, v: s[Math.floor(s.length / 2)], n: xs.length }; });
  if (med.length < 2) return med.map((m) => ({ month: m.month, index: 50, n: m.n }));
  const lo = Math.min(...med.map((m) => m.v)), hi = Math.max(...med.map((m) => m.v)), span = hi - lo || 1;
  return med.map((m) => ({ month: m.month, index: Math.round(((m.v - lo) / span) * 100), n: m.n }));
}

/** The evalscript: average visible brightness per pixel, with clouds, shadows and snow masked out (scene classification). */
export const LOT_EVALSCRIPT = `//VERSION=3
function setup() { return { input: [{ bands: ["B02", "B03", "B04", "SCL", "dataMask"] }], output: [{ id: "bright", bands: 1, sampleType: "FLOAT32" }, { id: "dataMask", bands: 1 }] }; }
function evaluatePixel(s) { var bad = [0, 1, 3, 8, 9, 10, 11].indexOf(s.SCL) >= 0; return { bright: [(s.B02 + s.B03 + s.B04) / 3], dataMask: [s.dataMask && !bad ? 1 : 0] }; }`;
