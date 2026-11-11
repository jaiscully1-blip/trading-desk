// Layoffs and hiring, from free public sources:
//  - State WARN Act notices (employers must file before laying off 50+ people at one site), consolidated across ~45 states by
//    Big Local News (Stanford) in github.com/biglocalnews/warn-github-flow (code Apache-2.0; the notices are public records).
//  - Open jobs on companies' own public job boards: Greenhouse, Lever and Ashby have keyless JSON APIs. Open jobs are adverts, not hires.
// Pure functions: parsing, matching employers to tickers, and the history maths. Fetching lives in scripts/distress-build.ts.

export const WARN_CSV = 'https://raw.githubusercontent.com/biglocalnews/warn-github-flow/transformer/data/warn-transformer/processed/consolidated.csv';
export const WARN_SRC = 'State WARN notices, consolidated by Big Local News (Stanford)';
export const WARN_LINK = 'https://github.com/biglocalnews/warn-github-flow';

export interface WarnNotice { company: string; state: string; location: string; date: string; jobs: number | null; closure: boolean }
export interface WarnAgg { notices: number; jobs: number; states: string[]; closure: boolean; latest: string; names: string[] }
export interface StateLayoffs { notices: number; jobs: number }

/** Minimal CSV parser (quoted fields, doubled quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0]) out.push(row); row = []; }
    else f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

/** Consolidated WARN CSV -> notices from the last `days` days. Dates more than a week in the future are data-entry slips and are dropped. */
export function parseWarn(text: string, today: string, days = 120): WarnNotice[] {
  const rows = parseCsv(text);
  const h = rows[0]?.map((x) => x.trim()) ?? [];
  const ix = (k: string) => h.indexOf(k);
  const [iCo, iSt, iLoc, iNd, iEd, iJobs, iClo, iAm] = ['company', 'postal_code', 'location', 'notice_date', 'effective_date', 'jobs', 'is_closure', 'is_amendment'].map(ix);
  if (iCo < 0 || iSt < 0 || iNd < 0) return [];
  const t = Date.parse(`${today}T00:00:00Z`), lo = t - days * 86400_000, hi = t + 7 * 86400_000;
  const out: WarnNotice[] = [];
  for (const r of rows.slice(1)) {
    const d = (r[iNd] || r[iEd] || '').slice(0, 10), ms = Date.parse(`${d}T00:00:00Z`);
    if (!Number.isFinite(ms) || ms < lo || ms > hi) continue;
    if (iAm >= 0 && /^true$/i.test(r[iAm] ?? '')) continue; // amendments repeat an earlier notice
    const j = parseInt(String(r[iJobs] ?? '').replace(/[^\d]/g, ''), 10);
    out.push({ company: (r[iCo] ?? '').trim(), state: (r[iSt] ?? '').trim().toUpperCase(), location: (r[iLoc] ?? '').trim(), date: d, jobs: Number.isFinite(j) && j > 0 && j < 200000 ? j : null, closure: /^true$/i.test(r[iClo] ?? '') });
  }
  return out;
}

const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|llc|l\.l\.c|lp|l\.p|ltd|limited|plc|holdings?|group|the|n\.?a|usa|na|sa|ag|nv|se|class [a-c])\b\.?/g;
export const normCo = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim();
const rawCo = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/['’.]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Words too generic to identify a company on their own. */
const GENERIC = new Set(['american', 'general', 'united', 'national', 'first', 'international', 'global', 'southern', 'western', 'eastern', 'northern', 'pacific', 'public', 'service', 'services', 'energy', 'financial', 'capital', 'health', 'healthcare', 'technologies', 'systems', 'industries', 'brands', 'partners', 'resources', 'solutions', 'target', 'ball', 'apple', 'visa', 'block', 'match', 'fox', 'news', 'sun', 'best', 'gap']);
/** Subsidiaries and trade names that file WARN notices under their own name, matched as the START of the raw filer name
 *  (punctuation removed, "Inc" kept), so "apple inc" matches "Apple, Inc. - Cupertino" but not "Apple Auto Mitsubishi". */
export const WARN_ALIASES: Record<string, string[]> = {
  PEP: ['frito lay', 'pepsi bottling', 'pepsi beverages', 'quaker oats'], GOOGL: ['google'], META: ['facebook', 'meta platforms'], AMZN: ['amazon com services', 'amazon logistics', 'whole foods'],
  TGT: ['target corporation', 'target stores'], AAPL: ['apple inc'], KO: ['coca cola'], MDLZ: ['mondelez'], UPS: ['united parcel service'], CVS: ['cvs pharmacy', 'aetna'],
  ALK: ['alaska airlines'], CMCSA: ['comcast', 'nbcuniversal'], WBD: ['warner bros'], DIS: ['walt disney', 'disney'], GM: ['general motors'], GE: ['ge aerospace'], BA: ['boeing'],
  INTC: ['intel'], WBA: ['walgreens'], HPQ: ['hp inc'], HPE: ['hewlett packard enterprise'], GIS: ['general mills'], GD: ['general dynamics'], BALL: ['ball metal', 'ball aerospace'],
};

/** Match notices to companies: exact normalized name, or the company's distinctive name followed by more words ("pepsico" in "pepsico sales"). */
export function matchWarn(notices: WarnNotice[], companies: { sym: string; name: string }[]): Map<string, WarnNotice[]> {
  const keys: { sym: string; k: string; exactOnly: boolean }[] = [];
  const aliases: { sym: string; k: string }[] = [];
  for (const c of companies) {
    const k = normCo(c.name);
    if (!k) continue;
    const words = k.split(' ');
    // a single generic word ("Target", "Apple") only matches through an alias
    keys.push({ sym: c.sym, k, exactOnly: words.length === 1 && (GENERIC.has(k) || k.length < 5) });
    for (const a of WARN_ALIASES[c.sym] ?? []) aliases.push({ sym: c.sym, k: rawCo(a) });
  }
  keys.sort((a, b) => b.k.length - a.k.length); // longest name wins ("bank of america" before "bank")
  const out = new Map<string, WarnNotice[]>();
  const cache = new Map<string, string | null>();
  for (const n of notices) {
    const nk = normCo(n.company);
    let sym = cache.get(nk);
    if (sym === undefined) {
      const rk = rawCo(n.company);
      sym = aliases.find((x) => rk === x.k || rk.startsWith(`${x.k} `))?.sym ?? keys.find((x) => nk === x.k || (!x.exactOnly && nk.startsWith(`${x.k} `)))?.sym ?? null;
      cache.set(nk, sym);
    }
    if (sym) out.set(sym, [...(out.get(sym) ?? []), n]);
  }
  return out;
}

export function warnAgg(ns: WarnNotice[], today: string, days = 90): WarnAgg | null {
  const lo = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400_000).toISOString().slice(0, 10);
  const r = ns.filter((n) => n.date >= lo);
  if (!r.length) return null;
  return { notices: r.length, jobs: r.reduce((a, n) => a + (n.jobs ?? 0), 0), states: [...new Set(r.map((n) => n.state))].sort(), closure: r.some((n) => n.closure), latest: r.map((n) => n.date).sort().pop()!, names: [...new Set(r.map((n) => n.company))].slice(0, 4) };
}
/** Every employer, not only listed companies: notices and jobs per state in the last `days` days (the map's layoff shading). */
export function warnByState(ns: WarnNotice[], today: string, days = 90): Record<string, StateLayoffs> {
  const lo = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86400_000).toISOString().slice(0, 10);
  const out: Record<string, StateLayoffs> = {};
  for (const n of ns) if (n.date >= lo && /^[A-Z]{2}$/.test(n.state)) { const s = (out[n.state] ??= { notices: 0, jobs: 0 }); s.notices++; s.jobs += n.jobs ?? 0; }
  return out;
}

