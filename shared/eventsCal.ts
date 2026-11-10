// Earnings and IPO calendar engine: parse and merge free sources (Nasdaq's public JSON, Finnhub, SEC EDGAR filings feed).
// Nasdaq's endpoints are unofficial (no key, personal use); Finnhub and EDGAR are the official free ones. Pure + tested.
export type When = 'bmo' | 'amc' | 'dmh' | 'unknown';
export interface EarnItem {
  date: string; sym: string; name: string; when: When; quarter: string;
  epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null;
  nEsts: number | null; mcap: number | null; epsLastYear: number | null; source: string;
}
export type IpoStatus = 'upcoming' | 'priced' | 'filed' | 'withdrawn';
export interface IpoItem { key: string; sym: string; name: string; status: IpoStatus; date: string; exchange: string; price: string; shares: number | null; amount: number | null; source: string }
export interface FilingItem { form: string; company: string; date: string; url: string }

/** "$1,234.5" -> 1234.5, "($0.12)" -> -0.12, "" / "N/A" / "--" -> null */
export function money(s: unknown): number | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || /^(n\/?a|--|-)$/i.test(t)) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  const v = parseFloat(t.replace(/[^0-9.]/g, ''));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}
/** "11/06/2026" -> "2026-11-06" (Nasdaq dates are month/day/year) */
export function mdy(s: unknown): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}
const whenOf = (t: string): When => (/pre-?market|bmo/i.test(t) ? 'bmo' : /after|amc/i.test(t) ? 'amc' : /during|dmh/i.test(t) ? 'dmh' : 'unknown');

/** nasdaq.com /api/calendar/earnings?date=YYYY-MM-DD */
export function parseNasdaqEarnings(j: any, date: string): EarnItem[] {
  const rows: any[] = j?.data?.rows ?? [];
  return rows.filter((r) => r?.symbol).map((r) => ({
    date, sym: String(r.symbol).toUpperCase(), name: String(r.name ?? ''), when: whenOf(String(r.time ?? '')), quarter: String(r.fiscalQuarterEnding ?? ''),
    epsEst: money(r.epsForecast), epsAct: null, revEst: null, revAct: null, nEsts: money(r.noOfEsts), mcap: money(r.marketCap), epsLastYear: money(r.lastYearEPS), source: 'Nasdaq',
  }));
}

export interface FinnhubEarn { sym: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
/** Merge: Nasdaq gives names, market cap and timing for everyone; Finnhub adds actuals and revenue. Same (date, symbol) is one row. */
export function mergeEarnings(nasdaq: EarnItem[], finnhub: FinnhubEarn[]): EarnItem[] {
  const out = new Map<string, EarnItem>();
  for (const n of nasdaq) out.set(`${n.date}|${n.sym}`, { ...n });
  for (const f of finnhub) {
    const k = `${f.date}|${f.sym.toUpperCase()}`;
    const cur = out.get(k);
    if (cur) {
      out.set(k, { ...cur, epsAct: f.epsAct ?? cur.epsAct, epsEst: f.epsEst ?? cur.epsEst, revEst: f.revEst ?? cur.revEst, revAct: f.revAct ?? cur.revAct, when: cur.when === 'unknown' ? whenOf(f.hour) : cur.when, source: 'Nasdaq + Finnhub' });
    } else {
      out.set(k, { date: f.date, sym: f.sym.toUpperCase(), name: '', when: whenOf(f.hour), quarter: '', epsEst: f.epsEst, epsAct: f.epsAct, revEst: f.revEst, revAct: f.revAct, nEsts: null, mcap: null, epsLastYear: null, source: 'Finnhub' });
    }
  }
  return [...out.values()];
}
/** day by day; inside a day the biggest companies first, then alphabetical */
export function sortEarnings(rows: EarnItem[]): EarnItem[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date) || (b.mcap ?? -1) - (a.mcap ?? -1) || a.sym.localeCompare(b.sym));
}
/** actual vs estimate in percent of |estimate|; null when either is missing or the estimate is ~0 */
export function surprisePct(act: number | null, est: number | null): number | null {
  if (act == null || est == null || Math.abs(est) < 0.005) return null;
  return ((act - est) / Math.abs(est)) * 100;
}

