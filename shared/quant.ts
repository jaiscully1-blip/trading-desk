// "Quant read" for one stock from ~1 year of daily closes: risk, CAPM vs SPY, volatility (GARCH), memory (Hurst),
// randomness (permutation entropy), then a plain-English bullish / bearish lean with every reason shown.
// Ideas follow a standard quant curriculum (CAPM, ARCH/GARCH, entropy + Hurst regime reading); all code here is original.
// This is statistics about the past, not a prediction or advice.

export interface QuantInput { closes: number[]; bench: number[] } // aligned daily closes, oldest first
export interface Reason { factor: string; text: string; pts: number }
export interface QuantRead {
  n: number; last: number;
  ret: { m1: number | null; m3: number | null; m6: number | null; y1: number | null };
  sma50: number | null; sma200: number | null;
  vol: number; sharpe: number; sortino: number; maxDD: number; curDD: number; var95: number; cvar95: number;
  capm: { beta: number; alpha: number; r2: number } | null;
  garch: { alpha: number; beta: number; persist: number; halfLife: number | null; volNow: number; vol20: number; volLong: number; ratio: number } | null;
  hurst: number | null; entropy: number | null;
  regime: { label: string; text: string };
  verdict: { label: 'Bullish' | 'Lean bullish' | 'Neutral' | 'Lean bearish' | 'Bearish'; score: number; reasons: Reason[] };
}

const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / (x.length || 1);
const variance = (x: number[]) => { const m = mean(x); return x.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, x.length - 1); };
const logRets = (c: number[]) => c.slice(1).map((v, i) => Math.log(v / c[i]));
const sma = (c: number[], n: number) => (c.length >= n ? mean(c.slice(-n)) : null);
const back = (c: number[], n: number) => (c.length > n ? (c[c.length - 1] / c[c.length - 1 - n] - 1) * 100 : null);

/** Hurst exponent by the aggregated-variance method: Var(sum of m returns) ~ m^(2H). 0.5 = random walk. */
export function hurst(r: number[]): number | null {
  const ms = [1, 2, 4, 8, 16, 32].filter((m) => r.length / m >= 8);
  if (ms.length < 3) return null;
  const pts = ms.map((m) => {
    const sums: number[] = [];
    for (let i = 0; i + m <= r.length; i += m) sums.push(r.slice(i, i + m).reduce((a, b) => a + b, 0));
    return [Math.log(m), Math.log(variance(sums))] as const;
  });
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return Math.max(0, Math.min(1, slope / 2));
}

