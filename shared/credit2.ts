// Credit & Swaps tab: the ratings ladder (ICE BofA spreads and yields by rating, Moody's Aaa / Baa), tranche and loan
// proxies (CLO, CMBS, MBS, leveraged loan, BDC ETFs), credit-vs-stocks divergence, Treasury futures positioning (CFTC),
// and a Merton-style distance to default from a stock's price, volatility and debt. Pure functions (tested).

export const LADDER: { grade: string; oas: string; yld: string }[] = [
  { grade: 'AAA', oas: 'BAMLC0A1CAAA', yld: 'BAMLC0A1CAAAEY' },
  { grade: 'AA', oas: 'BAMLC0A2CAA', yld: 'BAMLC0A2CAAEY' },
  { grade: 'A', oas: 'BAMLC0A3CA', yld: 'BAMLC0A3CAEY' },
  { grade: 'BBB', oas: 'BAMLC0A4CBBB', yld: 'BAMLC0A4CBBBEY' },
  { grade: 'BB', oas: 'BAMLH0A1HYBB', yld: 'BAMLH0A1HYBBEY' },
  { grade: 'B', oas: 'BAMLH0A2HYB', yld: 'BAMLH0A2HYBEY' },
  { grade: 'CCC & below', oas: 'BAMLH0A3HYC', yld: 'BAMLH0A3HYCEY' },
];
export const MOODYS = [{ id: 'DAAA', label: "Moody's Aaa corporate yield" }, { id: 'DBAA', label: "Moody's Baa corporate yield" }, { id: 'BAA10Y', label: 'Baa minus 10-year Treasury' }];
export const PROXIES: { sym: string; what: string }[] = [
  { sym: 'JAAA', what: 'AAA CLO tranches' }, { sym: 'JBBB', what: 'BBB CLO tranches' }, { sym: 'CMBS', what: 'Commercial mortgage-backed bonds' },
  { sym: 'MBB', what: 'Agency mortgage-backed bonds' }, { sym: 'BKLN', what: 'Leveraged loans' }, { sym: 'SRLN', what: 'Senior loans' },
  { sym: 'BIZD', what: 'BDCs (private credit lenders)' }, { sym: 'HYG', what: 'High-yield bonds' }, { sym: 'LQD', what: 'Investment-grade bonds' }, { sym: 'SPY', what: 'S&P 500' },
];
export const COT: { code: string; label: string }[] = [
  { code: '042601', label: '2-year note' }, { code: '044601', label: '5-year note' }, { code: '043602', label: '10-year note' },
  { code: '043607', label: 'Ultra 10-year' }, { code: '020601', label: 'Treasury bond' }, { code: '020604', label: 'Ultra bond' },
];

/** value now, about a month ago and a year ago from an oldest-first series of [date, value] */
export function deltas(pts: [string, number][]): { last: number | null; date: string | null; m1: number | null; y1: number | null } {
  if (!pts.length) return { last: null, date: null, m1: null, y1: null };
  const [date, last] = pts[pts.length - 1];
  const at = (days: number) => { const t = Date.parse(date) - days * 86400_000; let best: number | null = null; for (const [d, v] of pts) { if (Date.parse(d) <= t) best = v; else break; } return best; };
  return { last, date, m1: at(30), y1: at(365) };
}
/** % change over n trading days */
export const pctChg = (c: number[], n: number) => (c.length > n && c[c.length - 1 - n] ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null);

/** Stocks up while high-yield spreads widen: credit has often turned before stocks (not always). */
export function divergence(hyOasNow: number | null, hyOasMonthAgo: number | null, spy1m: number | null): { bp: number | null; spy: number | null; flag: 'credit-warns' | 'credit-confirms-selloff' | 'both-calm' | null } {
  if (hyOasNow == null || hyOasMonthAgo == null || spy1m == null) return { bp: null, spy: spy1m, flag: null };
  const bp = Math.round((hyOasNow - hyOasMonthAgo) * 100);
  return { bp, spy: spy1m, flag: bp >= 25 && spy1m > 0 ? 'credit-warns' : bp >= 25 && spy1m <= 0 ? 'credit-confirms-selloff' : 'both-calm' };
}

const ncdf = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
/** annualized volatility of daily closes */
export function annVol(c: number[]): number | null {
  const r: number[] = []; for (let i = 1; i < c.length; i++) if (c[i - 1] > 0 && c[i] > 0) r.push(Math.log(c[i] / c[i - 1]));
  if (r.length < 30) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
}
/**
 * Simplified Merton / KMV: assets ≈ equity + debt, asset vol ≈ equity vol × E / (E + D), default point = short-term debt
 * + half of long-term debt, one-year horizon, zero drift. Distance to default in standard deviations, and the model PD.
 */
export function merton(equity: number, stDebt: number, ltDebt: number, eqVol: number): { dd: number; pd: number; assets: number; point: number } | null {
  const D = stDebt + ltDebt, point = stDebt + 0.5 * ltDebt;
  if (!(equity > 0 && eqVol > 0 && point > 0)) return null;
  const V = equity + D, sv = eqVol * equity / V;
  const dd = (Math.log(V / point) - 0.5 * sv * sv) / sv;
  return { dd: Math.round(dd * 100) / 100, pd: ncdf(-dd), assets: V, point };
}
