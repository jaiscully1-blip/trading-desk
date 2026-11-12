// Fundamentals over time from SEC XBRL company facts (official, free): revenue, profit, EPS, margins, free cash flow,
// share count, cash and debt, by fiscal year and by quarter. Many filers report cash-flow lines year-to-date in their
// 10-Qs (6 months, 9 months), and the fourth quarter only inside the annual 10-K, so quarters are worked out from those
// running totals. Pure functions (tested).

type F = { val: number; end: string; start?: string; form?: string; filed?: string; fy?: number; fp?: string };
const DAY = 86400_000;
const days = (r: F) => (r.start ? (Date.parse(r.end) - Date.parse(r.start)) / DAY : 0);

/** Duration concept -> { quarters: end -> value, years: end -> value }, filling quarters from year-to-date totals. */
export function durationSeries(rows: F[]): { quarters: Map<string, number>; years: Map<string, number> } {
  // newest filing wins for the same period (restatements)
  const by = new Map<string, F>();
  for (const r of rows) {
    if (!r.start || !Number.isFinite(r.val)) continue;
    const k = `${r.start}|${r.end}`, cur = by.get(k);
    if (!cur || (r.filed ?? '') > (cur.filed ?? '')) by.set(k, r);
  }
  const all = [...by.values()];
  const quarters = new Map<string, number>(), years = new Map<string, number>();
  for (const r of all) {
    const d = days(r);
    if (d >= 80 && d <= 100) quarters.set(r.end, r.val);
    if (d >= 350 && d <= 380) years.set(r.end, r.val);
  }
  // running totals that start on the same day (3, 6, 9, 12 months): each step is one quarter
  const chains = new Map<string, F[]>();
  for (const r of all) if (days(r) >= 80 && days(r) <= 380) chains.set(r.start!, [...(chains.get(r.start!) ?? []), r]);
  for (const chain of chains.values()) {
    chain.sort((a, b) => a.end.localeCompare(b.end));
    for (let i = 1; i < chain.length; i++) {
      const step = (Date.parse(chain[i].end) - Date.parse(chain[i - 1].end)) / DAY;
      if (step >= 80 && step <= 100 && !quarters.has(chain[i].end)) quarters.set(chain[i].end, chain[i].val - chain[i - 1].val);
    }
  }
  return { quarters, years };
}
/** Instant concept (balance-sheet or share count) -> end -> value. */
export function instantSeries(rows: F[]): Map<string, number> {
  const by = new Map<string, F>();
  for (const r of rows) if (!r.start && Number.isFinite(r.val)) { const cur = by.get(r.end); if (!cur || (r.filed ?? '') > (cur.filed ?? '')) by.set(r.end, r); }
  return new Map([...by.entries()].map(([k, v]) => [k, v.val]));
}

export type Metric = 'revenue' | 'netIncome' | 'eps' | 'grossMargin' | 'opMargin' | 'netMargin' | 'fcf' | 'shares' | 'cash' | 'debt';
export interface FundPoint { end: string; label: string; revenue: number | null; netIncome: number | null; eps: number | null; grossMargin: number | null; opMargin: number | null; netMargin: number | null; fcf: number | null; shares: number | null; cash: number | null; debt: number | null }
export interface FundSeries { annual: FundPoint[]; quarterly: FundPoint[] }

const CONCEPTS = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  gross: ['GrossProfit'], cost: ['CostOfRevenue', 'CostOfGoodsAndServicesSold'],
  op: ['OperatingIncomeLoss'], ocf: ['NetCashProvidedByUsedInOperatingActivities'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  eps: ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  debt: ['LongTermDebt', 'LongTermDebtNoncurrent'],
};

