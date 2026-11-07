// Company page: turn a 10-K into the parts an AI reads (business, MD&A, customer/supplier sentences),
// and clean the AI's answer into a supply-chain graph with verified tickers. Pure functions (tested).

export interface ChainLink { name: string; sym?: string; what?: string; share?: string }
export interface Product { name: string; share?: string; note?: string }
export interface CompanyFacts {
  summary: string;
  products: Product[];
  suppliers: ChainLink[];
  customers: ChainLink[];
  competitors: ChainLink[];
  fiscalYear?: string;
}
export interface SecTicker { cik: number; ticker: string; title: string }

/* ---------------- 10-K text ---------------- */

const ENT: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', '#160': ' ', '#8217': '’', '#8220': '“', '#8221': '”', '#8212': '—', '#8211': '–', '#39': "'" };

/** Filing HTML (inline XBRL) -> plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, ' ')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h\d|table)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e) => ENT[e.toLowerCase()] ?? (e.startsWith('#') ? String.fromCharCode(parseInt(e.startsWith('#x') ? e.slice(2) : e.slice(1), e.startsWith('#x') ? 16 : 10)) : m))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** Find a 10-K item's body: the LAST heading match that is followed by real text (the first matches are the table of contents). */
function section(text: string, start: RegExp, end: RegExp, max: number): string {
  const starts = [...text.matchAll(new RegExp(start.source, 'gi'))].map((m) => m.index!);
  for (let k = starts.length - 1; k >= 0; k--) {
    const s = starts[k];
    const rest = text.slice(s + 10);
    const e = rest.search(new RegExp(end.source, 'i'));
    if (e < 0) continue; // no closing heading after it: a table-of-contents line or a cross-reference
    const body = text.slice(s, s + 10 + e);
    if (body.length > 1500) return body.slice(0, max);
  }
  return '';
}

/** The parts of a 10-K worth reading for products, customers and suppliers, capped to keep the AI call small. */
export function tenKExcerpt(text: string, budget = 120_000): string {
  const item1 = section(text, /item\s*1\.?\s*business\b/, /item\s*1a\.?\s*risk\s*factors/, 70_000);
  const item7 = section(text, /item\s*7\.?\s*management'?’?s\s*discussion/, /item\s*7a\.?/, 30_000);
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => /\b(customer|supplier|vendor|foundr|contract manufactur|sole source|single source)|% of (our )?(total )?(net )?revenue|accounted for/i.test(s) && s.length < 600);
  const extra = [...new Set(sentences)].slice(0, 120).join(' ');
  const parts = [item1 && `== ITEM 1. BUSINESS ==\n${item1}`, item7 && `== ITEM 7. MD&A (start) ==\n${item7}`, extra && `== SENTENCES MENTIONING CUSTOMERS / SUPPLIERS ==\n${extra}`].filter(Boolean).join('\n\n');
  return (parts || text.slice(0, budget)).slice(0, budget);
}

export function geminiPrompt(company: string, sym: string, excerpt: string): string {
  return `You are reading excerpts of ${company} (${sym})'s latest 10-K annual report. Extract ONLY facts stated in the text. Do not use outside knowledge.
Return JSON with:
- summary: 2-3 plain-English sentences on what the company does and how it makes money.
- products: up to 8 main products, services or segments, biggest first; "share" = revenue share or amount if the text states it, else omit.
- suppliers: companies the text names as suppliers, manufacturers, foundries, licensors or key vendors; "what" = what they supply.
- customers: companies the text names as customers or distributors; "share" = % of revenue if stated. If the report only says "Customer A", use that label.
- competitors: companies the text names as competitors.
- fiscalYear: the fiscal year the report covers.
Use exact company names from the text. Leave a list empty rather than guessing.

${excerpt}`;
}

