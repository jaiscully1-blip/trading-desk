// USPTO Open Data Portal (data.uspto.gov) patent search, used for "patents granted per year" on the Company page.
// Request shape from the ODP Patent File Wrapper search API: POST /api/v1/patent/applications/search with an X-API-KEY
// header; the response carries `count`. (unverified until a key is added: check the numbers against the ODP website.)

export const ODP_SEARCH = 'https://api.uspto.gov/api/v1/patent/applications/search';

/** Company name as patent applicants usually write it: drop share classes and legal suffixes. */
export function applicantName(name: string): string {
  let s = name.replace(/\s+class\s+[a-c]\b.*$/i, '').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/,?\s+(inc|corp|corporation|co|company|ltd|limited|plc|holdings?|group|n\.?v|s\.?a|ag|se|pte|llc|ulc)\.?$/i, '').trim();
  return s;
}

/** Search body: utility patents granted in `year` whose first applicant matches the company. Only the count is needed. */
export function grantedQuery(org: string, year: number) {
  return {
    q: `applicationMetaData.firstApplicantName:"${org.replace(/["\\]/g, '')}"`,
    filters: [{ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }],
    rangeFilters: [{ field: 'applicationMetaData.grantDate', valueFrom: `${year}-01-01`, valueTo: `${year}-12-31` }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText'],
  };
}

export const countOf = (j: any): number => Number(j?.count ?? j?.totalCount ?? 0) || 0;

// ---------------------------------------------------------------------------------------------------------------------
// Patents section (Company page). Field paths are from the ODP patent-data JSON schema (checked 2026-11-25):
// applicationMetaData.{firstApplicantName, applicantBag.applicantNameText, filingDate, grantDate, earliestPublicationDate,
// inventionTitle, patentNumber, applicationStatusDescriptionText, cpcClassificationBag}, assignmentBag.assigneeBag.assigneeNameText.

const GENERIC = new Set(['advanced', 'american', 'general', 'united', 'international', 'first', 'national', 'global', 'the', 'new', 'applied', 'digital', 'micro', 'energy', 'health', 'bank', 'financial']);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The word a subsidiary must contain to count as the same company ("Moderna" for ModernaTX), or the whole name when
 *  the first word is too common to be safe ("Advanced Micro Devices"). */
export function coreToken(name: string): string {
  const base = applicantName(name);
  const first = base.split(/\s+/)[0] ?? '';
  return first.length >= 4 && !GENERIC.has(first.toLowerCase()) ? first : base;
}

/** Entity-looking lines from an Exhibit 21 (list of subsidiaries). */
export function exhibit21Names(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\n|\s{3,}|\t/)) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (l.length < 4 || l.length > 90) continue;
    // table rows flatten to "ModernaTX, Inc. Delaware": keep the name up to its last legal suffix, drop the jurisdiction
    const m = /^(.*\b(?:inc|llc|l\.l\.c|ltd|limited|corp|corporation|company|gmbh|ag|b\.v|n\.v|s\.a|s\.a\.s|s\.l|s\.r\.l|plc|pty|k\.k|oy|ab|lp|l\.p|ulc)(?:\.|\b))/i.exec(l);
    if (m) out.push(m[1].replace(/[\s,]+$/, ''));
  }
  return [...new Set(out)];
}

/** Patent owners that the 10-K subsidiary list does not link by name (renamed or acquired companies that still hold the
 *  patents). Short, hand-checked, and always shown on the page as "searched as". */
export const PATENT_ALIASES: Record<string, string[]> = {
  AVGO: ['Avago Technologies'], GOOGL: ['Google'], GOOG: ['Google'], META: ['Facebook', 'Meta Platforms Technologies'],
  JNJ: ['Janssen'], NVDA: ['Mellanox Technologies'], MSFT: ['Microsoft Technology Licensing'], IBM: ['International Business Machines'],
};

