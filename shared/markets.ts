// Market-wide snapshot (price, % change, market cap) for the S&P 500 / Nasdaq-100 list, plus the math for the
// sector heatmap, the stock-by-state map, ETF holdings and custom baskets. Pure functions only.
import { COMPANIES } from './data/companies.js';

export interface Snap { p: number; c: number; mc: number | null }
export type SnapMap = Record<string, Snap>;

/** TradingView screener response -> { SYM: snap }. Rows look like { s: 'NASDAQ:NVDA', d: [name, close, change%, market cap] }. */
export function parseTvScan(j: any): SnapMap {
  const out: SnapMap = {};
  for (const r of Array.isArray(j?.data) ? j.data : []) {
    const d = r?.d;
    if (!Array.isArray(d)) continue;
    const sym = String(d[0] ?? String(r.s ?? '').split(':')[1] ?? '').toUpperCase().replace('/', '.');
    const p = Number(d[1]), c = Number(d[2]), mc = Number(d[3]);
    if (!sym || !Number.isFinite(p) || !Number.isFinite(c) || out[sym]) continue;
    out[sym] = { p, c, mc: Number.isFinite(mc) && mc > 0 ? mc : null };
  }
  return out;
}
export const TV_BODY = {
  filter: [{ left: 'type', operation: 'in_range', right: ['stock', 'dr', 'fund'] }, { left: 'market_cap_basic', operation: 'greater', right: 3e9 }],
  markets: ['america'], columns: ['name', 'close', 'change', 'market_cap_basic'], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }, range: [0, 1600],
};

/** Yahoo spark (v7 or v8 shape) -> { SYM: snap } without market caps. */
export function parseYahooSpark(j: any): SnapMap {
  const out: SnapMap = {};
  const add = (sym: string, meta: any, closes?: number[]) => {
    const p = Number(meta?.regularMarketPrice ?? closes?.[closes.length - 1]);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (sym && Number.isFinite(p) && Number.isFinite(prev) && prev > 0) out[sym.toUpperCase().replace('-', '.')] = { p, c: ((p - prev) / prev) * 100, mc: null };
  };
  for (const r of j?.spark?.result ?? []) add(r.symbol, r.response?.[0]?.meta, r.response?.[0]?.indicators?.quote?.[0]?.close);
  if (!j?.spark) for (const [sym, v] of Object.entries<any>(j ?? {})) if (v && typeof v === 'object') add(v.symbol ?? sym, v, v.close);
  return out;
}

/* ---------------- states ---------------- */
export const STATE_XY: Record<string, [string, number, number]> = {
  Alabama: ['AL', 32.8, -86.8], Alaska: ['AK', 64.2, -149.5], Arizona: ['AZ', 34.3, -111.7], Arkansas: ['AR', 34.9, -92.4], California: ['CA', 37.2, -119.5],
  Colorado: ['CO', 39.0, -105.5], Connecticut: ['CT', 41.6, -72.7], Delaware: ['DE', 39.0, -75.5], 'D.C.': ['DC', 38.9, -77.0], Florida: ['FL', 28.6, -82.4],
  Georgia: ['GA', 32.7, -83.4], Hawaii: ['HI', 20.8, -156.3], Idaho: ['ID', 44.4, -114.6], Illinois: ['IL', 40.0, -89.2], Indiana: ['IN', 39.9, -86.3],
  Iowa: ['IA', 42.1, -93.5], Kansas: ['KS', 38.5, -98.4], Kentucky: ['KY', 37.5, -85.3], Louisiana: ['LA', 31.1, -92.0], Maine: ['ME', 45.4, -69.2],
  Maryland: ['MD', 39.0, -76.8], Massachusetts: ['MA', 42.3, -71.8], Michigan: ['MI', 43.3, -84.5], Minnesota: ['MN', 46.3, -94.3], Mississippi: ['MS', 32.7, -89.7],
  Missouri: ['MO', 38.4, -92.5], Montana: ['MT', 47.0, -109.6], Nebraska: ['NE', 41.5, -99.8], Nevada: ['NV', 39.3, -116.6], 'New Hampshire': ['NH', 43.7, -71.6],
  'New Jersey': ['NJ', 40.2, -74.7], 'New Mexico': ['NM', 34.4, -106.1], 'New York': ['NY', 42.9, -75.5], 'North Carolina': ['NC', 35.6, -79.4], 'North Dakota': ['ND', 47.5, -100.5],
  Ohio: ['OH', 40.3, -82.8], Oklahoma: ['OK', 35.6, -97.5], Oregon: ['OR', 43.9, -120.6], Pennsylvania: ['PA', 40.9, -77.8], 'Rhode Island': ['RI', 41.7, -71.5],
  'South Carolina': ['SC', 33.9, -80.9], 'South Dakota': ['SD', 44.4, -100.2], Tennessee: ['TN', 35.9, -86.4], Texas: ['TX', 31.5, -99.3], Utah: ['UT', 39.3, -111.7],
  Vermont: ['VT', 44.1, -72.7], Virginia: ['VA', 37.5, -78.9], Washington: ['WA', 47.4, -120.5], 'West Virginia': ['WV', 38.6, -80.6], Wisconsin: ['WI', 44.6, -89.9], Wyoming: ['WY', 43.0, -107.6],
};
export const stateOf = (hq: string) => { const s = hq.split(',').pop()!.trim(); return STATE_XY[s] ? s : null; };