export const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    fiscalYear: { type: 'STRING' },
    products: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, share: { type: 'STRING' }, note: { type: 'STRING' } }, required: ['name'] } },
    suppliers: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, what: { type: 'STRING' } }, required: ['name'] } },
    customers: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' }, what: { type: 'STRING' }, share: { type: 'STRING' } }, required: ['name'] } },
    competitors: { type: 'ARRAY', items: { type: 'OBJECT', properties: { name: { type: 'STRING' } }, required: ['name'] } },
  },
  required: ['summary', 'products', 'suppliers', 'customers', 'competitors'],
};

/* ---------------- names -> tickers ---------------- */

const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|llc|lp|sa|ag|nv|se|holdings?|group|the|class [a-c]|com|new|de|del|n\.?v|s\.?a)\b\.?/g;
export function normName(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[.,'’()/-]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
}

/** Map a company name from the filing to a US-listed ticker using SEC's own ticker list. Exact (normalized) match, then a unique prefix match. */
export function matchTicker(name: string, list: SecTicker[], index?: Map<string, SecTicker>): string | undefined {
  const n = normName(name);
  if (n.length < 3 || /^customer [a-z]$/.test(n)) return undefined;
  const idx = index ?? nameIndex(list);
  const hit = idx.get(n);
  if (hit) return hit.ticker;
  const pre = list.filter((t) => { const tn = normName(t.title); return tn.startsWith(n + ' ') || n.startsWith(tn + ' '); });
  const ciks = new Set(pre.map((t) => t.cik));
  return ciks.size === 1 ? pre[0].ticker : undefined;
}

/** Clean an AI answer: trim, dedupe, cap list sizes, drop the company itself, attach verified tickers. */
/** First ticker per normalized name wins (SEC lists the main share class first, e.g. GOOGL before GOOG). */
export function nameIndex(list: SecTicker[]): Map<string, SecTicker> {
  const m = new Map<string, SecTicker>();
  for (const t of list) { const k = normName(t.title); if (!m.has(k)) m.set(k, t); }
  return m;
}

export function cleanFacts(raw: any, self: string, list: SecTicker[]): CompanyFacts {
  const index = nameIndex(list);
  const s = (v: unknown, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined) || undefined;
  const links = (arr: unknown, max: number): ChainLink[] => {
    const seen = new Set<string>();
    const out: ChainLink[] = [];
    for (const x of Array.isArray(arr) ? arr : []) {
      const name = s(x?.name, 80);
      if (!name) continue;
      const k = normName(name);
      if (seen.has(k)) continue;
      seen.add(k);
      const sym = matchTicker(name, list, index);
      if (sym === self) continue;
      out.push({ name, sym, what: s(x?.what), share: s(x?.share, 40) });
      if (out.length >= max) break;
    }
    return out;
  };
  return {
    summary: s(raw?.summary, 900) ?? '',
    fiscalYear: s(raw?.fiscalYear, 30),
    products: (Array.isArray(raw?.products) ? raw.products : []).map((p: any) => ({ name: s(p?.name, 80)!, share: s(p?.share, 40), note: s(p?.note) })).filter((p: Product) => p.name).slice(0, 8),
    suppliers: links(raw?.suppliers, 12),
    customers: links(raw?.customers, 12),
    competitors: links(raw?.competitors, 12),
  };
}

/** SEC company_tickers.json -> list (one row per ticker). */
export function parseSecTickers(j: any): SecTicker[] {
  return Object.values(j ?? {}).map((r: any) => ({ cik: Number(r.cik_str), ticker: String(r.ticker), title: String(r.title) })).filter((r) => r.cik && r.ticker);
}

/** submissions JSON -> newest annual report (10-K, or 20-F / 40-F for foreign filers). */
export function latestAnnual(j: any, cik: number): { form: string; date: string; url: string } | null {
  const r = j?.filings?.recent;
  if (!r?.form) return null;
  for (let i = 0; i < r.form.length; i++) {
    if (!['10-K', '20-F', '40-F'].includes(r.form[i])) continue;
    const acc = String(r.accessionNumber[i]).replace(/-/g, '');
    return { form: r.form[i], date: r.filingDate[i], url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${r.primaryDocument[i]}` };
  }
  return null;
}