/** Company facts JSON -> annual (last `years`) and quarterly (last `quarters`) fundamentals. */
export function fundSeries(j: any, years = 10, quarters = 16): FundSeries {
  const g = j?.facts?.['us-gaap'] ?? {}, dei = j?.facts?.dei ?? {};
  const rows = (src: any, c: string, unit: string): F[] => src?.[c]?.units?.[unit] ?? [];
  // several concept names over the years: for each period take the first name (in priority order) that has it
  const merged = (names: string[], unit = 'USD') => {
    const q = new Map<string, number>(), y = new Map<string, number>();
    for (const n of names) { const s = durationSeries(rows(g, n, unit)); for (const [k, v] of s.quarters) if (!q.has(k)) q.set(k, v); for (const [k, v] of s.years) if (!y.has(k)) y.set(k, v); }
    return { q, y };
  };
  const inst = (names: string[], src = g, unit = 'USD') => { const m = new Map<string, number>(); for (const n of names) for (const [k, v] of instantSeries(rows(src, n, unit))) if (!m.has(k)) m.set(k, v); return m; };
  const rev = merged(CONCEPTS.revenue), ni = merged(CONCEPTS.netIncome), gp = merged(CONCEPTS.gross), cost = merged(CONCEPTS.cost), op = merged(CONCEPTS.op);
  const ocf = merged(CONCEPTS.ocf), capex = merged(CONCEPTS.capex), eps = merged(CONCEPTS.eps, 'USD/shares');
  const cash = inst(CONCEPTS.cash), debt = inst(CONCEPTS.debt);
  const sharesCover = instantSeries(rows(dei, 'EntityCommonStockSharesOutstanding', 'shares')), sharesBs = inst(['CommonStockSharesOutstanding'], g, 'shares');
  // instant values dated near the period end (balance sheet on the end date; cover-page share counts come weeks later)
  const near = (m: Map<string, number>, end: string, after = 0, before = 5) => {
    const t = Date.parse(end);
    let best: [number, number] | null = null;
    for (const [k, v] of m) { const d = (Date.parse(k) - t) / DAY; if (d >= -before && d <= after && (!best || Math.abs(d) < best[0])) best = [Math.abs(d), v]; }
    return best?.[1] ?? null;
  };
  const point = (end: string, label: string, pick: 'q' | 'y'): FundPoint => {
    const v = (s: { q: Map<string, number>; y: Map<string, number> }) => s[pick].get(end) ?? null;
    const r = v(rev), n = v(ni), grossV = v(gp) ?? (r != null && v(cost) != null ? r - v(cost)! : null), o = v(op), oc = v(ocf), cx = v(capex);
    const m = (x: number | null) => (x != null && r ? (x / r) * 100 : null);
    return {
      end, label, revenue: r, netIncome: n, eps: v(eps), grossMargin: m(grossV), opMargin: m(o), netMargin: m(n), fcf: oc != null ? oc - (cx ?? 0) : null,
      shares: near(sharesBs, end) ?? near(sharesCover, end, 70, 5), cash: near(cash, end), debt: near(debt, end),
    };
  };
  const yEnds = [...rev.y.keys(), ...ni.y.keys()].filter((v, i, a) => a.indexOf(v) === i).sort().slice(-years);
  const qEnds = [...rev.q.keys(), ...ni.q.keys()].filter((v, i, a) => a.indexOf(v) === i).sort().slice(-quarters);
  const qLabel = (end: string) => { const d = new Date(`${end}T12:00:00Z`); return `${String(d.getUTCFullYear()).slice(2)}Q${Math.floor(d.getUTCMonth() / 3) + 1}`; }; // calendar quarter of the period end
  return {
    annual: yEnds.map((e) => point(e, `FY${e.slice(2, 4)}`, 'y')),
    quarterly: qEnds.map((e) => point(e, qLabel(e), 'q')),
  };
}

/** Year-over-year change for each point (quarterly: vs four quarters earlier). Margins change in points, not %. */
export function yoy(points: FundPoint[], metric: Metric, quarterly: boolean): (number | null)[] {
  const lag = quarterly ? 4 : 1, margin = /Margin$/.test(metric);
  return points.map((p, i) => {
    const a = p[metric], b = points[i - lag]?.[metric];
    if (a == null || b == null) return null;
    if (margin) return a - b;
    return b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null;
  });
}
