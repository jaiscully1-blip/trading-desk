// Tear sheet numbers from SEC XBRL data (free, official): shares outstanding, public float, cash, debt, and the last fiscal
// year's revenue, net income and free cash flow. Float in shares is ESTIMATED: SEC filings give the dollar value of shares
// held by non-affiliates on one date (the 10-K cover, usually the end of the 2nd fiscal quarter); dividing by that day's
// close gives the share count. Pure functions (tested).

type F = { val: number; end: string; start?: string; form?: string; fy?: number; fp?: string; filed?: string };
const DAY = 86400_000;
const days = (r: F) => (r.start ? (Date.parse(r.end) - Date.parse(r.start)) / DAY : 0);
const latest = (rs: F[]) => rs.reduce<F | null>((a, r) => (!a || r.end > a.end || (r.end === a.end && (r.filed ?? '') > (a.filed ?? '')) ? r : a), null);

export interface Tear {
  sharesOut: number | null; sharesAsOf: string | null; sharesYearAgo: number | null;
  publicFloatUsd: number | null; floatAsOf: string | null;
  cash: number | null; debt: number | null; balanceAsOf: string | null;
  revenueFY: number | null; netIncomeFY: number | null; fcfFY: number | null; fyEnd: string | null;
}

export function tearFromFacts(j: any): Tear {
  const g = j?.facts?.['us-gaap'] ?? {}, dei = j?.facts?.dei ?? {};
  const units = (src: any, c: string, u = 'USD'): F[] => (src?.[c]?.units?.[u] ?? []).filter((r: F) => Number.isFinite(r.val));
  // the cover-page count; some filers (Alphabet) only report the balance-sheet total of all classes, so fall back to that
  const coverSh = units(dei, 'EntityCommonStockSharesOutstanding', 'shares');
  const sh = coverSh.length ? coverSh : units(g, 'CommonStockSharesOutstanding', 'shares').filter((r) => !r.start);
  // companies with several share classes report one row per class on the same date: add them up
  const shNow = latest(sh);
  const sharesOut = shNow ? sh.filter((r) => r.end === shNow.end && r.filed === shNow.filed).reduce((a, r) => a + r.val, 0) : null;
  const agoRows = shNow ? sh.filter((r) => Date.parse(r.end) <= Date.parse(shNow.end) - 300 * DAY) : [];
  const ago = latest(agoRows);
  const sharesYearAgo = ago ? agoRows.filter((r) => r.end === ago.end && r.filed === ago.filed).reduce((a, r) => a + r.val, 0) : null;
  const pf = latest(units(dei, 'EntityPublicFloat'));

  // balance sheet: the latest quarter-end with cash reported
  // companies switch concept names over the years, so take the newest value across all the names, not the first name found
  const inst = (cs: string[]) => latest(cs.flatMap((c) => units(g, c).filter((x) => !x.start)));
  const cashR = inst(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'Cash']);
  const at = (c: string, end: string) => { const r = units(g, c).filter((x) => !x.start && x.end === end); return r.length ? r[r.length - 1].val : null; };
  let debt: number | null = null;
  if (cashR) {
    const e = cashR.end;
    const first = (cs: string[]) => { for (const c of cs) { const v = at(c, e); if (v != null) return v; } return null; };
    const parts = [first(['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'ConvertibleNotesPayable', 'ConvertibleDebtNoncurrent', 'ConvertibleLongTermNotesPayable', 'SeniorNotes', 'LongTermNotesPayable']), first(['LongTermDebtCurrent', 'DebtCurrent', 'ConvertibleNotesPayableCurrent']), at('ShortTermBorrowings', e), at('CommercialPaper', e)];
    const total = at('LongTermDebt', e);
    const sum = parts.filter((x): x is number => x != null);
    // LongTermDebt already includes the current portion; add only short-term borrowings / commercial paper to it
    debt = total != null ? total + (at('ShortTermBorrowings', e) ?? 0) + (at('CommercialPaper', e) ?? 0) : sum.length ? sum.reduce((a, b) => a + b, 0) : null;
  }

  // last full fiscal year (10-K, about 365 days)
  const fy = (cs: string[]) => latest(cs.flatMap((c) => units(g, c).filter((x) => days(x) >= 350 && days(x) <= 380 && /10-K/.test(x.form ?? ''))));
  const rev = fy(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax']);
  const ni = fy(['NetIncomeLoss', 'ProfitLoss']);
  const ocf = fy(['NetCashProvidedByUsedInOperatingActivities']);
  const capex = fy(['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets']);
  return {
    sharesOut, sharesAsOf: shNow?.end ?? null, sharesYearAgo,
    publicFloatUsd: pf?.val ?? null, floatAsOf: pf?.end ?? null,
    cash: cashR?.val ?? null, debt, balanceAsOf: cashR?.end ?? null,
    revenueFY: rev?.val ?? null, netIncomeFY: ni?.val ?? null,
    fcfFY: ocf ? ocf.val - (capex && capex.end === ocf.end ? capex.val : 0) : null, fyEnd: rev?.end ?? ocf?.end ?? null,
  };
}

/** Close on a date (or the last trading day before it, within a week). bars: time in seconds (exchange-local) or ms. */
export function closeOn(bars: { time: number; close: number }[], date: string): number | null {
  const want = Date.parse(`${date}T23:59:59Z`);
  let best: { t: number; c: number } | null = null;
  for (const b of bars) {
    const t = b.time > 1e12 ? b.time : b.time * 1000;
    if (t <= want && t >= want - 7 * DAY && Number.isFinite(b.close) && (!best || t > best.t)) best = { t, c: b.close };
  }
  return best?.c ?? null;
}

/** Estimated float in shares: non-affiliate value ÷ the close on that date. Capped at shares outstanding. */
export function floatShares(publicFloatUsd: number | null, close: number | null, sharesOut: number | null): number | null {
  if (publicFloatUsd == null || close == null || !(close > 0) || !(publicFloatUsd > 0)) return null;
  const est = publicFloatUsd / close;
  return sharesOut != null && sharesOut > 0 ? Math.min(est, sharesOut) : est;
}

/** SEC frames (one concept, one period, every company) -> latest value per CIK across the periods given. */
export function latestByCik(frames: any[]): Map<number, { val: number; end: string }> {
  const out = new Map<number, { val: number; end: string }>();
  for (const f of frames) for (const r of f?.data ?? []) {
    const cik = Number(r?.cik), val = Number(r?.val), end = String(r?.end ?? '');
    if (!cik || !Number.isFinite(val) || !end) continue;
    const prev = out.get(cik);
    if (!prev || end > prev.end) out.set(cik, { val, end });
  }
  return out;
}

/** The last n calendar quarters as SEC frame periods for instant values, newest first: CY2026Q3I, CY2026Q2I… */
export function recentInstantPeriods(todayISO: string, n = 5): string[] {
  let y = +todayISO.slice(0, 4), q = Math.floor((+todayISO.slice(5, 7) - 1) / 3); // the quarter before this one
  const out: string[] = [];
  for (let i = 0; i < n; i++) { if (q === 0) { y -= 1; q = 4; } out.push(`CY${y}Q${q}I`); q -= 1; }
  return out;
}
