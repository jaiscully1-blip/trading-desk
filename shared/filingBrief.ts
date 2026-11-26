// Filing brief: the main points of a company's latest 10-Q, 10-K or earnings release. Official numbers come from SEC XBRL
// (no AI). The written points come from the free AI chain, which only sees selected sentences of the filing and must quote
// it; every quote is checked against the filing text before it is shown. Pure + tested. Facts from filings, not advice.
import { section } from './company.js';
import { quoteFound } from './patentEvidence.js';
import type { FundPoint, FundSeries } from './fundseries.js';
import type { InsiderTx } from './insider.js';

export type BriefKind = '10-Q' | '10-K' | 'earnings';
export interface FilingRef { form: string; date: string; acc: string; file: string; items: string }

/** Filings worth a brief, newest first: 10-Qs, 10-Ks and earnings releases (8-K item 2.02). */
export function briefChoices(rows: FilingRef[], n = 8): (FilingRef & { kind: BriefKind })[] {
  const out: (FilingRef & { kind: BriefKind })[] = [];
  for (const r of rows) {
    const kind: BriefKind | null = r.form === '10-Q' ? '10-Q' : r.form === '10-K' ? '10-K' : r.form === '8-K' && /2\.02/.test(r.items) ? 'earnings' : null;
    if (kind) out.push({ ...r, kind });
    if (out.length >= n) break;
  }
  return out;
}

/** A filing index page's link for a document type (e.g. EX-99.1), whatever the file is called ("q3fy27pr.htm"). */
export function exhibitFromIndex(html: string, type: RegExp): string | null {
  for (const m of html.matchAll(/<td[^>]*>\s*([A-Z0-9.\-]+)\s*<\/td>\s*<td[^>]*>\s*<a href="([^"]+)"/gi)) if (type.test(m[1])) return m[2];
  return null;
}

/** The parts of the filing worth reading. 10-Q: MD&A (Item 2) and Part II risk factors; 10-K: MD&A (Item 7) and market
 *  risk (7A); earnings release: the whole text. */
export function briefText(text: string, kind: BriefKind): string {
  if (kind === 'earnings') return text.slice(0, 60_000);
  const mdna = kind === '10-Q'
    ? section(text, /item\s*2\.?\s*management'?’?s\s*discussion/, /item\s*3\.?\s*quantitative/, 60_000)
    : section(text, /item\s*7\.?\s*management'?’?s\s*discussion/, /item\s*7a\.?|item\s*8\.?\s*financial\s*statements/, 60_000);
  const extra = kind === '10-Q' ? section(text, /item\s*1a\.?\s*risk\s*factors/, /item\s*2\.?\s*unregistered|item\s*5\.?\s*other|item\s*6\.?\s*exhibits/, 15_000)
    : section(text, /item\s*7a\.?\s*quantitative/, /item\s*8\.?\s*financial\s*statements/, 10_000);
  return [mdna, extra].filter(Boolean).join('\n\n') || text.slice(0, 60_000);
}

const KEY = /\b(increas|decreas|grew|growth|declin|guidance|outlook|expect|forecast|liquidity|cash|debt|borrow|credit facilit|covenant|impair|restructur|layoff|headcount|demand|backlog|bookings|margin|pricing|repurchas|buyback|dividend|acquisition|divest|litigation|investigation|going concern|material weakness|variable interest|special purpose|tariff|supply|inventor|customer|segment)/i;
/** Legal boilerplate and cross-references: never worth a point. */
const BOILER = /forward-looking statement|you should read|refer to note|see note \d|incorporated (herein )?by reference|safe harbor|undue reliance|this quarterly report on form|this annual report on form|risk factors? (section|in part)/i;
/** The sentences most likely to matter (numbers or key words), in filing order, up to `budget` characters. */
export function keySentences(text: string, budget = 12_000): string[] {
  const sents = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z(])/).filter((s) => s.length >= 50 && s.length <= 700 && !BOILER.test(s));
  const scored = sents.map((s, i) => ({ s, i, n: (KEY.test(s) ? 2 : 0) + (/\d[\d,.]*\s*(%|percent|million|billion)/i.test(s) ? 2 : 0) + (/\$\s?\d/.test(s) ? 1 : 0) }))
    .filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || a.i - b.i);
  const pick: typeof scored = []; let used = 0;
  for (const x of scored) { if (used + x.s.length > budget) continue; pick.push(x); used += x.s.length; }
  return pick.sort((a, b) => a.i - b.i).map((x) => x.s);
}

