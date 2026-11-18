// Market Plumbing: pure parsers and calendars (tested). Short volume (FINRA daily), off-exchange share (FINRA weekly ATS / OTC),
// fails to deliver (SEC), borrow fee and availability (Interactive Brokers' public file), unusual options (Cboe delayed chain),
// index rebalance dates, IPO lockups, buybacks and dilution (SEC XBRL and filings).
import type { Contract } from './gamma';

/** FINRA consolidated short volume file: "Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market" */
export function parseShortVol(txt: string): Map<string, { short: number; total: number }> {
  const out = new Map<string, { short: number; total: number }>();
  for (const l of txt.split('\n').slice(1)) {
    const p = l.split('|');
    if (p.length < 5) continue;
    const short = Number(p[2]), total = Number(p[4]);
    if (p[1] && Number.isFinite(short) && total > 0) out.set(p[1], { short, total });
  }
  return out;
}

/** SEC fails-to-deliver text: "SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE" */
export function parseFtd(txt: string, sym: string): { date: string; qty: number; price: number | null }[] {
  const out: { date: string; qty: number; price: number | null }[] = [];
  for (const l of txt.split('\n')) {
    const p = l.split('|');
    if (p[2] !== sym) continue;
    const d = p[0], qty = Number(p[3]), px = Number(p[5]);
    if (/^\d{8}$/.test(d) && Number.isFinite(qty)) out.push({ date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, qty, price: Number.isFinite(px) ? px : null });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Interactive Brokers short-stock file: "#SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE|FIGI|" (US stocks only, tickers). */
export function parseIbBorrow(txt: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {};
  for (const l of txt.split('\n')) {
    if (l.startsWith('#')) continue;
    const p = l.split('|');
    if (p.length < 8 || p[1] !== 'USD' || !/^[A-Z][A-Z0-9.]{0,9}$/.test(p[0])) continue;
    const fee = Number(p[6]), rebate = Number(p[5]), avail = p[7].startsWith('>') ? Number(p[7].slice(1)) : Number(p[7]);
    if (Number.isFinite(fee)) out[p[0]] = [fee, Number.isFinite(rebate) ? rebate : 0, Number.isFinite(avail) ? avail : 0];
  }
  return out;
}

/** "Unusual" option activity: today's volume above open interest (new positions) with real size. Sorted by premium traded. */
export function unusualOptions(contracts: Contract[], minVol = 300): (Contract & { ratio: number; premium: number })[] {
  return contracts.filter((c) => c.vol >= minVol && c.vol > c.oi * 1.2).map((c) => ({ ...c, ratio: c.oi ? c.vol / c.oi : Infinity, premium: c.vol * 100 * (c.last || ((c.bid ?? 0) + (c.ask ?? 0)) / 2) }))
    .sort((a, b) => b.premium - a.premium).slice(0, 25);
}

/* ---------------- calendars ---------------- */
const nthWeekday = (y: number, m: number, weekday: number, n: number) => { const d = new Date(Date.UTC(y, m - 1, 1)); const off = (weekday - d.getUTCDay() + 7) % 7; return new Date(Date.UTC(y, m - 1, 1 + off + (n - 1) * 7)); };
const lastWeekday = (y: number, m: number, weekday: number) => { const d = new Date(Date.UTC(y, m, 0)); const off = (d.getUTCDay() - weekday + 7) % 7; return new Date(Date.UTC(y, m - 1, d.getUTCDate() - off)); };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface RebalanceEvent { date: string; index: string; what: string; flows: string }
/** Index rebalance and reconstitution days for this year and next (effective after the close; announcements ~1-2 weeks before). */
export function rebalanceCalendar(year: number): RebalanceEvent[] {
  const out: RebalanceEvent[] = [];
  for (const y of [year, year + 1]) {
    for (const m of [3, 6, 9, 12]) out.push({ date: iso(nthWeekday(y, m, 5, 3)), index: 'S&P 500 / 400 / 600', what: 'Quarterly rebalance (share counts, float, additions and deletions). Also quad witching.', flows: 'Index funds buy additions and sell deletions at the close: closing-auction volume spikes.' });
    out.push({ date: iso(nthWeekday(y, 12, 5, 3)), index: 'Nasdaq-100', what: 'Annual reconstitution (smallest members out, largest non-members in).', flows: 'QQQ and other trackers trade the changes at the close.' });
    out.push({ date: iso(lastWeekday(y, 6, 5)), index: 'Russell 1000 / 2000 / 3000', what: 'Annual reconstitution (moving to semi-annual).', flows: 'Often one of the biggest closing auctions of the year; small caps see the most churn.' });
    out.push({ date: iso(nthWeekday(y, 11, 5, 4)), index: 'MSCI', what: 'Semi-annual index review (also late May).', flows: 'Global passive funds adjust, including foreign holders of US stocks.' });
    out.push({ date: iso(lastWeekday(y, 5, 5)), index: 'MSCI', what: 'Semi-annual index review.', flows: 'Global passive funds adjust.' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** IPO lockups end ~180 days after pricing (it varies by deal; the prospectus has the exact terms). */
export const lockupEnd = (ipoDate: string, days = 180) => iso(new Date(Date.parse(`${ipoDate}T00:00:00Z`) + days * 86400_000));

/** EDGAR full-text search hit -> { name, ticker, cik } from display_names like "Fervo Energy Co  (FRVO)  (CIK 0001853868)". */
export function parseDisplayName(s: string): { name: string; ticker: string | null; cik: string | null } {
  const m = /^(.*?)\s+(?:\(([A-Z][A-Z0-9.,\- ]*)\)\s+)?\(CIK (\d+)\)\s*$/.exec(s.trim());
  if (!m) return { name: s.trim(), ticker: null, cik: null };
  return { name: m[1].trim(), ticker: m[2] ? m[2].split(',')[0].trim() : null, cik: m[3] };
}

/** Off-exchange share of volume: (ATS + other OTC shares) / total shares traded that week. */
export const offExchangeShare = (ats: number, otc: number, total: number) => (total > 0 ? Math.min(1, (ats + otc) / total) : null);

/** Merger arbitrage: spread to the deal price and a simple annualized return to the expected close (cash or stock-for-stock). */
export function arbSpread(o: { targetPx: number; cash?: number; ratio?: number; acquirerPx?: number; closeDate?: string; now?: number }) {
  const value = (o.cash ?? 0) + (o.ratio && o.acquirerPx ? o.ratio * o.acquirerPx : 0);
  if (!(value > 0) || !(o.targetPx > 0)) return null;
  const spread = (value / o.targetPx - 1) * 100;
  const days = o.closeDate ? Math.max(1, (Date.parse(`${o.closeDate}T00:00:00Z`) - (o.now ?? Date.now())) / 86400_000) : null;
  return { value, spread, annualized: days ? (Math.pow(1 + spread / 100, 365 / days) - 1) * 100 : null, days };
}
