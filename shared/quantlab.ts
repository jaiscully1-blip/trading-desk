// Quant Lab relationship finder: lines up a stock's quarterly returns with many other series (market, sectors, rates,
// commodities, the company's own earnings, Amazon review tone) and tests each pairing at several leads and lags.
// It works on changes, not levels (two rising lines always look related), corrects for testing many pairs at once
// (Benjamini-Hochberg false discovery rate), and checks that a link holds in both halves of the history.
// Plain statistics that run in the browser: no paid AI, nothing guessed. Pure functions (tested).

export type Series = Map<string, number>; // "2019Q3" -> value
export interface Candidate { id: string; label: string; group: string; s: Series; unit?: string }
export interface Finding {
  id: string; label: string; group: string; lag: number; r: number; rho: number; n: number; p: number; q: number;
  firstHalf: number | null; secondHalf: number | null; stable: boolean; significant: boolean; sentence: string; strength: string;
}

export const qKey = (ms: number) => { const d = new Date(ms); return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
/** "2019Q3" shifted by k quarters. */
export function qShift(q: string, k: number): string {
  const y = +q.slice(0, 4), n = +q.slice(5) - 1 + k, yy = y + Math.floor(n / 4);
  return `${yy}Q${(((n % 4) + 4) % 4) + 1}`;
}
export const qSort = (a: string, b: string) => a.localeCompare(b);

/** Month-end closes -> the last close in each calendar quarter. */
export function quarterEnd(closes: { t: number; c: number }[]): Series {
  const last: Series = new Map();
  for (const x of [...closes].sort((a, b) => a.t - b.t)) if (Number.isFinite(x.c) && x.c > 0) last.set(qKey(x.t), x.c);
  return last;
}
/** Month-end closes [{t ms, c}] -> quarterly % return (last close of each calendar quarter vs the one before). */
export function quarterlyReturns(closes: { t: number; c: number }[]): Series {
  const last = quarterEnd(closes);
  const out: Series = new Map(), keys = [...last.keys()].sort(qSort);
  for (let i = 1; i < keys.length; i++) if (qShift(keys[i - 1], 1) === keys[i]) out.set(keys[i], (last.get(keys[i])! / last.get(keys[i - 1])! - 1) * 100);
  return out;
}
/** Quarterly levels -> quarter-over-quarter change (points, for rates, tone and margins). */
export function diff(s: Series): Series {
  const out: Series = new Map();
  for (const [k, v] of s) { const p = s.get(qShift(k, -1)); if (p != null) out.set(k, v - p); }
  return out;
}
/** Year-over-year % change, for seasonal series like revenue. */
export function yoyPct(s: Series): Series {
  const out: Series = new Map();
  for (const [k, v] of s) { const p = s.get(qShift(k, -4)); if (p != null && p !== 0) out.set(k, ((v - p) / Math.abs(p)) * 100); }
  return out;
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length; if (n < 3) return NaN;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}
const ranks = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]), r = new Array(v.length); for (let i = 0; i < o.length;) { let j = i; while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++; for (let k = i; k <= j; k++) r[o[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r as number[]; };
/** Spearman rank correlation: same idea, but one wild quarter can't dominate it. */
export const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));

// two-sided p-value for a correlation via the t statistic (Student t, regularized incomplete beta)
function betacf(a: number, b: number, x: number) { let c = 1, d = 1 - ((a + b) * x) / (a + 1); d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); let h = d; for (let m = 1; m <= 200; m++) { const m2 = 2 * m; let aa = (m * (b - m) * x) / ((a - 1 + m2) * (a + m2)); d = 1 + aa * d; c = 1 + aa / c; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = Math.abs(c) < 1e-30 ? 1e-30 : c; h *= d * c; aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + 1 + m2)); d = 1 + aa * d; c = 1 + aa / c; d = 1 / (Math.abs(d) < 1e-30 ? 1e-30 : d); c = Math.abs(c) < 1e-30 ? 1e-30 : c; const del = d * c; h *= del; if (Math.abs(del - 1) < 3e-12) break; } return h; }
function lgamma(z: number): number { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let x = z, y = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const c of g) s += c / ++y; return -t + Math.log((2.5066282746310005 * s) / x); }
function ibeta(x: number, a: number, b: number) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b; }
export function corrP(r: number, n: number): number {
  if (!Number.isFinite(r) || n < 4) return 1;
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2, t = Math.abs(r) * Math.sqrt(df / (1 - r * r));
  return ibeta(df / (df + t * t), df / 2, 0.5);
}
/** Benjamini-Hochberg adjusted q-values (same order as input). */
export function bhAdjust(p: number[]): number[] {
  const m = p.length, o = p.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]), q = new Array(m).fill(1);
  let min = 1;
  for (let k = m - 1; k >= 0; k--) { min = Math.min(min, (o[k][0] * m) / (k + 1)); q[o[k][1]] = min; }
  return q;
}

