// Analysis tools: compare several tickers on one % chart, beta regression against a benchmark, the distribution of daily
// returns, trending tickers (Reddit mentions via ApeWisdom), and company facts from Wikidata. Pure functions (tested).

export type Closes = [number, number][]; // [time (s), close]

/** Rebase each series to 0% at the first date they all share, keeping only shared dates. */
export function compareSeries(series: Record<string, Closes>, fromSec = 0): { times: number[]; lines: Record<string, number[]> } {
  const syms = Object.keys(series).filter((s) => series[s]?.length);
  if (!syms.length) return { times: [], lines: {} };
  const day = (t: number) => Math.floor(t / 86400);
  const maps = syms.map((s) => new Map(series[s].filter(([t]) => t >= fromSec).map(([t, c]) => [day(t), c])));
  const times = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort((a, b) => a - b);
  const lines: Record<string, number[]> = {};
  syms.forEach((s, i) => { const base = maps[i].get(times[0])!; lines[s] = times.map((d) => (maps[i].get(d)! / base - 1) * 100); });
  return { times: times.map((d) => d * 86400), lines };
}

const rets = (c: number[]) => c.slice(1).map((v, i) => v / c[i] - 1);
const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / (x.length || 1);

/** OLS of the stock's daily returns on the benchmark's: beta, alpha (annualized), correlation, R², volatility. */
export function betaStats(asset: Closes, bench: Closes) {
  const cmp = compareSeries({ a: asset, b: bench });
  const back = (l: number[]) => l.map((v) => 1 + v / 100); // rebased levels -> prices up to a constant
  const ra = rets(back(cmp.lines.a ?? [])), rb = rets(back(cmp.lines.b ?? []));
  if (ra.length < 30) return null;
  const ma = mean(ra), mb = mean(rb);
  let cov = 0, vb = 0, va = 0;
  for (let i = 0; i < ra.length; i++) { cov += (ra[i] - ma) * (rb[i] - mb); vb += (rb[i] - mb) ** 2; va += (ra[i] - ma) ** 2; }
  const beta = cov / vb, corr = cov / Math.sqrt(va * vb);
  return {
    n: ra.length, beta, corr, r2: corr * corr, alphaAnn: (ma - beta * mb) * 252 * 100,
    volAnn: Math.sqrt(va / (ra.length - 1)) * Math.sqrt(252) * 100, benchVolAnn: Math.sqrt(vb / (rb.length - 1)) * Math.sqrt(252) * 100,
    points: ra.map((x, i) => [rb[i] * 100, x * 100] as [number, number]),
  };
}

/** Daily return distribution: histogram, average, spread, skew, best and worst days, share of up days. */
export function returnDist(c: Closes, binPct = 0.5) {
  const r = rets(c.map(([, v]) => v)).map((x) => x * 100);
  if (r.length < 20) return null;
  const m = mean(r), sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1));
  const skew = r.reduce((a, x) => a + ((x - m) / sd) ** 3, 0) / r.length;
  const lo = Math.floor(Math.min(...r) / binPct) * binPct, hi = Math.ceil(Math.max(...r) / binPct) * binPct;
  const bins: { from: number; n: number }[] = [];
  for (let x = lo; x < hi - 1e-9; x += binPct) bins.push({ from: +x.toFixed(4), n: 0 });
  for (const x of r) { const i = Math.min(bins.length - 1, Math.max(0, Math.floor((x - lo) / binPct))); bins[i].n++; }
  const sorted = [...r].sort((a, b) => a - b);
  const idx = (k: number) => c.findIndex((_, i) => i > 0 && Math.abs((c[i][1] / c[i - 1][1] - 1) * 100 - k) < 1e-9);
  return {
    n: r.length, mean: m, sd, skew, upPct: (r.filter((x) => x > 0).length / r.length) * 100, bins,
    worst: { pct: sorted[0], t: c[idx(sorted[0])]?.[0] ?? null }, best: { pct: sorted[sorted.length - 1], t: c[idx(sorted[sorted.length - 1])]?.[0] ?? null },
    beyond2sd: (r.filter((x) => Math.abs(x - m) > 2 * sd).length / r.length) * 100, // a normal curve would give about 4.6%
  };
}