/** nasdaq.com /api/ipo/calendar?date=YYYY-MM */
export function parseNasdaqIpo(j: any): IpoItem[] {
  const d = j?.data ?? {};
  const out: IpoItem[] = [];
  const add = (rows: any[] | undefined, status: IpoStatus) => {
    for (const r of rows ?? []) {
      const name = String(r.companyName ?? '').trim();
      if (!name) continue;
      const sym = String(r.proposedTickerSymbol ?? '').toUpperCase();
      const date = mdy(r.withdrawDate) || mdy(r.pricedDate) || mdy(r.expectedPriceDate) || mdy(r.filedDate);
      out.push({ key: sym || name.toLowerCase(), sym, name, status, date, exchange: String(r.proposedExchange ?? ''), price: String(r.proposedSharePrice ?? ''), shares: money(r.sharesOffered), amount: money(r.dollarValueOfSharesOffered), source: 'Nasdaq' });
    }
  };
  add(d.upcoming?.upcomingTable?.rows, 'upcoming'); add(d.priced?.rows, 'priced'); add(d.filed?.rows, 'filed'); add(d.withdrawn?.rows, 'withdrawn');
  return out;
}
/** Finnhub /calendar/ipo -> { ipoCalendar: [{ date, exchange, name, numberOfShares, price, status, symbol, totalSharesValue }] } */
export function parseFinnhubIpo(j: any): IpoItem[] {
  const rows: any[] = Array.isArray(j?.ipoCalendar) ? j.ipoCalendar : [];
  return rows.filter((r) => r?.name).map((r) => {
    const s = String(r.status ?? '').toLowerCase();
    const sym = String(r.symbol ?? '').toUpperCase();
    return { key: sym || String(r.name).toLowerCase(), sym, name: String(r.name), status: (s === 'priced' ? 'priced' : s === 'withdrawn' ? 'withdrawn' : s === 'filed' ? 'filed' : 'upcoming') as IpoStatus, date: String(r.date ?? ''), exchange: String(r.exchange ?? ''), price: String(r.price ?? ''), shares: money(r.numberOfShares), amount: money(r.totalSharesValue), source: 'Finnhub' };
  });
}
const STATUS_RANK: Record<IpoStatus, number> = { withdrawn: 3, priced: 2, upcoming: 1, filed: 0 };
/** one row per company: the later stage wins (filed < upcoming < priced < withdrawn), and the richer source fills gaps */
export function mergeIpos(...lists: IpoItem[][]): IpoItem[] {
  const out = new Map<string, IpoItem>();
  for (const it of lists.flat()) {
    const cur = out.get(it.key);
    if (!cur) { out.set(it.key, { ...it }); continue; }
    const win = STATUS_RANK[it.status] >= STATUS_RANK[cur.status] ? it : cur, lose = win === it ? cur : it;
    out.set(it.key, { ...win, sym: win.sym || lose.sym, exchange: win.exchange || lose.exchange, price: win.price || lose.price, shares: win.shares ?? lose.shares, amount: win.amount ?? lose.amount, date: win.date || lose.date, source: cur.source === it.source ? cur.source : `${cur.source} + ${it.source}` });
  }
  return [...out.values()];
}
export const sortIpos = (rows: IpoItem[]) => [...rows].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.name.localeCompare(b.name));

/** SEC EDGAR "current filings" Atom feed: <title>424B4 - Some Corp (0001234567) (Filer)</title> ... <updated>2026-11-09T16:02:11-05:00</updated> */
export function parseEdgarAtom(xml: string, max = 40): FilingItem[] {
  const out: FilingItem[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(e)?.[1]?.trim() ?? '';
    const t = /^([A-Z0-9/\-]+)\s+-\s+(.+?)\s+\(\d{6,10}\)/.exec(title.replace(/&amp;/g, '&'));
    const href = /<link[^>]*href="([^"]+)"/.exec(e)?.[1] ?? '';
    const date = /<updated>(\d{4}-\d{2}-\d{2})/.exec(e)?.[1] ?? '';
    if (t && /^https:\/\/www\.sec\.gov\//.test(href)) out.push({ form: t[1], company: t[2], date, url: href });
    if (out.length >= max) break;
  }
  return out;
}

/** headlines about IPOs: "IPO" as a word, "initial public offering", "goes / going public", "public debut" */
export function isIpoHeadline(title: string): boolean {
  return /\bIPOs?\b|initial public offering|goes public|going public|go(?:es)? public|public debut|files? (?:confidentially )?to go public/i.test(title) && !/\bIPO ETFs?\b/i.test(title);
}
