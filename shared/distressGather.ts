// Parsers that turn free public responses into distress inputs. Pure functions (no fetching), shared by the nightly
// GitHub Action (scripts/distress-build.ts) and the live route for your own tickers (api/_lib/research/distress.ts).
import { EMPTY_FIN, tagHeadline, type Event8K, type Fin, type GoingConcern, type InsiderAgg, type LateFiling, type NewsHit } from './distress.js';
import type { InsiderTx } from './insider.js';

/* ---------------- SEC XBRL frames (one concept, every company, one period) ---------------- */
export interface FramePeriods { inst: [string, string]; instYearAgo: [string, string]; q: [string, string]; qYearAgo: [string, string]; year: string }
/** Which periods to ask for: the newest quarter (filings for it trickle in for ~6 weeks, so the one before is the fallback). */
export function framePeriods(today: string): FramePeriods {
  const d = new Date(`${today}T12:00:00Z`);
  const lag = new Date(d.getTime() - 40 * 86400_000); // a quarter's 10-Qs are mostly in ~40 days after it ends
  const qOf = (t: Date) => ({ y: t.getUTCFullYear(), q: Math.floor(t.getUTCMonth() / 3) + 1 });
  let { y, q } = qOf(lag);
  q -= 1; if (q === 0) { q = 4; y -= 1; } // last quarter that has ended
  const prev = q === 1 ? { y: y - 1, q: 4 } : { y, q: q - 1 };
  const lbl = (a: { y: number; q: number }, inst: boolean) => `CY${a.y}Q${a.q}${inst ? 'I' : ''}`;
  const ago = (a: { y: number; q: number }) => ({ y: a.y - 1, q: a.q });
  return {
    inst: [lbl({ y, q }, true), lbl(prev, true)], instYearAgo: [lbl(ago({ y, q }), true), lbl(ago(prev), true)],
    q: [lbl({ y, q }, false), lbl(prev, false)], qYearAgo: [lbl(ago({ y, q }), false), lbl(ago(prev), false)],
    year: `CY${d.getUTCMonth() >= 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear() - 2}`,
  };
}
export const INSTANT = ['Assets', 'Liabilities', 'LiabilitiesAndStockholdersEquity', 'AssetsCurrent', 'LiabilitiesCurrent', 'RetainedEarningsAccumulatedDeficit', 'StockholdersEquity', 'CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] as const;
export const QUARTER = ['OperatingIncomeLoss', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'] as const;
export const ANNUAL = ['NetCashProvidedByUsedInOperatingActivities', 'InterestExpense', 'InterestExpenseNonoperating', 'PaymentsForRepurchaseOfCommonStock'] as const;
export const frameUrl = (taxonomy: 'us-gaap' | 'dei', concept: string, unit: string, period: string) => `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${concept}/${unit}/${period}.json`;

export type FrameMap = Map<number, { val: number; end: string }>;
export const parseFrame = (j: any): FrameMap => {
  const m: FrameMap = new Map();
  for (const r of j?.data ?? []) if (Number.isFinite(r?.cik) && Number.isFinite(r?.val)) m.set(r.cik, { val: r.val, end: String(r.end ?? '') });
  return m;
};
/** frames[`${concept}@${period}`] -> one Fin per CIK, newest period first, sensible fallbacks between concepts. */
export function finFromFrames(frames: Record<string, FrameMap>, p: FramePeriods, cik: number): Fin | null {
  const pick = (concepts: readonly string[] | string[], periods: string[]) => {
    for (const per of periods) for (const c of concepts) { const v = frames[`${c}@${per}`]?.get(cik); if (v) return v; }
    return null;
  };
  const v = (x: { val: number } | null) => (x ? x.val : null);
  const per = p.inst.filter((x) => frames[`Assets@${x}`]?.has(cik)).slice(0, 1); // the balance sheet all comes from one period
  if (!per.length) return null;
  const assets = frames[`Assets@${per[0]}`]!.get(cik)!;
  const same = (c: string[]) => v(pick(c, per));
  const equity = same(['StockholdersEquity']);
  const lse = same(['LiabilitiesAndStockholdersEquity']);
  const liabilities = same(['Liabilities']) ?? (lse != null && equity != null ? lse - equity : null);
  // revenue: same concept for this quarter and the same quarter a year earlier
  let revenueQ: number | null = null, revenueQPrev: number | null = null;
  for (const c of ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']) {
    for (let i = 0; i < 2; i++) {
      const a = frames[`${c}@${p.q[i]}`]?.get(cik), b = frames[`${c}@${p.qYearAgo[i]}`]?.get(cik);
      if (a && b) { revenueQ = a.val; revenueQPrev = b.val; break; }
      if (a && revenueQ == null) revenueQ = a.val;
    }
    if (revenueQPrev != null) break;
  }
  const shares = pick(['EntityCommonStockSharesOutstanding'], p.inst);
  const sharesAgo = pick(['EntityCommonStockSharesOutstanding'], p.instYearAgo);
  return {
    ...EMPTY_FIN, assets: assets.val, liabilities, equity, curAssets: same(['AssetsCurrent']), curLiab: same(['LiabilitiesCurrent']), retained: same(['RetainedEarningsAccumulatedDeficit']),
    cash: same(['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents']),
    ebitQ: v(pick(['OperatingIncomeLoss'], p.q)), revenueQ, revenueQPrev,
    ocfY: v(pick(['NetCashProvidedByUsedInOperatingActivities'], [p.year])), interestY: v(pick(['InterestExpense', 'InterestExpenseNonoperating'], [p.year])),
    buybackY: v(pick(['PaymentsForRepurchaseOfCommonStock'], [p.year])), sharesNow: shares?.val ?? null, sharesYearAgo: sharesAgo?.val ?? null, asOf: assets.end || null,
  };
}

/** One company's companyfacts JSON -> Fin (used for single tickers, where downloading every frame would be wasteful). */
export function finFromCompanyFacts(j: any): Fin | null {
  const g = j?.facts?.['us-gaap'] ?? {}, dei = j?.facts?.dei ?? {};
  type F = { val: number; end: string; start?: string; form?: string };
  const units = (src: any, c: string, u = 'USD'): F[] => (src?.[c]?.units?.[u] ?? []).filter((r: F) => Number.isFinite(r.val) && /10-[QK]/.test(r.form ?? '10-Q'));
  const days = (r: F) => (r.start ? (Date.parse(r.end) - Date.parse(r.start)) / 86400_000 : 0);
  const latest = (rs: F[]) => rs.reduce<F | null>((a, r) => (!a || r.end > a.end ? r : a), null);
  const inst = (cs: string[]) => { for (const c of cs) { const r = latest(units(g, c).filter((x) => !x.start)); if (r) return r; } return null; };
  const dur = (cs: string[], lo: number, hi: number) => { for (const c of cs) { const r = latest(units(g, c).filter((x) => days(x) >= lo && days(x) <= hi)); if (r) return r; } return null; };
  const assets = inst(['Assets']);
  if (!assets) return null;
  const at = (c: string) => { const r = units(g, c).filter((x) => !x.start && x.end === assets.end); return r.length ? r[r.length - 1].val : null; };
  const equity = at('StockholdersEquity'), lse = at('LiabilitiesAndStockholdersEquity');
  const revQ = dur(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'], 80, 100);
  let revPrev: number | null = null;
  if (revQ) for (const c of ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']) {
    const want = Date.parse(revQ.end) - 365 * 86400_000;
    const r = units(g, c).find((x) => days(x) >= 80 && days(x) <= 100 && Math.abs(Date.parse(x.end) - want) < 20 * 86400_000);
    if (r) { revPrev = r.val; break; }
  }
  const sh = (dei.EntityCommonStockSharesOutstanding?.units?.shares ?? []) as F[];
  const shNow = latest(sh);
  const shAgo = shNow ? sh.filter((x) => Date.parse(x.end) <= Date.parse(shNow.end) - 300 * 86400_000).reduce<F | null>((a, r) => (!a || r.end > a.end ? r : a), null) : null;
  return {
    ...EMPTY_FIN, assets: assets.val, equity, liabilities: at('Liabilities') ?? (lse != null && equity != null ? lse - equity : null),
    curAssets: at('AssetsCurrent'), curLiab: at('LiabilitiesCurrent'), retained: at('RetainedEarningsAccumulatedDeficit'),
    cash: at('CashAndCashEquivalentsAtCarryingValue') ?? at('CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'),
    ebitQ: dur(['OperatingIncomeLoss'], 80, 100)?.val ?? null, revenueQ: revQ?.val ?? null, revenueQPrev: revPrev,
    ocfY: dur(['NetCashProvidedByUsedInOperatingActivities'], 350, 380)?.val ?? null, interestY: dur(['InterestExpense', 'InterestExpenseNonoperating'], 350, 380)?.val ?? null,
    buybackY: dur(['PaymentsForRepurchaseOfCommonStock'], 350, 380)?.val ?? null, sharesNow: shNow?.val ?? null, sharesYearAgo: shAgo?.val ?? null, asOf: assets.end,
  };
}

/* ---------------- SEC submissions JSON: 8-K items, late filings, Form 4 list, HQ state ---------------- */
export function fromSubmissions(j: any, cik: number, today: string): { events: Event8K[]; late: LateFiling[]; form4: { filed: string; url: string; index: string }[]; state: string; city: string } {
  const r = j?.filings?.recent ?? {};
  const events: Event8K[] = [], late: LateFiling[] = [], form4: { filed: string; url: string; index: string }[] = [];
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const age = (d: string) => (t0 - Date.parse(`${d}T00:00:00Z`)) / 86400_000;
  for (let i = 0; i < (r.form?.length ?? 0); i++) {
    const form = String(r.form[i]), date = String(r.filingDate[i]);
    if (age(date) > 365) break; // newest first
    const acc = String(r.accessionNumber[i]).replace(/-/g, '');
    const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/`;
    if ((form === '8-K' || form === '8-K/A') && age(date) <= 180) events.push({ date, items: String(r.items?.[i] ?? '').split(',').map((s) => s.trim()).filter(Boolean), url: base + String(r.primaryDocument[i] ?? '') });
    else if (/^NT 10-[KQ]/.test(form)) late.push({ form, date, url: base });
    else if (form === '4' && age(date) <= 90 && form4.length < 8) form4.push({ filed: date, url: base + String(r.primaryDocument[i]).replace(/^xslF345X\d+\//, ''), index: base });
  }
  const b = j?.addresses?.business ?? {};
  return { events, late, form4, state: /^[A-Z]{2}$/.test(b.stateOrCountry ?? '') && !b.isForeignLocation ? b.stateOrCountry : '', city: String(b.city ?? '') };
}

/** Form 4 transactions -> open-market buys and sells in the last 90 days. */
export function insiderAgg(txs: InsiderTx[], today: string): InsiderAgg {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 90 * 86400_000).toISOString().slice(0, 10);
  const r = txs.filter((t) => t.date >= since);
  const buys = r.filter((t) => t.code === 'P'), sells = r.filter((t) => t.code === 'S');
  return { buys: buys.length, sells: sells.length, buyValue: buys.reduce((a, t) => a + (t.value ?? 0), 0), sellValue: sells.reduce((a, t) => a + (t.value ?? 0), 0), buyers: new Set(buys.map((t) => t.who)).size };
}

/* ---------------- SEC full-text search: going-concern wording ---------------- */
/** Phrases used when a company actually has going-concern doubt (the bare words "going concern" are in nearly every filing's boilerplate). */
export const GC_PHRASES = ['these conditions raise substantial doubt', 'there is substantial doubt', 'substantial doubt exists'];
export const eftsUrl = (phrase: string, ciks: number[], from: string, to: string) =>
  `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${phrase}"`)}&forms=10-K,10-Q&dateRange=custom&startdt=${from}&enddt=${to}&ciks=${ciks.map((c) => String(c).padStart(10, '0')).join(',')}`;
export function parseEfts(j: any, into: Map<number, GoingConcern>) {
  for (const h of j?.hits?.hits ?? []) {
    const s = h?._source ?? {};
    const cik = parseInt(String(s.ciks?.[0] ?? ''), 10), adsh = String(s.adsh ?? '');
    if (!cik || !adsh) continue;
    const g = { date: String(s.file_date ?? ''), form: String(s.form ?? s.file_type ?? ''), url: `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, '')}/` };
    const prev = into.get(cik);
    if (!prev || g.date > prev.date) into.set(cik, g);
  }
}

/* ---------------- prices, short volume, headlines ---------------- */
export const yahooSym = (s: string) => s.replace(/\./g, '-');
/** Yahoo v8 spark (unofficial): { SYM: { close: [...] } } -> closes per desk symbol. */
export function parseSpark(j: any, syms: string[]): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const s of syms) { const c = j?.[yahooSym(s)]?.close; if (Array.isArray(c)) m.set(s, c.filter((x: unknown) => typeof x === 'number' && Number.isFinite(x))); }
  return m;
}
/** FINRA daily short sale volume files (pipe separated) -> short volume / total volume, summed over the days given. */
export function parseFinraShort(texts: string[], want: Set<string>): Map<string, number> {
  const agg = new Map<string, [number, number]>();
  for (const t of texts) for (const line of t.split('\n').slice(1)) {
    const [, sym, sv, , tv] = line.split('|');
    const s = sym?.replace(/\//g, '.');
    if (!s || !want.has(s)) continue;
    const a = agg.get(s) ?? [0, 0];
    a[0] += Number(sv) || 0; a[1] += Number(tv) || 0;
    agg.set(s, a);
  }
  const out = new Map<string, number>();
  agg.forEach(([sv, tv], s) => { if (tv > 0) out.set(s, sv / tv); });
  return out;
}
/** Yahoo Finance headline RSS (unofficial) -> tagged headlines. */
export function parseYahooRss(xml: string): NewsHit[] {
  const out: NewsHit[] = [];
  const dec = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const title = dec(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] ?? ''), url = dec(/<link>([\s\S]*?)<\/link>/.exec(it)?.[1] ?? '');
    const t = Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it)?.[1] ?? '');
    if (!title || !/^https:\/\//.test(url) || !Number.isFinite(t)) continue;
    out.push({ t, title, url, src: 'Yahoo Finance RSS', ...tagHeadline(title) });
  }
  return out;
}
export const tagNews = (items: { t: number; title: string; url: string; src: string }[]): NewsHit[] =>
  items.filter((n) => /^https?:\/\//.test(n.url)).map((n) => ({ t: n.t, title: n.title, url: n.url, src: n.src, ...tagHeadline(n.title) }));