/* ---------------- trending (ApeWisdom) ---------------- */
export interface Trend { sym: string; name: string; rank: number; mentions: number; mentions24hAgo: number | null; rank24hAgo: number | null; upvotes: number }
export function parseApeWisdom(j: any, max = 40): Trend[] {
  return (Array.isArray(j?.results) ? j.results : []).filter((r: any) => /^[A-Z][A-Z.]{0,6}$/.test(String(r?.ticker ?? ''))).slice(0, max).map((r: any) => ({
    sym: String(r.ticker), name: String(r.name ?? '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'"), rank: Number(r.rank), mentions: Number(r.mentions) || 0,
    mentions24hAgo: Number.isFinite(Number(r.mentions_24h_ago)) ? Number(r.mentions_24h_ago) : null, rank24hAgo: Number.isFinite(Number(r.rank_24h_ago)) ? Number(r.rank_24h_ago) : null, upvotes: Number(r.upvotes) || 0,
  }));
}

/* ---------------- Wikidata company facts ---------------- */
export const wikidataQuery = (ticker: string) => `SELECT ?c ?cLabel ?ceoLabel ?emp ?hqLabel ?founded WHERE { ?c p:P414 ?st . ?st pq:P249 "${ticker.replace(/[^A-Z0-9.\-]/g, '')}" . OPTIONAL{?c wdt:P169 ?ceo} OPTIONAL{?c wdt:P1128 ?emp} OPTIONAL{?c wdt:P159 ?hq} OPTIONAL{?c wdt:P571 ?founded} SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 20`;
export interface CoFacts { entity: string; label: string; ceo: string | null; employees: number | null; hq: string | null; founded: string | null }
/** Several Wikidata items can carry one ticker (Google and Alphabet share GOOGL): prefer the one whose name matches the SEC name. */
export function pickWikidata(j: any, secName: string | null): CoFacts | null {
  const rows = (j?.results?.bindings ?? []).map((b: any) => ({ entity: b.c?.value ?? '', label: b.cLabel?.value ?? '', ceo: b.ceoLabel?.value ?? null, emp: b.emp ? Number(b.emp.value) : null, hq: b.hqLabel?.value ?? null, founded: b.founded?.value?.slice(0, 10) ?? null }));
  if (!rows.length) return null;
  const want = (secName ?? '').toLowerCase().split(/[\s,.]/)[0];
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.entity, [...(by.get(r.entity) ?? []), r]);
  const groups = [...by.values()].sort((a, b) => Number(b[0].label.toLowerCase().startsWith(want)) - Number(a[0].label.toLowerCase().startsWith(want)) || (b[0].founded ?? '').localeCompare(a[0].founded ?? ''));
  const g = groups[0];
  const first = <K extends 'ceo' | 'hq'>(k: K) => g.map((r: any) => r[k]).find((x: string | null) => x && !/^Q\d+$/.test(x)) ?? null; // unlabelled items come back as Q-ids
  return { entity: g[0].entity, label: g[0].label, ceo: first('ceo'), employees: Math.max(0, ...g.map((r: any) => r.emp ?? 0)) || null, hq: first('hq'), founded: g[0].founded };
}

/* ---------------- Finnhub basic financials -> valuation lines ---------------- */
/** Finnhub's metric names vary by company; take the first that's present. */
export function valuation(metric: Record<string, unknown> | null) {
  const m = metric ?? {};
  const pick = (...ks: string[]) => { for (const k of ks) { const v = Number(m[k]); if (m[k] != null && Number.isFinite(v)) return v; } return null; };
  return {
    pe: pick('peTTM', 'peExclExtraTTM', 'peBasicExclExtraTTM'), fwdPe: pick('forwardPE', 'peNTM'), ps: pick('psTTM', 'psAnnual'), pb: pick('pbQuarterly', 'pbAnnual'),
    evEbitda: pick('evEbitdaTTM', 'enterpriseValueEbitdaTTM'), beta: pick('beta'), divYield: pick('currentDividendYieldTTM', 'dividendYieldIndicatedAnnual'),
    payout: pick('payoutRatioTTM', 'payoutRatioAnnual'), roe: pick('roeTTM', 'roeRfy'), grossMargin: pick('grossMarginTTM', 'grossMarginAnnual'), netMargin: pick('netProfitMarginTTM', 'netProfitMarginAnnual'),
    hi52: pick('52WeekHigh'), lo52: pick('52WeekLow'),
  };
}
