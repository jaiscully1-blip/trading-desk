// Credit market: spreads, curve, stress, lending and delinquency series (FRED, free) plus bond ETFs (Yahoo). Pure helpers here, tested.
// Facts and historical context only: no forecasts, no advice. Credit spreads are the extra yield investors demand to hold riskier debt
// over Treasuries; wide means the market is pricing more default risk, tight means less. Nothing here can trade.
export type Pts = [string, number][]; // [YYYY-MM-DD, value], oldest first
export interface Meta { id: string; key: string; label: string; unit: 'pp' | 'index' | '%'; daily: boolean; note: string }
export const SERIES: Meta[] = [
  { id: 'BAMLH0A0HYM2', key: 'hy', label: 'High-yield spread', unit: 'pp', daily: true, note: 'ICE BofA US High Yield option-adjusted spread over Treasuries, percentage points. The main gauge of junk-bond stress.' },
  { id: 'BAMLC0A0CM', key: 'ig', label: 'Investment-grade spread', unit: 'pp', daily: true, note: 'ICE BofA US Corporate (investment grade) spread. Usually far lower and calmer than high yield.' },
  { id: 'BAMLC0A4CBBB', key: 'bbb', label: 'BBB spread', unit: 'pp', daily: true, note: 'The lowest investment-grade rung. Falling out of BBB turns a bond into a junk bond, so this edge matters.' },
  { id: 'BAMLH0A1HYBB', key: 'bb', label: 'BB spread', unit: 'pp', daily: true, note: 'The best junk rung.' },
  { id: 'BAMLH0A3HYC', key: 'ccc', label: 'CCC and lower spread', unit: 'pp', daily: true, note: 'The riskiest corporate bonds. It tends to move first and most when stress builds.' },
  { id: 'T10Y2Y', key: 'c2', label: 'Yield curve, 10y minus 2y', unit: 'pp', daily: true, note: 'Below zero is an inverted curve: short-term Treasuries yield more than long-term ones.' },
  { id: 'T10Y3M', key: 'c3m', label: 'Yield curve, 10y minus 3m', unit: 'pp', daily: true, note: 'Another curve measure; the one the New York Fed uses for its recession-probability model.' },
  { id: 'STLFSI4', key: 'stress', label: 'St. Louis Fed financial stress index', unit: 'index', daily: false, note: 'Weekly. Zero is average; above zero is more stress than average, below zero is less.' },
  { id: 'NFCI', key: 'nfci', label: 'Chicago Fed financial conditions', unit: 'index', daily: false, note: 'Weekly. Zero is average; above zero means tighter-than-average financial conditions.' },
  { id: 'DRTSCILM', key: 'sloos', label: 'Banks tightening business-loan standards', unit: '%', daily: false, note: 'Quarterly Fed survey: net % of banks tightening standards for large and mid-size business loans. Rising means credit is getting harder to get.' },
  { id: 'DRCCLACBS', key: 'card', label: 'Credit card delinquency rate', unit: '%', daily: false, note: 'Quarterly. Share of bank credit-card balances that are delinquent.' },
  { id: 'DRSFRMACBS', key: 'mort', label: 'Mortgage delinquency rate', unit: '%', daily: false, note: 'Quarterly. Share of bank-held single-family mortgages that are delinquent.' },
  { id: 'USREC', key: 'rec', label: 'US recession (NBER)', unit: 'index', daily: false, note: 'Monthly 1 = NBER-dated recession. Dated well after the fact.' },
];
export const ETFS: { sym: string; name: string; what: string }[] = [
  { sym: 'HYG', name: 'iShares iBoxx High Yield Corporate Bond', what: 'US junk bonds' }, { sym: 'JNK', name: 'SPDR Bloomberg High Yield Bond', what: 'US junk bonds' },
  { sym: 'LQD', name: 'iShares iBoxx Investment Grade Corporate Bond', what: 'US investment-grade corporate bonds' }, { sym: 'BKLN', name: 'Invesco Senior Loan', what: 'Leveraged bank loans' },
  { sym: 'EMB', name: 'iShares JPMorgan USD Emerging Markets Bond', what: 'Emerging-market dollar bonds' }, { sym: 'TLT', name: 'iShares 20+ Year Treasury Bond', what: 'Long Treasuries' },
  { sym: 'IEF', name: 'iShares 7-10 Year Treasury Bond', what: 'Intermediate Treasuries' }, { sym: 'SHY', name: 'iShares 1-3 Year Treasury Bond', what: 'Short Treasuries' },
];