export interface StateAgg { state: string; ab: string; lat: number; lon: number; n: number; priced: number; avg: number | null; capWtd: number | null; syms: string[] }
/** Companies grouped by HQ state with the average (and cap-weighted) move today. */
export function stateAgg(snap: SnapMap): StateAgg[] {
  const by = new Map<string, StateAgg & { _w: number; _cw: number; _sum: number }>();
  for (const c of COMPANIES) {
    const st = stateOf(c[4]);
    if (!st) continue;
    const [ab, lat, lon] = STATE_XY[st];
    const v = by.get(st) ?? { state: st, ab, lat, lon, n: 0, priced: 0, avg: null, capWtd: null, syms: [], _w: 0, _cw: 0, _sum: 0 };
    v.n++; v.syms.push(c[0]);
    const q = snap[c[0]];
    if (q) { v.priced++; v._sum += q.c; if (q.mc) { v._w += q.mc; v._cw += q.c * q.mc; } }
    by.set(st, v);
  }
  return [...by.values()].map(({ _w, _cw, _sum, ...v }) => ({ ...v, avg: v.priced ? _sum / v.priced : null, capWtd: _w ? _cw / _w : null })).sort((a, b) => b.n - a.n);
}

/* ---------------- treemap (squarified) ---------------- */
export interface Rect { x: number; y: number; w: number; h: number }
export function squarify<T extends { v: number }>(items: T[], box: Rect): (T & Rect)[] {
  const out: (T & Rect)[] = [];
  const list = items.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const total = list.reduce((s, i) => s + i.v, 0);
  if (!total || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  let { x, y, w, h } = box;
  let row: T[] = [];
  const worst = (r: T[], side: number) => {
    const s = r.reduce((a, i) => a + i.v * scale, 0);
    const mx = Math.max(...r.map((i) => i.v * scale)), mn = Math.min(...r.map((i) => i.v * scale));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const lay = (r: T[]) => {
    const s = r.reduce((a, i) => a + i.v * scale, 0);
    if (w >= h) { const cw = s / h; let cy = y; for (const i of r) { const ih = (i.v * scale) / cw; out.push({ ...i, x, y: cy, w: cw, h: ih }); cy += ih; } x += cw; w -= cw; }
    else { const rh = s / w; let cx = x; for (const i of r) { const iw = (i.v * scale) / rh; out.push({ ...i, x: cx, y, w: iw, h: rh }); cx += iw; } y += rh; h -= rh; }
  };
  for (const it of list) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, it], side) <= worst(row, side)) row.push(it);
    else { lay(row); row = [it]; }
  }
  if (row.length) lay(row);
  return out;
}

