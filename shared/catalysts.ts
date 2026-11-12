// Catalysts for the Messages feed: 8-K events other than earnings, activist / passive stakes (Schedule 13D / 13G),
// insider buys and sells (Form 4), and press releases from the newswires that name a US-listed ticker.
// Also: keyword alerts and the "next macro release" countdown list. Pure functions (tested); fetching lives in /api.
import type { FeedItem } from './feed.js';

/** 8-K items worth a message (2.02 earnings has its own message; exhibits, votes and bylaw changes are left out). */
export const ITEM_8K: Record<string, { label: string; tone?: 'up' | 'down' }> = {
  '1.01': { label: 'signed a material agreement' },
  '1.02': { label: 'ended a material agreement', tone: 'down' },
  '1.03': { label: 'filed for bankruptcy or receivership', tone: 'down' },
  '2.01': { label: 'completed an acquisition or sale of assets' },
  '2.03': { label: 'took on new debt' },
  '2.04': { label: 'had a debt or lease obligation accelerated', tone: 'down' },
  '2.05': { label: 'announced restructuring or layoff costs', tone: 'down' },
  '2.06': { label: 'took an impairment charge', tone: 'down' },
  '3.01': { label: 'got a listing-rule notice or plans to delist', tone: 'down' },
  '3.02': { label: 'sold unregistered shares (possible dilution)', tone: 'down' },
  '4.01': { label: 'changed auditor' },
  '4.02': { label: 'said past financials can no longer be relied on', tone: 'down' },
  '5.01': { label: 'had a change in control' },
  '5.02': { label: 'had an executive or director change' },
  '7.01': { label: 'released information to investors (Reg FD)' },
  '8.01': { label: 'reported another material event' },
};
/** Items listed in order of how much they usually matter, so the headline names the biggest one. */
const RANK = ['1.03', '4.02', '5.01', '3.01', '2.04', '2.01', '2.05', '2.06', '1.01', '1.02', '3.02', '5.02', '4.01', '2.03', '8.01', '7.01'];

export function catalyst8k(f: { cik: number; company: string; t: number; url: string; items: string[] }, sym: string): FeedItem | null {
  const hits = RANK.filter((i) => f.items.includes(i));
  if (!hits.length) return null;
  const top = ITEM_8K[hits[0]];
  const rest = hits.slice(1).map((i) => ITEM_8K[i].label);
  return {
    id: `8kc:${f.cik}:${f.t}`, t: f.t, kind: 'catalyst', sym, tone: hits.map((i) => ITEM_8K[i].tone).find(Boolean),
    title: `${sym} ${top.label}`,
    text: `8-K item ${hits.join(', ')} · ${f.company}${rest.length ? `. Also: ${rest.join('; ')}` : ''}. Read the filing for details. (SEC EDGAR)`,
    url: f.url,
  };
}

export interface EdgarEntry { form: string; name: string; cik: number; role: string; acc: string; t: number; url: string }
/** EDGAR "getcurrent" Atom feed for any form -> one entry per (filing, party). Each filing is listed once per party
 *  (Subject + Filed by for 13D/G; Issuer + Reporting for Form 4), so callers pair them by accession number. */
export function parseEdgarCurrent(xml: string): EdgarEntry[] {
  const out: EdgarEntry[] = [];
  for (const b of xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(b)?.[1] ?? '').replace(/&amp;/g, '&');
    const m = /^\s*(.+?)\s+-\s+(.+?)\s+\((\d{4,10})\)\s*\(([^)]+)\)\s*$/.exec(title);
    if (!m) continue;
    const url = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? '';
    const acc = /(\d{10}-\d{2}-\d{6})/.exec(url)?.[1] ?? /accession-number=(\d{10}-\d{2}-\d{6})/.exec(b)?.[1] ?? '';
    const t = Date.parse(/<updated>([^<]+)<\/updated>/i.exec(b)?.[1] ?? '');
    if (acc && Number.isFinite(t)) out.push({ form: m[1].trim(), name: m[2].trim(), cik: Number(m[3]), role: m[4].trim(), acc, t, url });
  }
  return out;
}

