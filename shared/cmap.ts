// Commodity map: a tile map of the 50 states with free government layers (US Drought Monitor, NWS severe alerts,
// FEMA disaster declarations) and the main producing states for farm and energy commodities, tied to tickers.

/** Tile-grid position [row, col] for each state (equal-size squares, roughly where the state sits). */
export const TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [0, 11],
  WI: [1, 6], VT: [1, 10], NH: [1, 11],
  WA: [2, 1], ID: [2, 2], MT: [2, 3], ND: [2, 4], MN: [2, 5], IL: [2, 6], MI: [2, 7], NY: [2, 9], MA: [2, 10],
  OR: [3, 1], NV: [3, 2], WY: [3, 3], SD: [3, 4], IA: [3, 5], IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10], RI: [3, 11],
  CA: [4, 1], UT: [4, 2], CO: [4, 3], NE: [4, 4], MO: [4, 5], KY: [4, 6], WV: [4, 7], VA: [4, 8], MD: [4, 9], DE: [4, 10],
  AZ: [5, 2], NM: [5, 3], KS: [5, 4], AR: [5, 5], TN: [5, 6], NC: [5, 7], SC: [5, 8],
  OK: [6, 4], LA: [6, 5], MS: [6, 6], AL: [6, 7], GA: [6, 8],
  HI: [7, 0], TX: [7, 4], FL: [7, 9],
};

/** State FIPS codes (the Drought Monitor API takes these). */
export const FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19',
  KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34',
  NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50',
  VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
};

export interface Commodity { id: string; label: string; states: string[]; tickers: { sym: string; why: string }[] }
/**
 * Main producing states, largest first. Approximate, from recent USDA NASS (crops, cattle) and EIA (oil, gas) annual
 * rankings; the exact order moves year to year (unverified).
 */
export const COMMODITIES: Commodity[] = [
  { id: 'corn', label: 'Corn', states: ['IA', 'IL', 'NE', 'MN', 'IN', 'SD', 'KS', 'OH', 'WI', 'MO'], tickers: [{ sym: 'CORN', why: 'corn futures ETF' }, { sym: 'ADM', why: 'grain buyer and processor' }, { sym: 'CTVA', why: 'seed and crop chemicals' }, { sym: 'DE', why: 'farm equipment' }] },
  { id: 'soy', label: 'Soybeans', states: ['IL', 'IA', 'MN', 'IN', 'NE', 'OH', 'MO', 'ND', 'SD', 'AR'], tickers: [{ sym: 'SOYB', why: 'soybean futures ETF' }, { sym: 'BG', why: 'oilseed processor' }, { sym: 'ADM', why: 'crusher and processor' }] },
  { id: 'wheat', label: 'Wheat', states: ['KS', 'ND', 'MT', 'WA', 'OK', 'ID', 'SD', 'CO', 'TX', 'MN'], tickers: [{ sym: 'WEAT', why: 'wheat futures ETF' }, { sym: 'ADM', why: 'flour milling' }] },
  { id: 'fert', label: 'Fertilizer demand', states: ['IA', 'IL', 'NE', 'MN', 'IN', 'KS'], tickers: [{ sym: 'NTR', why: 'potash and nitrogen' }, { sym: 'CF', why: 'nitrogen' }, { sym: 'MOS', why: 'potash and phosphate' }] },
  { id: 'cattle', label: 'Cattle', states: ['TX', 'NE', 'KS', 'OK', 'CA', 'MO', 'IA', 'SD', 'CO', 'MT'], tickers: [{ sym: 'TSN', why: 'beef packer' }] },
  { id: 'oil', label: 'Crude oil', states: ['TX', 'NM', 'ND', 'AK', 'CO', 'OK', 'WY', 'CA', 'UT', 'LA'], tickers: [{ sym: 'USO', why: 'oil futures ETF' }, { sym: 'XOP', why: 'oil and gas producers' }, { sym: 'XLE', why: 'energy sector' }] },
  { id: 'gas', label: 'Natural gas', states: ['TX', 'PA', 'LA', 'WV', 'OK', 'NM', 'CO', 'OH', 'ND', 'WY'], tickers: [{ sym: 'UNG', why: 'natural gas futures ETF' }, { sym: 'EQT', why: 'Appalachian gas producer' }] },
];

export interface Drought { day: string; none: number; d0: number; d1: number; d2: number; d3: number; d4: number }
/** Drought Monitor "area percent" rows (cumulative: d1 includes d2..d4) -> latest week per state. */
export function latestDrought(rows: any[]): Record<string, Drought> {
  const out: Record<string, Drought> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const st = String(r?.stateAbbreviation ?? ''), day = String(r?.mapDate ?? '').slice(0, 10);
    if (!st || !day || (out[st] && out[st].day >= day)) continue;
    out[st] = { day, none: +r.none || 0, d0: +r.d0 || 0, d1: +r.d1 || 0, d2: +r.d2 || 0, d3: +r.d3 || 0, d4: +r.d4 || 0 };
  }
  return out;
}
/** Worst drought level covering at least 10% of the state: -1 none, 0 = D0 (abnormally dry) .. 4 = D4 (exceptional). */
export const droughtLevel = (d?: Drought): number => (!d ? -1 : d.d4 >= 10 ? 4 : d.d3 >= 10 ? 3 : d.d2 >= 10 ? 2 : d.d1 >= 10 ? 1 : d.d0 >= 10 ? 0 : -1);
export const DROUGHT_LABEL = ['D0 abnormally dry', 'D1 moderate drought', 'D2 severe drought', 'D3 extreme drought', 'D4 exceptional drought'];

export interface FemaDecl { title: string; type: string; date: string }
/** FEMA declaration rows -> unique declarations per state, newest first. */
export function femaByState(rows: any[]): Record<string, FemaDecl[]> {
  const out: Record<string, FemaDecl[]> = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const st = String(r?.state ?? ''); if (!st) continue;
    const d: FemaDecl = { title: String(r.declarationTitle ?? '').trim(), type: String(r.incidentType ?? ''), date: String(r.declarationDate ?? '').slice(0, 10) };
    const xs = (out[st] ??= []);
    if (!xs.some((x) => x.title === d.title && x.date === d.date)) xs.push(d);
  }
  for (const xs of Object.values(out)) xs.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}