export const TOPICS = ['Results', 'Guidance', 'Demand', 'Margins and costs', 'Cash and debt', 'Buybacks and dividends', 'Risks', 'Other'] as const;
export const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    points: { type: 'array', items: { type: 'object', properties: { topic: { type: 'string', enum: [...TOPICS] }, text: { type: 'string' }, quote: { type: 'string' } }, required: ['topic', 'text', 'quote'] } },
  },
  required: ['headline', 'points'],
};
export function briefPrompt(company: string, kind: BriefKind, date: string, sents: string[]): string {
  const what = kind === 'earnings' ? 'earnings press release' : `${kind} filing`;
  return `You brief an investor on ${company}'s ${what} dated ${date}, using ONLY the numbered sentences below. No outside knowledge, no opinions, no advice.
Return JSON with:
- headline: one plain sentence on the most important thing in this ${what}.
- points: 5 to 10 points, each with a topic (${TOPICS.join(', ')}), a short plain-English "text", and "quote": the one sentence it comes from, copied EXACTLY, word for word, from the list.
Prefer concrete numbers and changes (vs last year or last quarter). Include anything about guidance, liquidity, debt, impairments, layoffs, investigations, going concern or material weaknesses if present. Do not invent numbers.

SENTENCES:
${sents.map((s, i) => `[${i}] ${s}`).join('\n')}`;
}
export interface BriefPoint { topic: string; text: string; quote: string }
/** Keep points whose quotes are really in the filing; count the rest. */
export function checkBrief(raw: any, text: string): { headline: string; points: BriefPoint[]; dropped: number } {
  const pts: BriefPoint[] = []; let dropped = 0;
  for (const p of Array.isArray(raw?.points) ? raw.points : []) {
    const q = String(p?.quote ?? '').trim(), t = String(p?.text ?? '').trim();
    if (!t) continue;
    if (quoteFound(q, text)) pts.push({ topic: (TOPICS as readonly string[]).includes(p?.topic) ? p.topic : 'Other', text: t.slice(0, 400), quote: q.slice(0, 600) });
    else dropped++;
  }
  return { headline: String(raw?.headline ?? '').trim().slice(0, 300), points: pts.slice(0, 12), dropped };
}

/** Official numbers for the period a filing covers, with the same period a year earlier and the period before. */
export function briefNumbers(fs: FundSeries, kind: BriefKind, periodEnd: string | null): { cur: FundPoint; yearAgo: FundPoint | null; prior: FundPoint | null; basis: 'quarter' | 'year' } | null {
  const basis = kind === '10-K' ? 'year' : 'quarter';
  const list = basis === 'year' ? fs.annual : fs.quarterly;
  if (!list.length) return null;
  const near = (iso: string, target: string) => Math.abs(Date.parse(iso) - Date.parse(target)) < 20 * 86400000;
  const i = periodEnd ? list.findIndex((p) => near(p.end, periodEnd)) : list.length - 1;
  const at = i >= 0 ? i : list.length - 1;
  const cur = list[at];
  const yearBack = new Date(Date.parse(cur.end) - 365 * 86400000).toISOString().slice(0, 10);
  return { cur, yearAgo: list.find((p) => near(p.end, yearBack)) ?? null, prior: basis === 'quarter' ? list[at - 1] ?? null : null, basis };
}

/** Open-market insider buys and sells (Form 4 codes P and S) in the last `days` days. */
export function insiderSummary(txs: InsiderTx[], now: Date, days = 90) {
  const since = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const recent = txs.filter((t) => t.date >= since && (t.code === 'P' || t.code === 'S'));
  // value = total of the trades that state one; `priced` = how many did (Form 4s sometimes give no price)
  const sum = (code: string) => recent.filter((t) => t.code === code).reduce((s, t) => ({ n: s.n + 1, value: s.value + (t.value ?? 0), priced: s.priced + (t.value ? 1 : 0) }), { n: 0, value: 0, priced: 0 });
  return { since, buys: sum('P'), sells: sum('S'), rows: recent.slice(0, 12) };
}