/** Pair the two sides of each filing: { subject / issuer, filer / reporting owner }. */
export function pairFilings(entries: EdgarEntry[]): { form: string; acc: string; t: number; url: string; subject: EdgarEntry; filer: EdgarEntry | null }[] {
  const by = new Map<string, EdgarEntry[]>();
  for (const e of entries) by.set(e.acc, [...(by.get(e.acc) ?? []), e]);
  const out: { form: string; acc: string; t: number; url: string; subject: EdgarEntry; filer: EdgarEntry | null }[] = [];
  for (const [acc, es] of by) {
    const subject = es.find((e) => /subject|issuer/i.test(e.role));
    if (!subject) continue;
    const filer = es.find((e) => /filed by|reporting/i.test(e.role)) ?? null;
    out.push({ form: subject.form, acc, t: subject.t, url: subject.url, subject, filer });
  }
  return out;
}

const titleCase = (s: string) => (/[a-z]/.test(s) ? s : s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()));
/** Schedule 13D (5%+ stake with intent to influence) / 13G (5%+ passive) -> a message. /A = an amendment. */
export function stakeMessage(p: ReturnType<typeof pairFilings>[number], sym: string): FeedItem {
  const active = /13D/i.test(p.form), amend = /\/A\b/.test(p.form);
  const who = p.filer ? titleCase(p.filer.name) : 'An investor';
  return {
    id: `stake:${p.acc}`, t: p.t, kind: 'stake', sym,
    title: `${who} ${amend ? 'updated' : 'filed'} a ${active ? '13D (active 5%+ stake)' : '13G (passive 5%+ stake)'} on ${sym}`,
    text: active ? '13D filers may push for changes (board seats, a sale, buybacks). An amendment often means the stake changed.' : '13G filers say they are passive holders. Mostly funds and index managers.',
    url: p.url,
  };
}

