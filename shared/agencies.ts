// Agencies page: publications from central banks and financial regulators (BIS, ECB, Bank of England, Fed, FSB, OCC, ...),
// newest first, with keyword notes and an on-demand AI summary whose every point quotes the publication. Feeds checked
// 2026-11-26 (IMF, US Treasury and OECD refuse automated requests; World Bank and FDIC feeds moved: left out, not faked).
// Pure + tested. Official publications; summaries are labeled AI. Not advice.
import { quoteFound } from './patentEvidence.js';

export type PubType = 'Press' | 'Speech' | 'Research' | 'Publication';
export interface AgencyFeed { id: string; agency: string; type: PubType; url: string }
export const AGENCY_FEEDS: AgencyFeed[] = [
  { id: 'bis-press', agency: 'BIS', type: 'Press', url: 'https://www.bis.org/doclist/all_pressrels.rss' },
  { id: 'bis-speeches', agency: 'BIS', type: 'Speech', url: 'https://www.bis.org/doclist/cbspeeches.rss' },
  { id: 'bis-research', agency: 'BIS', type: 'Research', url: 'https://www.bis.org/doclist/bis_fsi_publs.rss' },
  { id: 'ecb-press', agency: 'ECB', type: 'Press', url: 'https://www.ecb.europa.eu/rss/press.html' },
  { id: 'ecb-pubs', agency: 'ECB', type: 'Publication', url: 'https://www.ecb.europa.eu/rss/pub.html' },
  { id: 'boe-pubs', agency: 'Bank of England', type: 'Publication', url: 'https://www.bankofengland.co.uk/rss/publications' },
  { id: 'boe-news', agency: 'Bank of England', type: 'Press', url: 'https://www.bankofengland.co.uk/rss/news' },
  { id: 'fed-press', agency: 'Federal Reserve', type: 'Press', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { id: 'fed-speeches', agency: 'Federal Reserve', type: 'Speech', url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
  { id: 'fed-notes', agency: 'Federal Reserve', type: 'Research', url: 'https://www.federalreserve.gov/feeds/feds_notes.xml' },
  { id: 'nyfed-lse', agency: 'New York Fed', type: 'Research', url: 'https://libertystreeteconomics.newyorkfed.org/feed/' },
  { id: 'fsb', agency: 'FSB', type: 'Publication', url: 'https://www.fsb.org/feed/' },
  { id: 'occ', agency: 'OCC', type: 'Press', url: 'https://www.occ.gov/rss/occ_news.xml' },
  { id: 'cfpb', agency: 'CFPB', type: 'Press', url: 'https://www.consumerfinance.gov/about-us/newsroom/feed/' },
  { id: 'esma', agency: 'ESMA', type: 'Press', url: 'https://www.esma.europa.eu/rss.xml' },
  { id: 'eba', agency: 'EBA', type: 'Press', url: 'https://www.eba.europa.eu/rss.xml' },
  { id: 'boj', agency: 'Bank of Japan', type: 'Press', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml' },
  { id: 'boc', agency: 'Bank of Canada', type: 'Press', url: 'https://www.bankofcanada.ca/content_type/press-releases/feed/' },
];
export const NOT_AVAILABLE = ['IMF', 'US Treasury', 'OECD', 'World Bank', 'FDIC press releases'];

/** Hosts the Summarize button may read (the agencies' own sites only). */
export const ALLOWED_HOSTS = ['bis.org', 'ecb.europa.eu', 'bankofengland.co.uk', 'federalreserve.gov', 'newyorkfed.org', 'fsb.org', 'occ.gov', 'occ.treas.gov', 'consumerfinance.gov', 'esma.europa.eu', 'eba.europa.eu', 'boj.or.jp', 'bankofcanada.ca'];
export function allowedUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'https:' && ALLOWED_HOSTS.some((h) => x.hostname === h || x.hostname.endsWith(`.${h}`)); } catch { return false; }
}

export interface Pub { title: string; url: string; t: number; agencies: string[]; type: PubType; feed: string }
const normTitle = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Merge feeds newest first; the same release from several agencies (joint statements) becomes one item. */
export function mergePubs(lists: Pub[][], sinceMs: number, max = 400): Pub[] {
  const byKey = new Map<string, Pub>();
  for (const p of lists.flat()) {
    if (!p.title || !p.url || !(p.t >= sinceMs)) continue;
    const k = normTitle(p.title);
    const old = byKey.get(k);
    if (old && Math.abs(old.t - p.t) < 3 * 86400000) { for (const a of p.agencies) if (!old.agencies.includes(a)) old.agencies.push(a); continue; }
    byKey.set(k, { ...p, agencies: [...p.agencies] });
  }
  return [...byKey.values()].sort((a, b) => b.t - a.t).slice(0, max);
}

/** Your keywords found in a title (whole words, any case). */
export function keywordHits(title: string, keywords: string[]): string[] {
  return keywords.map((k) => k.trim()).filter((k) => k.length >= 2 && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(title));
}

export const SUM_SCHEMA = { type: 'object', properties: { points: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, quote: { type: 'string' } }, required: ['text', 'quote'] } } }, required: ['points'] };
export const sumPrompt = (agency: string, title: string, text: string) => `Summarize this ${agency} publication for an investor in 3 to 5 plain-English points: what it says, any decision, number or date, and who it affects (banks, markets, borrowers). Use ONLY the text below. No opinions, no advice.
Each point: "text" (one short sentence) and "quote": the sentence it comes from, copied EXACTLY, word for word, from the text.
TITLE: ${title}
TEXT:
${text}`;
/** Keep points whose quotes are really in the publication. */
export function checkPoints(raw: any, text: string): { points: { text: string; quote: string }[]; dropped: number } {
  const pts: { text: string; quote: string }[] = []; let dropped = 0;
  for (const p of Array.isArray(raw?.points) ? raw.points : []) {
    const t = String(p?.text ?? '').trim(), q = String(p?.quote ?? '').trim();
    if (!t) continue;
    if (quoteFound(q, text)) pts.push({ text: t.slice(0, 300), quote: q.slice(0, 500) }); else dropped++;
  }
  return { points: pts.slice(0, 6), dropped };
}