/* ---------------- ETF holdings ---------------- */
export interface Holding { sym: string; name: string; weight: number }
export interface EtfProfile { sym: string; holdings: Holding[]; sectors: { sector: string; weight: number }[]; netAssets: number | null; expense: number | null; updated: string | null; approx?: boolean }
export function parseEtfProfile(sym: string, j: any): EtfProfile {
  if (j?.Note || j?.Information || j?.['Error Message']) throw new Error(String(j.Note || j.Information || j['Error Message']).slice(0, 140));
  const holdings = (Array.isArray(j?.holdings) ? j.holdings : [])
    .map((h: any) => ({ sym: String(h.symbol ?? ''), name: String(h.description ?? ''), weight: parseFloat(h.weight) || 0 }))
    .filter((h: Holding) => h.weight > 0)
    .map((h: Holding) => ({ ...h, sym: h.sym === 'n/a' ? '' : h.sym.toUpperCase(), name: h.name === 'n/a' ? '' : h.name }));
  if (!holdings.length) throw new Error('no holdings returned');
  const sectors = (Array.isArray(j?.sectors) ? j.sectors : []).map((s: any) => ({ sector: String(s.sector ?? ''), weight: parseFloat(s.weight) || 0 })).filter((s: any) => s.weight > 0.001);
  const n = (v: unknown) => (Number.isFinite(parseFloat(String(v))) ? parseFloat(String(v)) : null);
  return { sym, holdings, sectors, netAssets: n(j?.net_assets), expense: n(j?.net_expense_ratio), updated: j?.last_updated ? String(j.last_updated) : null };
}
// SPDR sector funds hold the S&P 500 members of one GICS sector, weighted by market cap (capped), so with live caps
// the members can stand in when the issuer data is unavailable.
export const SECTOR_ETF: Record<string, string> = {
  XLK: 'Information Technology', XLF: 'Financials', XLV: 'Health Care', XLY: 'Consumer Discretionary', XLP: 'Consumer Staples', XLE: 'Energy',
  XLI: 'Industrials', XLB: 'Materials', XLU: 'Utilities', XLRE: 'Real Estate', XLC: 'Communication Services',
};
export function approxSectorEtf(sym: string, snap: SnapMap): EtfProfile | null {
  const sec = SECTOR_ETF[sym];
  if (!sec) return null;
  const rows = COMPANIES.filter((c) => c[2] === sec && c[7] === 'spx' && snap[c[0]]?.mc).map((c) => ({ sym: c[0], name: c[1], mc: snap[c[0]].mc! }));
  const tot = rows.reduce((s, r) => s + r.mc, 0);
  if (!tot) return null;
  return { sym, holdings: rows.map((r) => ({ sym: r.sym, name: r.name, weight: r.mc / tot })).sort((a, b) => b.weight - a.weight), sectors: [{ sector: sec, weight: 1 }], netAssets: null, expense: null, updated: null, approx: true };
}
/** Weighted move of an ETF's priced holdings today, and how much of the fund that covers. */
export function holdingsMove(h: Holding[], snap: SnapMap) {
  let w = 0, m = 0;
  for (const x of h) { const q = snap[x.sym]; if (q) { w += x.weight; m += x.weight * q.c; } }
  return { move: w ? m / w : null, covered: w };
}

/* ---------------- baskets ---------------- */
export interface Basket { id: string; name: string; syms: string[] }
export type Closes = Record<string, [number, number][]>; // sym -> [unix seconds, close]
/** Equal-weight basket (rebalanced daily, i.e. average daily return) vs a benchmark, from `start` (unix s), indexed to 100. */
export function basketCurve(closes: Closes, syms: string[], bench: string, start: number) {
  const dayMap = (s: string) => new Map((closes[s] ?? []).filter(([t]) => t >= start).map(([t, c]) => [t, c] as const));
  const bm = dayMap(bench);
  const days = [...bm.keys()].sort((a, b) => a - b);
  const maps = syms.map(dayMap);
  const out: { t: number; basket: number; bench: number }[] = [];
  let b = 100, k = 100;
  const last: (number | undefined)[] = syms.map(() => undefined);
  let lastB: number | undefined;
  for (const t of days) {
    const rs: number[] = [];
    maps.forEach((m, i) => { const c = m.get(t); if (c != null) { if (last[i] != null) rs.push(c / last[i]! - 1); last[i] = c; } });
    const cb = bm.get(t)!;
    if (lastB != null) { k *= cb / lastB; if (rs.length) b *= 1 + rs.reduce((s, r) => s + r, 0) / rs.length; }
    lastB = cb;
    out.push({ t, basket: b, bench: k });
  }
  const per = syms.map((s, i) => { const m = maps[i]; const ts = [...m.keys()].sort((a, c) => a - c); return { sym: s, ret: ts.length > 1 ? (m.get(ts[ts.length - 1])! / m.get(ts[0])! - 1) * 100 : null }; });
  return { curve: out, per };
}