/** Form 4 transactions -> one message per filing: open-market buys (P) and sells (S) only; awards, tax withholding and option exercises are left out. */
export function insiderMessage(txs: { code: string; who: string; role: string; shares: number; price: number | null; value: number | null }[], sym: string, acc: string, t: number, url: string): FeedItem | null {
  const buys = txs.filter((x) => x.code === 'P'), sells = txs.filter((x) => x.code === 'S');
  if (!buys.length && !sells.length) return null;
  const sum = (a: typeof txs) => a.reduce((s, x) => s + (x.value ?? (x.price != null ? x.price * x.shares : 0)), 0);
  const b = sum(buys), s = sum(sells), buy = buys.length > 0 && (b >= s || !sells.length);
  const shares = (a: typeof txs) => a.reduce((n, x) => n + x.shares, 0);
  // no price on the form (rare): say how many shares instead of "$0"
  const size = (a: typeof txs, v: number) => (v > 0 ? amt(v) : `${Math.round(shares(a)).toLocaleString('en-US')} shares`);
  const who = titleCase(txs[0].who), role = txs[0].role ? ` (${txs[0].role})` : '';
  function amt(v: number) { return v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`; }
  return {
    id: `f4:${acc}`, t, kind: 'insider', sym, tone: buy ? 'up' : 'down',
    title: `${who}${role} ${buy ? 'bought' : 'sold'} ${buy ? size(buys, b) : size(sells, s)} of ${sym}`,
    text: `${buy ? 'Open-market buy' : 'Open-market sale'}${buys.length && sells.length ? ` (also ${buy ? 'sold' : 'bought'} ${buy ? size(sells, s) : size(buys, b)})` : ''}. Sales are often planned (10b5-1); buys with personal money are rarer. (SEC Form 4)`,
    url,
  };
}

/* ---------------- newswires ---------------- */
const EXCH = /\((?:NYSE(?:\s+American)?|NASDAQ|Nasdaq|NasdaqGS|NasdaqGM|NasdaqCM|Cboe(?:\s+BZX)?|NYSE\s+Arca)\s*:\s*([A-Z][A-Z.]{0,5})\b/g;
/** Tickers a press release names in the "(NYSE: ABC)" / "(Nasdaq: ABC)" form. */
export function wireTickers(text: string): string[] {
  return [...new Set([...text.matchAll(EXCH)].map((m) => m[1].replace(/\.$/, '')))];
}
/** English only: Business Wire's feed mixes in Spanish, Arabic, Japanese… translations of the same release. */
export const looksEnglish = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (!letters.length) return false;
  const ascii = letters.replace(/[^A-Za-z]/g, '').length;
  return ascii / letters.length > 0.97 && !/\b(el|la|los|las|der|die|und|des|les|est|une|para|com|dos)\b/i.test(s);
};
/** Class-action law-firm solicitations ("investigation… investors are encouraged to contact…") flood the wires; they are not company news. */
const LAWFIRM = /\b(class action|securities (fraud )?(investigation|litigation|lawsuit)|investors (are encouraged|who (lost|purchased))|shareholder (alert|rights)|lead plaintiff|Rosen Law|Pomerantz|Kessler Topaz|Levi & Korsinsky|Bragar|Faruqi|Glancy|Bronstein|Schall Law|Robbins (Geller|LLP)|Kahn Swick|Halper Sadeh|Johnson Fistel|Portnoy Law|Gross Law|Bernstein Liebhard)\b/i;
export function wireMessages(items: { title: string; url: string; t: number; summary?: string }[], src: string): FeedItem[] {
  const out: FeedItem[] = [];
  for (const x of items) {
    const body = `${x.title} ${x.summary ?? ''}`;
    if (!looksEnglish(x.title) || LAWFIRM.test(body)) continue;
    const syms = wireTickers(body);
    if (!syms.length) continue; // only releases from US-listed companies
    out.push({ id: `wire:${x.url || x.title}`, t: x.t, kind: 'wire', sym: syms[0], title: x.title, text: `${src}${syms.length > 1 ? ` · also ${syms.slice(1).join(', ')}` : ''}`, url: x.url });
  }
  return out;
}

/* ---------------- keyword alerts ---------------- */
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Which of your alert words a message contains. Whole words, any case; "$NVDA" or an all-caps word also matches the ticker. */
export function keywordHits(m: Pick<FeedItem, 'title' | 'text' | 'sym'>, words: string[]): string[] {
  const hay = `${m.title} ${m.text ?? ''}`;
  const hits: string[] = [];
  for (const raw of words) {
    const w = raw.trim();
    if (!w) continue;
    const tick = w.replace(/^\$/, '');
    if ((w.startsWith('$') || /^[A-Z.]{1,6}$/.test(w)) && m.sym === tick.toUpperCase()) { hits.push(w); continue; }
    if (w.startsWith('$')) continue; // "$XYZ" means the ticker only
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc(tick)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(hay)) hits.push(w);
  }
  return hits;
}

/* ---------------- macro countdowns ---------------- */
export interface MacroNext { key: string; label: string; at: number; impact: 1 | 2 | 3; note: string; tentative?: boolean }
/** The next release of each headline number (CPI, jobs, PCE, PPI, GDP, retail sales, claims) plus the next Fed decision. */
export function nextMacro(econ: { key: string; label: string; date: string; time: string; impact: 1 | 2 | 3; note: string }[], fomc: { date: string; sep: boolean; tentative?: boolean }[],
  nowMs: number, etToUtc: (y: number, mo: number, d: number, h: number, mi: number) => number, keys = ['cpi', 'nfp', 'pce', 'ppi', 'gdp', 'retail', 'claims']): MacroNext[] {
  const at = (date: string, time: string) => { const [h, mi] = time.split(':').map(Number); return etToUtc(+date.slice(0, 4), +date.slice(5, 7), +date.slice(8, 10), h || 8, mi || 0); };
  const out: MacroNext[] = [];
  for (const k of keys) {
    // still "next" until 30 minutes after the release, so the countdown reads "out now" for a bit
    const e = econ.filter((x) => x.key === k).map((x) => ({ ...x, at: at(x.date, x.time) })).filter((x) => x.at > nowMs - 30 * 60_000).sort((a, b) => a.at - b.at)[0];
    if (e) out.push({ key: k, label: e.label, at: e.at, impact: e.impact, note: e.note });
  }
  const f = fomc.map((x) => ({ ...x, at: at(x.date, '14:00') })).filter((x) => x.at > nowMs - 30 * 60_000).sort((a, b) => a.at - b.at)[0];
  if (f) out.push({ key: 'fomc', label: `Fed decision${f.sep ? ' + dot plot' : ''}`, at: f.at, impact: 3, note: 'Statement at 2:00 PM ET, press conference at 2:30.', tentative: f.tentative });
  return out.sort((a, b) => a.at - b.at);
}