/** Exhibit 21 link from a filing index page: the row whose document type is EX-21 (file names vary, e.g. NVIDIA's
 *  "subsidiariesofregistrantfy.htm"). */
export function ex21FromIndex(html: string): string | null {
  const m = /<td[^>]*>\s*EX-21[^<]*<\/td>\s*<td[^>]*>\s*<a href="([^"]+)"/i.exec(html);
  return m ? m[1] : null;
}

/** Names to search: the company itself, known aliases, then subsidiaries that carry its core name (max 6, shortest first). */
export function aliasNames(name: string, subsidiaries: string[] = [], extra: string[] = []): string[] {
  const base = applicantName(name);
  const core = norm(coreToken(name));
  const subs = subsidiaries.map(applicantName).filter((s) => s.length >= 3 && core.length >= 3 && norm(s).includes(core));
  const seen = new Set<string>(), out: string[] = [];
  for (const s of [base, ...extra, ...subs.sort((a, b) => a.length - b.length)]) { const k = norm(s); if (!seen.has(k)) { seen.add(k); out.push(s); } }
  return out.slice(0, 6);
}

const quote = (s: string) => `"${s.replace(/["\\]/g, '')}"`;
/** One query string matching any of the names as applicant or assignee. */
export function ownerQ(names: string[]): string {
  return names.flatMap((n) => [`applicationMetaData.applicantBag.applicantNameText:${quote(n)}`, `assignmentBag.assigneeBag.assigneeNameText:${quote(n)}`]).join(' OR ');
}
/** Simpler form (first applicant, base name only) used if the server rejects the OR query. */
export const simpleQ = (names: string[]) => `applicationMetaData.firstApplicantName:${quote(names[0] ?? '')}`;

export type CountKind = 'filed' | 'granted';
export function countBody(q: string, kind: CountKind, from: string, to: string) {
  return {
    q,
    filters: [{ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }],
    rangeFilters: [{ field: kind === 'filed' ? 'applicationMetaData.filingDate' : 'applicationMetaData.grantDate', valueFrom: from, valueTo: to }],
    pagination: { offset: 0, limit: 1 },
    fields: ['applicationNumberText'],
  };
}
export function latestBody(q: string, limit = 25) {
  return {
    q,
    filters: [{ name: 'applicationMetaData.applicationTypeLabelName', value: ['Utility'] }],
    pagination: { offset: 0, limit },
    sort: [{ field: 'applicationMetaData.filingDate', order: 'Desc' }],
    fields: ['applicationNumberText', 'applicationMetaData'],
  };
}

export interface Quarter { label: string; from: string; to: string; done: boolean }
/** The last n calendar quarters, oldest first; `done` = the quarter has ended. */
export function lastQuarters(now: Date, n = 20): Quarter[] {
  const out: Quarter[] = [];
  let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3);
  for (let i = 0; i < n; i++) {
    const m0 = q * 3, end = new Date(Date.UTC(y, m0 + 3, 0));
    const pad = (v: number) => String(v).padStart(2, '0');
    out.unshift({ label: `${y} Q${q + 1}`, from: `${y}-${pad(m0 + 1)}-01`, to: `${y}-${pad(m0 + 3)}-${pad(end.getUTCDate())}`, done: end.getTime() < now.getTime() });
    q -= 1; if (q < 0) { q = 3; y -= 1; }
  }
  return out;
}

export type PatentStatus = 'granted' | 'pending' | 'abandoned' | 'expired' | 'other';
export function statusKind(text: string): PatentStatus {
  const t = text.toLowerCase();
  if (/expired/.test(t)) return 'expired';
  if (/abandon/.test(t)) return 'abandoned';
  if (/patented|issued|granted/.test(t)) return 'granted';
  if (t) return 'pending';
  return 'other';
}