const dayMs = 86400_000;
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
export interface Stats { last: number; date: string; pctile: number; chg1m: number | null; chg3m: number | null; chg1y: number | null; min: number; max: number; minDate: string; maxDate: string }
/** latest value, how it ranks against the whole history (percentile of observations at or below it), changes, and the range */
export function stats(p: Pts): Stats | null {
  if (!p.length) return null;
  const [date, last] = p[p.length - 1];
  const below = p.filter((x) => x[1] <= last).length;
  const at = (days: number) => { const cut = t(date) - days * dayMs; let r: [string, number] | null = null; for (const x of p) { if (t(x[0]) <= cut) r = x; else break; } return r ? last - r[1] : null; };
  let mn = p[0], mx = p[0]; for (const x of p) { if (x[1] < mn[1]) mn = x; if (x[1] > mx[1]) mx = x; }
  return { last, date, pctile: (below / p.length) * 100, chg1m: at(30), chg3m: at(91), chg1y: at(365), min: mn[1], max: mx[1], minDate: mn[0], maxDate: mx[0] };
}
export type Regime = 'tight' | 'normal' | 'wide';
export const regimeOf = (pctile: number): Regime => (pctile < 25 ? 'tight' : pctile > 75 ? 'wide' : 'normal');
export const lastBefore = (p: Pts, d: string): number | null => { let r: number | null = null; for (const x of p) { if (x[0] <= d) r = x[1]; else break; } return r; };
export const lastNYears = (p: Pts, years: number): Pts => { if (!p.length) return p; const cut = new Date(t(p[p.length - 1][0]) - years * 365.25 * dayMs).toISOString().slice(0, 10); return p.filter((x) => x[0] >= cut); };

/** contiguous runs where the NBER indicator is 1, as [start, end] dates */
export function recessions(rec: Pts): [string, string][] {
  const out: [string, string][] = []; let s: string | null = null, prev = '';
  for (const [d, v] of rec) { if (v >= 1 && s == null) s = d; if (v < 1 && s != null) { out.push([s, prev]); s = null; } prev = d; }
  if (s != null) out.push([s, prev]);
  return out;
}
export interface RecRow { start: string; end: string; before: number | null; atStart: number | null; peak: number | null }
/** what a spread series did around each recession: a year before the start, at the start, and its highest point from start to a year after */
export function aroundRecessions(spread: Pts, recs: [string, string][]): RecRow[] {
  const first = spread[0]?.[0] ?? '';
  return recs.filter(([s]) => s > first).map(([s, e]) => {
    const yb = new Date(t(s) - 365 * dayMs).toISOString().slice(0, 10), ya = new Date(t(s) + 365 * dayMs).toISOString().slice(0, 10);
    const inside = spread.filter((x) => x[0] >= s && x[0] <= ya).map((x) => x[1]);
    return { start: s, end: e, before: lastBefore(spread, yb), atStart: lastBefore(spread, s), peak: inside.length ? Math.max(...inside) : null };
  });
}
export const fmtVal = (v: number, unit: Meta['unit']) => (unit === 'pp' ? `${v.toFixed(2)} pp` : unit === '%' ? `${v.toFixed(2)}%` : v.toFixed(2));

/** both sides of the argument, by how wide high-yield spreads are compared with history. Statements of argument, not predictions. */
export const SIDES: Record<Regime, { head: string; calm: string[]; caution: string[] }> = {
  tight: {
    head: 'Spreads are tight compared with history',
    calm: ['Investors are paid little extra for junk-bond risk because few companies are failing, and defaults are low.', 'Strong earnings and easy access to refinancing can keep spreads tight for years.', 'Tight spreads can persist for a long time; being tight is not a timing signal by itself.'],
    caution: ['There is little cushion: if conditions worsen, spreads have more room to widen than to tighten.', 'Spreads were also tight before 2007 and before the 2022 widening, so tightness can mean complacency.', 'Low spreads mean new buyers earn less for the same risk.'],
  },
  normal: {
    head: 'Spreads are in a middle range',
    calm: ['The market is pricing a normal amount of default risk, neither panic nor complacency.', 'A middle reading leaves room to move either way without being an outlier.'],
    caution: ['A middle reading says little by itself; the direction of travel (see the 3-month and 1-year changes) is more informative.', 'Spreads can jump quickly from the middle range when growth surprises on the downside.'],
  },
  wide: {
    head: 'Spreads are wide compared with history',
    calm: ['Wide spreads pay more for taking credit risk, and historically some of the best periods to own credit began when spreads were wide.', 'Spreads often overshoot because of forced selling, then retrace once the panic fades.'],
    caution: ['Wide spreads mean the market sees real default risk; in 2001, 2008 and 2020 they kept widening for months before peaking.', 'Defaults tend to rise after spreads widen, so conditions can get worse before they improve.'],
  },
};
export const CURVE_SIDES = {
  inverted: { head: 'The yield curve is inverted (10y below 2y)', calm: ['Inversions have sometimes lasted a year or more with no recession, and the lag from inversion to recession has varied widely.', 'Structural demand for long Treasuries can distort the signal.'], caution: ['Each US recession since the 1960s was preceded by an inversion, although not every inversion was followed by one.', 'Inverted curves squeeze bank lending margins, which can tighten credit.'] },
  normal: { head: 'The yield curve is upward sloping (10y above 2y)', calm: ['A positive slope is the normal state and is consistent with growth expectations.', 'The curve usually un-inverts before or during a downturn, not long before.'], caution: ['The curve often steepens fast when the Fed cuts into weakness, so a steepening curve is not always good news.', 'A positive slope says little about credit quality inside the corporate market.'] },
};