/* ---------------- job boards ---------------- */
export type Ats = 'greenhouse' | 'lever' | 'ashby';
export interface Board { ats: Ats; slug: string }
export interface JobsAgg { ats: Ats; slug: string; url: string; count: number; d30: number | null; d90: number | null; since: string }
export interface HiringFile { version: 1; asOf: number; boards: Record<string, Board>; misses: Record<string, string>; history: Record<string, [string, number][]> }
export const EMPTY_HIRING: HiringFile = { version: 1, asOf: 0, boards: {}, misses: {}, history: {} };

export const boardApi = (b: Board) => b.ats === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${b.slug}/jobs` : b.ats === 'lever' ? `https://api.lever.co/v0/postings/${b.slug}?mode=json` : `https://api.ashbyhq.com/posting-api/job-board/${b.slug}`;
export const boardPage = (b: Board) => b.ats === 'greenhouse' ? `https://job-boards.greenhouse.io/${b.slug}` : b.ats === 'lever' ? `https://jobs.lever.co/${b.slug}` : `https://jobs.ashbyhq.com/${b.slug}`;
/** Open-job count from any of the three APIs, or null when the reply is not a job board. */
export function countJobs(ats: Ats, j: any): number | null {
  if (ats === 'greenhouse') return Array.isArray(j?.jobs) ? (Number.isFinite(j?.meta?.total) ? j.meta.total : j.jobs.length) : null;
  if (ats === 'lever') return Array.isArray(j) ? j.length : null;
  return Array.isArray(j?.jobs) ? j.jobs.length : null;
}
/** Board names to try for a company: its full name joined ("bankofamerica") and hyphenated ("bank-of-america"). Never single generic words. */
export function slugCandidates(name: string): string[] {
  const k = normCo(name).replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!k || (k.split(' ').length === 1 && (GENERIC.has(k) || k.length < 4))) return [];
  return [...new Set([k.replace(/ /g, ''), k.replace(/ /g, '-')])];
}
/** Greenhouse tells us the board's company name: accept the board only if it matches ours. */
export const sameCompany = (a: string, b: string) => { const x = normCo(a).replace(/ /g, ''), y = normCo(b).replace(/ /g, ''); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };

/** Add today's count to a history (one point per day, 400 days kept) and read the 30- and 90-day changes. */
export function pushHistory(h: [string, number][], today: string, count: number): [string, number][] {
  const out = h.filter(([d]) => d !== today).concat([[today, count]]).sort((a, b) => a[0].localeCompare(b[0]));
  return out.slice(-400);
}
export function jobsAgg(b: Board, h: [string, number][], today: string): JobsAgg | null {
  if (!h.length) return null;
  const count = h[h.length - 1][1];
  const at = (days: number) => {
    const want = Date.parse(`${today}T00:00:00Z`) - days * 86400_000;
    const p = [...h].reverse().find(([d]) => Date.parse(`${d}T00:00:00Z`) <= want + 3 * 86400_000);
    return p && Date.parse(`${p[0]}T00:00:00Z`) >= want - 10 * 86400_000 ? p[1] : null;
  };
  return { ats: b.ats, slug: b.slug, url: boardPage(b), count, d30: at(30), d90: at(90), since: h[0][0] };
}
