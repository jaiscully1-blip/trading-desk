// Cross-asset leverage and carry: FX carry trades (yen, franc funded), bond carry and European yields, global debt
// (BIS), margin debt (FINRA), private-credit lenders (BDC prices), and options income / short vol / dispersion gauges.
// Pure helpers (tested); the route is api/_lib/research/xasset.ts.

/** 3-month interbank rates (OECD, monthly, on FRED). */
export const RATES: Record<string, { id: string; label: string }> = {
  USD: { id: 'IR3TIB01USM156N', label: 'US' }, JPY: { id: 'IR3TIB01JPM156N', label: 'Japan' }, CHF: { id: 'IR3TIB01CHM156N', label: 'Switzerland' },
  AUD: { id: 'IR3TIB01AUM156N', label: 'Australia' }, NZD: { id: 'IR3TIB01NZM156N', label: 'New Zealand' }, MXN: { id: 'IR3TIB01MXM156N', label: 'Mexico' },
  ZAR: { id: 'IR3TIB01ZAM156N', label: 'South Africa' }, EUR: { id: 'IR3TIB01EZM156N', label: 'Euro area' },
};
/** Carry pairs: borrow the funding currency, hold the target. `yahoo` is the price of 1 target in funding currency. */
export const CARRY: { target: string; fund: string; yahoo: string }[] = [
  { target: 'USD', fund: 'JPY', yahoo: 'JPY=X' }, { target: 'AUD', fund: 'JPY', yahoo: 'AUDJPY=X' }, { target: 'MXN', fund: 'JPY', yahoo: 'MXNJPY=X' },
  { target: 'NZD', fund: 'JPY', yahoo: 'NZDJPY=X' }, { target: 'ZAR', fund: 'JPY', yahoo: 'ZARJPY=X' }, { target: 'EUR', fund: 'JPY', yahoo: 'EURJPY=X' },
  { target: 'MXN', fund: 'CHF', yahoo: 'MXNCHF=X' }, { target: 'USD', fund: 'CHF', yahoo: 'CHF=X' },
];
/** 10-year government yields (OECD monthly on FRED) plus daily US. */
export const TENS: { id: string; label: string; daily?: boolean }[] = [
  { id: 'DGS10', label: 'US', daily: true }, { id: 'IRLTLT01DEM156N', label: 'Germany' }, { id: 'IRLTLT01FRM156N', label: 'France' },
  { id: 'IRLTLT01ITM156N', label: 'Italy' }, { id: 'IRLTLT01GBM156N', label: 'UK' }, { id: 'IRLTLT01JPM156N', label: 'Japan' },
];
export const DEBT_CTY = ['US', 'JP', 'CN', 'DE', 'FR', 'IT', 'GB', 'CA'];
export const VOL_SYMS = ['^VIX', '^VIX9D', '^VIX3M', '^VVIX', '^COR1M', '^DSPX', '^BXM', '^PUT', '^GSPC', 'SPY', 'QQQ', 'JEPI', 'JEPQ', 'QYLD', 'XYLD', 'SVXY'];
export const BDCS = [{ sym: 'ARCC', name: 'Ares Capital' }, { sym: 'OBDC', name: 'Blue Owl Capital' }, { sym: 'FSK', name: 'FS KKR Capital' }, { sym: 'BXSL', name: 'Blackstone Secured Lending' }, { sym: 'MAIN', name: 'Main Street Capital' }, { sym: 'BIZD', name: 'BDC ETF' }];

/** annualized vol of daily closes (log returns) */
export function vol(c: number[], n = 252): number | null {
  const x = c.slice(-n - 1), r: number[] = [];
  for (let i = 1; i < x.length; i++) if (x[i - 1] > 0 && x[i] > 0) r.push(Math.log(x[i] / x[i - 1]));
  if (r.length < 20) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1) * 252);
}
export const chgPct = (c: number[], n: number) => (c.length > n && c[c.length - 1 - n] > 0 ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null);

export interface CarryRow { pair: string; target: string; fund: string; carry: number | null; vol: number | null; ratio: number | null; m1: number | null; m3: number | null; unwind: boolean }
/** Carry = target rate − funding rate (% a year). Carry / vol is the classic "is it worth it" ratio. Unwind = the pair fell 5%+ in a month. */
export function carryRow(p: { target: string; fund: string }, rates: Record<string, number | null>, closes: number[]): CarryRow {
  const t = rates[p.target], f = rates[p.fund];
  const carry = t != null && f != null ? Math.round((t - f) * 100) / 100 : null, v = vol(closes), m1 = chgPct(closes, 21);
  return { pair: `${p.target}/${p.fund}`, target: p.target, fund: p.fund, carry, vol: v != null ? Math.round(v * 1000) / 10 : null, ratio: carry != null && v ? Math.round((carry / (v * 100)) * 100) / 100 : null, m1, m3: chgPct(closes, 63), unwind: m1 != null && m1 <= -5 };
}

/** FINRA margin sheet rows -> [month, debit balances $M, free credits $M] newest first */
export function marginRows(rows: string[][]): { month: string; debit: number; credit: number }[] {
  return rows.filter((r) => /^\d{4}-\d{2}$/.test(r[0] ?? '')).map((r) => ({ month: r[0], debit: Number(r[1]) || 0, credit: (Number(r[2]) || 0) + (Number(r[3]) || 0) })).filter((r) => r.debit > 0);
}

/** VIX term structure read: VIX / VIX3M above 1 = backwardation (near-term fear above longer-term), the usual stress sign. */
export function termRead(vix: number | null, vix3m: number | null): { ratio: number | null; state: 'backwardation' | 'flat' | 'contango' | null } {
  if (vix == null || !vix3m) return { ratio: null, state: null };
  const ratio = Math.round((vix / vix3m) * 100) / 100;
  return { ratio, state: ratio > 1.02 ? 'backwardation' : ratio < 0.95 ? 'contango' : 'flat' };
}