/** Pairs x (shifted by lag) with y. lag > 0: x from `lag` quarters earlier, so x leads y. */
export function align(x: Series, y: Series, lag: number): { k: string[]; x: number[]; y: number[] } {
  const k: string[] = [], xs: number[] = [], ys: number[] = [];
  for (const q of [...y.keys()].sort(qSort)) { const v = x.get(qShift(q, -lag)), w = y.get(q); if (v != null && w != null && Number.isFinite(v) && Number.isFinite(w)) { k.push(q); xs.push(v); ys.push(w); } }
  return { k, x: xs, y: ys };
}

export const strengthWord = (r: number) => { const a = Math.abs(r); return a >= 0.7 ? 'strong' : a >= 0.4 ? 'moderate' : a >= 0.2 ? 'weak' : 'no real'; };
function sentence(target: string, c: Candidate, lag: number, r: number): string {
  const dir = r >= 0 ? 'rose' : 'fell', when = lag === 0 ? 'in the same quarter' : lag > 0 ? `${lag} quarter${lag > 1 ? 's' : ''} later` : `${-lag} quarter${lag < -1 ? 's' : ''} earlier`;
  const subj = lag < 0 ? `${target} moves came first: when ${target} rose, ${c.label} ${dir}` : `When ${c.label} rose, ${target} tended to have ${r >= 0 ? 'higher' : 'lower'} returns`;
  return lag < 0 ? `${subj} ${-lag} quarter${lag < -1 ? 's' : ''} after.` : `${subj} ${when}.`;
}

export const MIN_N = 12;
/** Test every candidate at each lag against the target. Sorted: significant and stable first, then by |r|. */
export function scan(target: string, y: Series, cands: Candidate[], lags = [-1, 0, 1, 2]): Finding[] {
  const raw: Omit<Finding, 'q' | 'significant'>[] = [];
  for (const c of cands) for (const lag of lags) {
    const a = align(c.s, y, lag); const n = a.x.length;
    if (n < MIN_N) continue;
    const r = pearson(a.x, a.y); if (!Number.isFinite(r)) continue;
    const h = Math.floor(n / 2), r1 = h >= 6 ? pearson(a.x.slice(0, h), a.y.slice(0, h)) : NaN, r2 = n - h >= 6 ? pearson(a.x.slice(h), a.y.slice(h)) : NaN;
    const fh = Number.isFinite(r1) ? r1 : null, sh = Number.isFinite(r2) ? r2 : null;
    raw.push({ id: c.id, label: c.label, group: c.group, lag, r, rho: spearman(a.x, a.y), n, p: corrP(r, n), firstHalf: fh, secondHalf: sh,
      stable: fh != null && sh != null && Math.sign(fh) === Math.sign(r) && Math.sign(sh) === Math.sign(r) && Math.abs(fh) >= 0.15 && Math.abs(sh) >= 0.15,
      sentence: sentence(target, c, lag, r), strength: strengthWord(r) });
  }
  const q = bhAdjust(raw.map((f) => f.p));
  return raw.map((f, i) => ({ ...f, q: q[i], significant: q[i] < 0.1 }))
    .sort((a, b) => Number(b.significant && b.stable) - Number(a.significant && a.stable) || Math.abs(b.r) - Math.abs(a.r));
}

/** Best lag per candidate (strongest |r|), so the list shows one row per series. */
export function bestPerSeries(f: Finding[]): Finding[] {
  const m = new Map<string, Finding>();
  for (const x of f) { const c = m.get(x.id); if (!c || Number(x.significant && x.stable) > Number(c.significant && c.stable) || (Number(x.significant && x.stable) === Number(c.significant && c.stable) && Math.abs(x.r) > Math.abs(c.r))) m.set(x.id, x); }
  return [...m.values()].sort((a, b) => Number(b.significant && b.stable) - Number(a.significant && a.stable) || Math.abs(b.r) - Math.abs(a.r));
}

/** Plain verdict for one finding. */
export function verdict(f: Finding): string {
  if (f.significant && f.stable) return 'Holds up: unlikely to be chance even after testing many pairs, and it shows up in both halves of the history.';
  if (f.significant) return 'Passes the many-tests check, but it is much weaker (or flips) in one half of the history, so it may not last.';
  if (f.p < 0.05) return 'Looks significant on its own, but with this many pairs tested, a result like this can easily be luck.';
  return 'Not distinguishable from chance with this much history.';
}

