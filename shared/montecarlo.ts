// Monte Carlo "what could the next N trades do": resample R-multiples (yours, or a win-rate model) many times.
// Each trade risks `riskPct` of current equity, so R results compound. Pure + seeded for tests.
export interface McInput { rs: number[]; riskPct: number; trades: number; runs?: number; seed?: number }
export interface McResult {
  expectancyR: number; winRate: number; runs: number;
  endPct: { p5: number; p25: number; p50: number; p75: number; p95: number };
  pUp: number; pDd10: number; pDd20: number; pDd30: number; medianMaxDd: number;
  bands: { i: number; p5: number; p50: number; p95: number }[]; // equity % change after trade i
}

function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };

/** R-multiples for a simple model: win rate w, average win +aw R, average loss -al R (a 100-trade deck). */
export function modelRs(winRate: number, avgWinR: number, avgLossR: number): number[] {
  const wins = Math.round(Math.max(0, Math.min(1, winRate)) * 100);
  return [...Array(wins).fill(avgWinR), ...Array(100 - wins).fill(-Math.abs(avgLossR))];
}

export function monteCarlo({ rs, riskPct, trades, runs = 4000, seed = 7 }: McInput): McResult | null {
  const clean = rs.filter((r) => Number.isFinite(r));
  if (!clean.length || trades < 1) return null;
  const rand = rng(seed), f = riskPct / 100;
  const ends: number[] = [], maxDds: number[] = [];
  const step = Math.max(1, Math.floor(trades / 40));
  const paths: number[][] = Array.from({ length: Math.floor(trades / step) + 1 }, () => []);
  for (let k = 0; k < runs; k++) {
    let eq = 1, peak = 1, dd = 0;
    paths[0].push(0);
    for (let i = 1; i <= trades; i++) {
      eq *= Math.max(0, 1 + f * clean[Math.floor(rand() * clean.length)]);
      peak = Math.max(peak, eq); dd = Math.max(dd, 1 - eq / peak);
      if (i % step === 0) paths[i / step].push((eq - 1) * 100);
    }
    ends.push((eq - 1) * 100); maxDds.push(dd * 100);
  }
  const share = (xs: number[], pred: (x: number) => boolean) => xs.filter(pred).length / xs.length;
  return {
    expectancyR: clean.reduce((a, b) => a + b, 0) / clean.length, winRate: share(clean, (r) => r > 0), runs,
    endPct: { p5: q(ends, 0.05), p25: q(ends, 0.25), p50: q(ends, 0.5), p75: q(ends, 0.75), p95: q(ends, 0.95) },
    pUp: share(ends, (x) => x > 0), pDd10: share(maxDds, (x) => x >= 10), pDd20: share(maxDds, (x) => x >= 20), pDd30: share(maxDds, (x) => x >= 30),
    medianMaxDd: q(maxDds, 0.5),
    bands: paths.map((p, j) => ({ i: j * step, p5: q(p, 0.05), p50: q(p, 0.5), p95: q(p, 0.95) })),
  };
}
