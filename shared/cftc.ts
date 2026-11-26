// CFTC Weekly Swaps Report, credit: gross notional outstanding (L2CDSGrossExp) and transaction tickets (L2CDSAct). The pages
// show only the current week, so a weekly job keeps the snapshots in published/cftc-cds.json. Pure + tested on real pages
// (checked 2026-11-26). Official data, not advice.

export interface CftcWeek { week: string; gross: { total: number; hy: number; ig: number } | null; tickets: { total: number; hy: number; ig: number } | null }

/** Page HTML -> plain text (scripts and styles dropped, entities decoded). */
export function pageText(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
const n = (s: string) => Number(s.replace(/,/g, ''));
const usDate = (s: string) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); return m ? `${m[3]}-${m[1]}-${m[2]}` : null; };

/** One report: its date, and the TOTAL row of the "CDS by Product & Grade" table (HY, IG, Other, Total). */
export function parseCftc(html: string, title: RegExp): { week: string; total: number; hy: number; ig: number } | null {
  const t = pageText(html);
  const head = new RegExp(`${title.source}\\s*-\\s*(\\d{2}/\\d{2}/\\d{4})`, 'i').exec(t);
  const week = head ? usDate(head[1]) : null;
  const g = t.indexOf('CDS by Product & Grade');
  if (!week || g < 0) return null;
  const row = /TOTAL\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/.exec(t.slice(g));
  return row ? { week, hy: n(row[1]), ig: n(row[2]), total: n(row[4]) } : null;
}
export const parseGross = (html: string) => parseCftc(html, /Gross Notional Outstanding - Credit \(Millions of USD\)/);
export const parseTickets = (html: string) => parseCftc(html, /Transaction Ticket Volume - Credit \(Transactions\)/);

/** Add this week's snapshot (replacing a same-week one), newest last, keeping 5 years. */
export function mergeWeeks(prev: CftcWeek[], cur: CftcWeek): CftcWeek[] {
  return [...prev.filter((w) => w.week !== cur.week), cur].sort((a, b) => a.week.localeCompare(b.week)).slice(-260);
}