// ----- Amazon review tone (shared/data/reviewtone.json, built by scripts/build-review-tone.py) -----
export interface ToneRow { q: string; n: number; stars: number; tone: number; posPct: number; negPct: number; verifiedPct: number; reasons: Record<string, [number, number]> }
export interface ToneCo { name: string; category: string; products: number; q: ToneRow[] }
export const MIN_REVIEWS = 30; // quarters with fewer reviews are too noisy to score

/** Review tone rows -> candidate series (changes in tone, stars, % negative, review count growth, reason shares). */
export function toneCandidates(co: ToneCo): Candidate[] {
  const rows = co.q.filter((r) => r.n >= MIN_REVIEWS);
  const lv = (f: (r: ToneRow) => number): Series => new Map(rows.map((r) => [r.q, f(r)]));
  const out: Candidate[] = [
    { id: 'rv:tone', label: 'Review tone (change)', group: 'Amazon reviews', s: diff(lv((r) => r.tone)) },
    { id: 'rv:tonelv', label: 'Review tone (level)', group: 'Amazon reviews', s: lv((r) => r.tone) },
    { id: 'rv:stars', label: 'Average stars (change)', group: 'Amazon reviews', s: diff(lv((r) => r.stars)) },
    { id: 'rv:neg', label: '% negative reviews (change)', group: 'Amazon reviews', s: diff(lv((r) => r.negPct * 100)) },
    { id: 'rv:count', label: 'Review count, yearly growth', group: 'Amazon reviews', s: yoyPct(lv((r) => r.n)) },
  ];
  const reasons = new Map<string, number>();
  for (const r of rows) for (const [k, v] of Object.entries(r.reasons)) reasons.set(k, (reasons.get(k) ?? 0) + v[1]);
  for (const [k] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 4))
    out.push({ id: `rv:why:${k}`, label: `Complaints about ${k} (share, change)`, group: 'Amazon reviews', s: diff(lv((r) => ((r.reasons[k]?.[1] ?? 0) / r.n) * 100)) });
  return out;
}

/** Top reasons behind negative and positive reviews over a set of quarters. */
export function reasonMix(rows: ToneRow[]): { reason: string; pos: number; neg: number; negShare: number }[] {
  const m = new Map<string, [number, number]>();
  for (const r of rows) for (const [k, [p, n]] of Object.entries(r.reasons)) { const c = m.get(k) ?? [0, 0]; m.set(k, [c[0] + p, c[1] + n]); }
  return [...m].map(([reason, [pos, neg]]) => ({ reason, pos, neg, negShare: pos + neg ? neg / (pos + neg) : 0 })).sort((a, b) => b.pos + b.neg - (a.pos + a.neg));
}

// ----- the factor basket the route returns -----
export const FACTORS: { sym: string; label: string; group: string }[] = [
  { sym: 'SPY', label: 'S&P 500', group: 'Market' }, { sym: 'QQQ', label: 'Nasdaq 100', group: 'Market' }, { sym: 'IWM', label: 'Small caps (Russell 2000)', group: 'Market' },
  { sym: 'XLK', label: 'Tech sector', group: 'Sectors' }, { sym: 'XLP', label: 'Consumer staples', group: 'Sectors' }, { sym: 'XLY', label: 'Consumer discretionary', group: 'Sectors' },
  { sym: 'XLE', label: 'Energy sector', group: 'Sectors' }, { sym: 'XLF', label: 'Financials', group: 'Sectors' }, { sym: 'XLV', label: 'Health care', group: 'Sectors' },
  { sym: 'TLT', label: 'Long Treasury bonds', group: 'Rates and credit' }, { sym: '^TNX', label: '10-year yield', group: 'Rates and credit' }, { sym: 'HYG', label: 'High-yield bonds', group: 'Rates and credit' },
  { sym: 'UUP', label: 'US dollar', group: 'Macro' }, { sym: 'GLD', label: 'Gold', group: 'Macro' }, { sym: 'USO', label: 'Oil', group: 'Macro' }, { sym: '^VIX', label: 'VIX (fear gauge)', group: 'Macro' },
  { sym: 'DBA', label: 'Farm commodities', group: 'Macro' }, { sym: 'CPER', label: 'Copper', group: 'Macro' },
];
/** Factors measured in points rather than % return (yield and VIX levels): use the quarter's change. */
export const LEVEL_FACTORS = new Set(['^TNX', '^VIX']);