/** Broad CPC sections, plus named themes for the classes people ask about. */
const SECTION: Record<string, string> = { A: 'Health, food, everyday life', B: 'Manufacturing and transport', C: 'Chemistry and materials', D: 'Textiles and paper', E: 'Construction and mining', F: 'Mechanical, engines, heating', G: 'Computing, physics, measuring', H: 'Electricity and electronics', Y: 'Emerging tech (cross-sector)' };
const THEMES: [RegExp, string][] = [
  [/^G06N/, 'AI and machine learning'], [/^(H01L|H10)/, 'Semiconductors'], [/^G06F/, 'Computing'], [/^H04/, 'Telecom and networks'],
  [/^H01M/, 'Batteries'], [/^B60L/, 'Electric vehicles'], [/^(H02J|H02S|Y02E)/, 'Power and clean energy'], [/^G21/, 'Nuclear'],
  [/^(A61K|A61P)/, 'Drugs'], [/^C12N/, 'Biotech, genes, mRNA'], [/^C07K/, 'Antibodies and proteins'], [/^A61B/, 'Medical devices and diagnostics'],
  [/^B25J/, 'Robotics'], [/^(B60W|G05D)/, 'Autonomy and self-driving'], [/^(B64G)/, 'Space'], [/^B64(C|D|U)/, 'Aircraft and drones'], [/^G06Q/, 'Business and fintech'],
];
export function cpcArea(code: string): string {
  const c = code.replace(/\s+/g, '').toUpperCase();
  for (const [re, label] of THEMES) if (re.test(c)) return label;
  return SECTION[c[0] ?? ''] ?? 'Other';
}

export interface PatentRow { app: string; title: string; filed: string | null; published: string | null; granted: string | null; patentNo: string | null; status: string; kind: PatentStatus; areas: string[] }
export function parseRows(j: any): PatentRow[] {
  return (j?.patentFileWrapperDataBag ?? []).map((r: any) => {
    const m = r?.applicationMetaData ?? {};
    const status = String(m.applicationStatusDescriptionText ?? '');
    const cpc: string[] = Array.isArray(m.cpcClassificationBag) ? m.cpcClassificationBag.map(String) : [];
    return {
      app: String(r?.applicationNumberText ?? ''), title: String(m.inventionTitle ?? '').replace(/\s+/g, ' ').trim(),
      filed: m.filingDate ?? null, published: m.earliestPublicationDate ?? null, granted: m.grantDate ?? null, patentNo: m.patentNumber ? String(m.patentNumber) : null,
      status, kind: statusKind(status), areas: [...new Set(cpc.map(cpcArea))].slice(0, 3),
    };
  }).filter((r: PatentRow) => r.app);
}

/** Tech areas across rows, most common first; `isNew` = seen this year but in none of the older rows. */
export function techMix(rows: PatentRow[], year: number): { area: string; n: number; isNew: boolean }[] {
  const n = new Map<string, number>(), recent = new Set<string>(), older = new Set<string>();
  for (const r of rows) for (const a of r.areas) { n.set(a, (n.get(a) ?? 0) + 1); ((r.filed ?? '').startsWith(String(year)) ? recent : older).add(a); }
  return [...n].map(([area, c]) => ({ area, n: c, isNew: recent.has(area) && !older.has(area) && older.size > 0 })).sort((a, b) => b.n - a.n);
}

/** Granted in the last 4 finished quarters vs the 4 before: % change and a plain word. Null when there is too little data. */
export function grantTrend(qs: { done: boolean; granted: number | null }[]): { last: number; prior: number; pct: number; word: string } | null {
  const done = qs.filter((q) => q.done && q.granted != null);
  if (done.length < 8) return null;
  const last = done.slice(-4).reduce((s, q) => s + q.granted!, 0), prior = done.slice(-8, -4).reduce((s, q) => s + q.granted!, 0);
  if (prior === 0) return null;
  const pct = ((last - prior) / prior) * 100;
  return { last, prior, pct, word: pct >= 15 ? 'speeding up' : pct <= -15 ? 'slowing down' : 'steady' };
}