/** Normalized permutation entropy (order 3): 1 = day-to-day ordering looks random, lower = more structure. */
export function permEntropy(x: number[], order = 3): number | null {
  if (x.length < order + 20) return null;
  const counts = new Map<string, number>();
  for (let i = 0; i + order <= x.length; i++) {
    const w = x.slice(i, i + order);
    const k = w.map((v, j) => [v, j] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((p) => p[1]).join('');
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const tot = [...counts.values()].reduce((a, b) => a + b, 0);
  let h = 0;
  for (const c of counts.values()) { const p = c / tot; h -= p * Math.log(p); }
  const fact = [1, 1, 2, 6, 24, 120][order];
  return h / Math.log(fact);
}

/** GARCH(1,1) by grid-search maximum likelihood with variance targeting. Returns annualized vols in %. */
export function garch11(r: number[]) {
  if (r.length < 120) return null;
  const m = mean(r);
  const e = r.map((v) => v - m);
  const s2 = variance(e);
  let best: { a: number; b: number; ll: number } | null = null;
  for (let a = 0.02; a <= 0.25001; a += 0.01) {
    for (let b = 0.6; b <= 0.98001; b += 0.01) {
      if (a + b >= 0.995) continue;
      const w = s2 * (1 - a - b);
      let h = s2, ll = 0;
      for (const x of e) { ll -= 0.5 * (Math.log(h) + (x * x) / h); h = w + a * x * x + b * h; }
      if (!best || ll > best.ll) best = { a, b, ll };
    }
  }
  if (!best) return null;
  const { a, b } = best, p = a + b, w = s2 * (1 - p);
  let h = s2;
  for (const x of e) h = w + a * x * x + b * h; // h = tomorrow's variance
  let sum = 0, hk = h;
  for (let k = 0; k < 20; k++) { sum += hk; hk = w + p * hk; }
  const ann = (v: number) => Math.sqrt(v * 252) * 100;
  return { alpha: a, beta: b, persist: p, halfLife: p > 0 && p < 1 ? Math.log(0.5) / Math.log(p) : null, volNow: ann(h), vol20: ann(sum / 20), volLong: ann(s2), ratio: Math.sqrt(h / s2) };
}

export function quantRead({ closes, bench }: QuantInput): QuantRead | null {
  if (closes.length < 60) return null;
  const r = logRets(closes);
  const last = closes[closes.length - 1];
  const sd = Math.sqrt(variance(r));
  const dn = r.filter((x) => x < 0);
  const ddn = Math.sqrt(dn.reduce((a, x) => a + x * x, 0) / Math.max(1, r.length));
  let peak = closes[0], maxDD = 0;
  for (const c of closes) { peak = Math.max(peak, c); maxDD = Math.min(maxDD, c / peak - 1); }
  const curDD = last / Math.max(...closes) - 1;
  const sorted = [...r].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(sorted.length * 0.05));
  const var95 = (Math.exp(sorted[k - 1]) - 1) * 100;
  const cvar95 = (Math.exp(mean(sorted.slice(0, k))) - 1) * 100;

  let capm: QuantRead['capm'] = null;
  if (bench.length === closes.length) {
    const rm = logRets(bench);
    const vm = variance(rm);
    if (vm > 0) {
      const ms = mean(r), mm = mean(rm);
      const cov = r.reduce((a, x, i) => a + (x - ms) * (rm[i] - mm), 0) / (r.length - 1);
      const beta = cov / vm;
      capm = { beta, alpha: (Math.exp((ms - beta * mm) * 252) - 1) * 100, r2: (cov * cov) / (vm * variance(r)) };
    }
  }
  const g = garch11(r);
  const H = hurst(r);
  const pe = permEntropy(r.slice(-250));
  const ret = { m1: back(closes, 21), m3: back(closes, 63), m6: back(closes, 126), y1: back(closes, Math.min(closes.length - 1, 252)) };
  const s50 = sma(closes, 50), s200 = sma(closes, 200);

  // ---------- regime: memory (Hurst) + randomness (entropy) + shock persistence (GARCH) ----------
  const trending = H != null && H >= 0.55, reverting = H != null && H <= 0.45;
  const random = pe != null && pe >= 0.985;
  const regime = trending && !random ? { label: 'Trending', text: 'Moves have tended to continue (Hurst above 0.55) and the daily pattern is less random than noise, so trend-following has had an edge.' }
    : reverting ? { label: 'Mean-reverting', text: 'Moves have tended to partly reverse (Hurst below 0.45): strength fades and dips bounce more often than in a random walk.' }
      : g && g.ratio >= 1.3 ? { label: 'Unstable', text: 'Volatility is well above its normal level and shocks are lingering; ranges are wider than usual.' }
        : { label: 'Random walk', text: 'No reliable memory in the moves (Hurst near 0.5, entropy near maximum); price behaves close to a coin-flip day to day.' };

  // ---------- verdict ----------
  const reasons: Reason[] = [];
  const add = (factor: string, pts: number, text: string) => reasons.push({ factor, pts, text });
  if (s200 != null) add('Trend', last > s200 ? 1 : -1, last > s200 ? `Price is ${((last / s200 - 1) * 100).toFixed(1)}% above its 200-day average (long-term uptrend).` : `Price is ${((1 - last / s200) * 100).toFixed(1)}% below its 200-day average (long-term downtrend).`);
  if (s50 != null && s200 != null) add('Trend', s50 > s200 ? 1 : -1, s50 > s200 ? '50-day average is above the 200-day (golden-cross side).' : '50-day average is below the 200-day (death-cross side).');
  if (ret.m6 != null) { const v = ret.m6; add('Momentum', v > 10 ? 1 : v < -10 ? -1 : 0, `6-month return ${v >= 0 ? '+' : ''}${v.toFixed(1)}%${Math.abs(v) <= 10 ? ' (no strong momentum either way)' : v > 0 ? ': strong momentum, which has historically tended to persist for months.' : ': weak momentum, which has historically tended to persist.'}`); }
  if (ret.m1 != null && ret.m3 != null) add('Momentum', ret.m1 > 0 && ret.m3 > 0 ? 0.5 : ret.m1 < 0 && ret.m3 < 0 ? -0.5 : 0, `1-month ${ret.m1 >= 0 ? '+' : ''}${ret.m1.toFixed(1)}%, 3-month ${ret.m3 >= 0 ? '+' : ''}${ret.m3.toFixed(1)}%${(ret.m1 > 0) !== (ret.m3 > 0) ? ' (short and medium term disagree).' : '.'}`);
  if (capm) add('CAPM', capm.alpha > 5 ? 1 : capm.alpha < -5 ? -1 : 0, `Alpha ${capm.alpha >= 0 ? '+' : ''}${capm.alpha.toFixed(1)}%/yr vs SPY after adjusting for beta ${capm.beta.toFixed(2)} (${capm.alpha > 5 ? 'it has beaten what its market risk alone would explain' : capm.alpha < -5 ? 'it has lagged what its market risk alone would explain' : 'roughly what its market risk would explain'}).`);
  if (H != null) {
    if (trending && s50 != null) add('Memory', last > s50 ? 1 : -1, `Hurst ${H.toFixed(2)}: moves tend to persist, so the current ${last > s50 ? 'up' : 'down'}trend is more likely to continue than not.`);
    else if (reverting && s50 != null && Math.abs(last / s50 - 1) > 0.06) add('Memory', last > s50 ? -1 : 1, `Hurst ${H.toFixed(2)}: moves tend to reverse, and price is ${((last / s50 - 1) * 100).toFixed(1)}% from its 50-day, so a pullback toward it is more likely.`);
    else add('Memory', 0, `Hurst ${H.toFixed(2)}: ${trending ? 'trending' : reverting ? 'mean-reverting' : 'little memory'}; no extra push either way.`);
  }
  if (g) add('Volatility', g.ratio >= 1.3 ? -1 : g.ratio <= 0.8 ? 0.5 : 0, `GARCH says tomorrow’s volatility is ${g.volNow.toFixed(0)}%/yr vs a normal ${g.volLong.toFixed(0)}% (${g.ratio >= 1.3 ? 'elevated: bigger swings, worse odds for new longs' : g.ratio <= 0.8 ? 'calm: trends have room to run' : 'about normal'}). A shock fades by half in ${g.halfLife ? `${g.halfLife.toFixed(0)} days` : 'n/a'}.`);
  if (curDD < -0.25) add('Drawdown', -1, `${(curDD * 100).toFixed(0)}% below its 1-year high: still in a deep drawdown.`);
  const score = Math.round(reasons.reduce((a, x) => a + x.pts, 0) * 2) / 2;
  const label: QuantRead['verdict']['label'] = score >= 3 ? 'Bullish' : score >= 1 ? 'Lean bullish' : score <= -3 ? 'Bearish' : score <= -1 ? 'Lean bearish' : 'Neutral';

  return {
    n: closes.length, last, ret, sma50: s50, sma200: s200,
    vol: sd * Math.sqrt(252) * 100, sharpe: (mean(r) / sd) * Math.sqrt(252), sortino: ddn ? (mean(r) / ddn) * Math.sqrt(252) : 0,
    maxDD: maxDD * 100, curDD: curDD * 100, var95, cvar95, capm, garch: g, hurst: H, entropy: pe, regime,
    verdict: { label, score, reasons },
  };
}

/** Align a stock's daily bars with the benchmark's by date (both [unix s, close], oldest first). */
export function alignCloses(a: [number, number][], b: [number, number][]): QuantInput {
  const bm = new Map(b.map(([t, c]) => [t, c]));
  const both = a.filter(([t]) => bm.has(t));
  return both.length >= a.length * 0.9 ? { closes: both.map((x) => x[1]), bench: both.map(([t]) => bm.get(t)!) } : { closes: a.map((x) => x[1]), bench: [] };
}
