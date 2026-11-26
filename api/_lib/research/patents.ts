// GET /api/research?fn=patents&symbol=MRNA -> Patents section on the Company page: names matched (company + subsidiaries
// from the 10-K's Exhibit 21), filed vs granted per quarter for 5 years, the latest 25 filings, tech mix, peers.
// USPTO Open Data Portal rules: one call at a time per key (burst 1), back off >= 5 s after HTTP 429. So every call goes
// through one queue, each quarter's count is cached on its own, and a request stops after ~25 s and says `complete: false`;
// the page asks again and the next request carries on where this one stopped.
import { PATENT_ALIASES, aliasNames, countBody, ex21FromIndex, countOf, exhibit21Names, grantTrend, lastQuarters, latestBody, ODP_SEARCH, ownerQ, parseRows, simpleQ, techMix, type CountKind } from '../../../shared/patents.js';
import { cleanCoName, htmlToText, latestAnnual, parseSecTickers, secProfile } from '../../../shared/company.js';
import { finnhubPeers, geminiJson, hasAi, secJson, secText } from '../adapters.js';
import { companyDrugs, fdaIndex, type ObFile } from '../../../shared/orangeBook.js';
import { GP_ID_RE, PLAIN_SCHEMA, ROLLOUT_SCHEMA, candidateSentences, checkRollout, gpAbstract, gpId, plainPrompt, rolloutPrompt } from '../../../shared/patentEvidence.js';
import { tenKExcerpt } from '../../../shared/company.js';
import { SYMBOL_RE, cached, getCached, getJson, hasKey, json, key, setCached, take } from '../core.js';
import { BASELINE_Q, CPC_FORMS, RADAR, hasGroup, plausibleSub, orQ, prefixVariants, radarBody, radarWindows, themeQ, topFacet, type CpcForm, type RadarKind } from '../../../shared/patentRadar.js';

// FDA Orange Book file written weekly by .github/workflows/orangebook.yml (public repo; same reading as the Kronos file)
const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const GH_TOKEN = process.env.GITHUB_TOKEN;
async function orangeBook(): Promise<ObFile | null> {
  const url = GH_TOKEN ? `https://api.github.com/repos/${REPO}/contents/published/orangebook.json` : `https://raw.githubusercontent.com/${REPO}/main/published/orangebook.json`;
  const init = GH_TOKEN ? { headers: { authorization: `Bearer ${GH_TOKEN}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' } } : undefined;
  try { const f = (await cached('orangebook', 86400, () => getJson(url, 'github', 15000, init))).val; return f?.schema === 1 && Array.isArray(f.rows) ? f : null; } catch { return null; }
}

let chain: Promise<unknown> = Promise.resolve();
/** One USPTO call at a time on this server, with one patient retry after a 429. */
function odp(body: object): Promise<any> {
  const run = async () => {
    if (!take('patentsview')) throw new Error('USPTO budget used up for now');
    const call = () => getJson(ODP_SEARCH, 'patentsview', 20000, { method: 'POST', body: JSON.stringify(body), headers: { 'X-API-KEY': key('patentsview') } });
    try { return await call(); } catch (e) {
      const msg = String((e as Error).message);
      if (/HTTP 404/.test(msg)) return { count: 0, patentFileWrapperDataBag: [] }; // ODP answers 404 when nothing matches
      if (/429/.test(msg)) { await new Promise((r) => setTimeout(r, 5500)); return call(); }
      throw e;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

/** Subsidiary names from the newest 10-K's Exhibit 21. The file is found by name (ex21 / exhibit21) or, when the name
 *  says nothing, by its document type on the filing's index page. Empty when the filing has none. */
async function subsidiaries(filingUrl: string): Promise<string[]> {
  const dir = filingUrl.slice(0, filingUrl.lastIndexOf('/'));
  const names: string[] = ((await secJson(`${dir}/index.json`))?.directory?.item ?? []).map((i: any) => String(i.name));
  let url = names.find((n) => /ex-?21|exhibit-?21/i.test(n) && /\.(htm|html|txt)$/i.test(n));
  let full = url ? `${dir}/${url}` : null;
  if (!full) {
    const idx = names.find((n) => /-index\.html?$/i.test(n));
    const href = idx ? ex21FromIndex(await secText(`${dir}/${idx}`)) : null;
    full = href ? new URL(href, 'https://www.sec.gov').toString() : null;
  }
  return full ? exhibit21Names(htmlToText(await secText(full))) : [];
}

/** Newest 10-K and its subsidiary names for any ticker (cached: submissions a day, subsidiaries 30 days). */
async function filerNames(tickers: { cik: number; ticker: string; title: string }[] | null, sym: string) {
  const t = tickers?.find((x) => x.ticker === sym);
  const sub = t ? (await cached(`sec:sub:${t.cik}`, 86400, async () => {
    const j = await secJson(`https://data.sec.gov/submissions/CIK${String(t.cik).padStart(10, '0')}.json`);
    return { filing: latestAnnual(j, t.cik), sec: secProfile(j) };
  })).val : null;
  const name = sub?.sec.name ? cleanCoName(sub.sec.name) : t?.title ? cleanCoName(t.title) : sym;
  const subs = sub?.filing ? (await cached(`ex21v2:${sub.filing.url}`, 30 * 86400, () => subsidiaries(sub.filing!.url))).val : [];
  return { name, subs, filing: sub?.filing ?? null, names: aliasNames(name, subs, PATENT_ALIASES[sym] ?? []) };
}

export async function patents(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('patentsview')) return json({ sym, needsKey: true });
  const started = Date.now(), budget = 25_000;
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = String((e as Error).message).slice(0, 160); return null; } };

  // company name, newest 10-K and its subsidiaries (same SEC caches the Company page uses)
  const tickers = hasKey('sec') ? await safe('sec', async () => (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val) : null;
  const me = (await safe('subsidiaries', () => filerNames(tickers, sym))) ?? { name: sym, subs: [] as string[], filing: null, names: aliasNames(sym, [], PATENT_ALIASES[sym] ?? []) };
  const { name, subs, names } = me;

  // which query form the server accepts (the OR form is preferred; fall back once if it is rejected)
  let q = ownerQ(names), qForm = 'applicant or assignee, all names';
  const latest = await safe('latest', async () => (await cached(`pat:latest:${q}`, 86400, async () => parseRows(await odp(latestBody(q))))).val)
    ?? await safe('latest', async () => { q = simpleQ(names); qForm = 'first applicant, company name only'; const r = (await cached(`pat:latest:${q}`, 86400, async () => parseRows(await odp(latestBody(q))))).val; delete errors.latest; return r; });

  // quarterly counts, newest quarters first so a partial answer is the most useful one
  const qs = lastQuarters(new Date());
  const counts = qs.map((x) => ({ label: x.label, done: x.done, filed: null as number | null, granted: null as number | null }));
  let complete = true;
  for (let i = qs.length - 1; i >= 0; i--) for (const kind of ['granted', 'filed'] as CountKind[]) {
    const k = `pat:n:${kind}:${qs[i].from}:${q}`;
    const hit = getCached<number>(k);
    if (hit) { counts[i][kind] = hit.val; continue; }
    if (Date.now() - started > budget || errors.counts) { complete = false; continue; }
    // finished quarters older than 18 months hardly change; recent ones still fill in as applications are published
    const ttl = qs[i].done && i < qs.length - 6 ? 30 * 86400 : 86400;
    const n = await safe('counts', async () => (await cached(k, ttl, async () => countOf(await odp(countBody(q, kind, qs[i].from, qs[i].to))))).val);
    if (n == null) complete = false; else counts[i][kind] = n;
  }

  // peers: granted in the last 4 finished quarters vs the 4 before (2 calls each), only once the company itself is done
  const done = qs.filter((x) => x.done);
  const w1 = { from: done[done.length - 4]?.from, to: done[done.length - 1]?.to }, w0 = { from: done[done.length - 8]?.from, to: done[done.length - 5]?.to };
  const peerSyms = hasKey('finnhub') ? ((await safe('peers', async () => (await cached(`peers:${sym}`, 7 * 86400, () => finnhubPeers(sym))).val)) ?? []).filter((p) => p !== sym).slice(0, 4) : [];
  const peers: { sym: string; name: string; last: number | null; prior: number | null }[] = [];
  for (const p of peerSyms) {
    if (Date.now() - started > budget) { complete = false; peers.push({ sym: p, name: p, last: null, prior: null }); continue; }
    const pf = (await safe('peers', () => filerNames(tickers, p))) ?? { name: p, subs: [] as string[], names: [p] };
    const pn = pf.name, pq = ownerQ(pf.names);
    const row = { sym: p, name: pn, last: null as number | null, prior: null as number | null };
    for (const [w, f] of [[w1, 'last'], [w0, 'prior']] as const) {
      const k = `pat:n:granted:${w.from}:${w.to}:${pq}`;
      const hit = getCached<number>(k);
      if (hit) { row[f] = hit.val; continue; }
      if (!complete || Date.now() - started > budget || !w.from || !w.to) { complete = false; continue; }
      row[f] = await safe('peers', async () => (await cached(k, 7 * 86400, async () => countOf(await odp(countBody(pq, 'granted', w.from!, w.to!))))).val);
    }
    peers.push(row);
  }

  // FDA Orange Book: the company's listed drugs and patent expiries, and which latest patents cover an approved drug
  const ob = await orangeBook();
  const fda = ob ? companyDrugs(ob, names).slice(0, 40) : null;
  const idx = ob ? fdaIndex(ob) : null;
  const rows = (latest ?? []).map((r) => ({ ...r, gp: gpId(r.patentNo, r.pubNo), fda: r.patentNo && idx ? idx.get(r.patentNo.replace(/[^A-Z0-9]/gi, '').toUpperCase()) ?? null : null }));

  const year = new Date().getUTCFullYear();
  return json({ fda, obAsOf: ob?.asOf ?? null,
    sym, name, names, subsidiaries: subs.length, qForm, complete,
    quarters: counts, trend: grantTrend(counts), latest: rows, mix: techMix(latest ?? [], year), peers, errors, asOf: Date.now(),
    source: 'USPTO Open Data Portal (official, refreshed daily) · names from the company and its 10-K subsidiary list (SEC EDGAR)',
  }, { sMaxAge: complete && !Object.keys(errors).length ? 3600 : 0 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Patents & Tech page: theme radar and watchlist summary. Same queue and caches as the Company section.

/** GET fn=patentradar -> per theme: made public and granted, last 90 days vs the same days a year earlier, top filers. */
export async function patentradar(): Promise<Response> {
  if (!hasKey('patentsview')) return json({ needsKey: true });
  const started = Date.now(), budget = 25_000;
  const errors: Record<string, string> = {};
  const w = radarWindows(new Date());
  // which prefix syntax the USPTO accepts: the first form that finds AI patents made public in the last 90 days
  let form: CpcForm | null = getCached<CpcForm>('pat:cpcform')?.val ?? null;
  if (!form) {
    for (const f of CPC_FORMS) {
      try { if (countOf(await odp(radarBody(themeQ(RADAR[0].cpc, f), 'published', w.cur))) > 0) { form = f; setCached('pat:cpcform', f, 7 * 86400); break; } } catch (e) { errors.syntax = String((e as Error).message).slice(0, 160); }
    }
    if (!form) return json({ unavailable: true, why: errors.syntax ?? 'The USPTO search returned nothing for classification prefixes, so the radar cannot count by theme yet.', windows: w }, { sMaxAge: 0 });
  }
  let complete = true;
  const themes = [];
  // baseline first: all US utility patents in the same windows, so each theme can be read against the overall trend
  const base = { cur: { published: null as number | null, granted: null as number | null }, prev: { published: null as number | null, granted: null as number | null } };
  for (const [win, slot] of [[w.cur, 'cur'], [w.prev, 'prev']] as const) for (const kind of ['published', 'granted'] as RadarKind[]) {
    const k = `pat:radar:${kind}:${win.from}:${BASELINE_Q}`;
    const hit = getCached<{ n: number }>(k);
    if (hit) { base[slot][kind] = hit.val.n; continue; }
    if (Date.now() - started > budget) { complete = false; continue; }
    try { base[slot][kind] = (await cached(k, 12 * 3600, async () => ({ n: countOf(await odp(radarBody(BASELINE_Q, kind, win))), top: [] }))).val.n; } catch (e) { errors.baseline = String((e as Error).message).slice(0, 160); complete = false; }
  }
  for (const t of RADAR) {
    let q = themeQ(t.cpc, form);
    // sub-category themes (quantum): find the code spelling that matches, once a week
    if (hasGroup(t)) {
      const kq = `pat:radarq4:${t.id}`;
      const known = getCached<string>(kq);
      if (known) q = known.val;
      else if (Date.now() - started < budget) {
        const parts: string[] = [];
        for (const p of t.cpc) {
          // the parent class count bounds the answer: a spelling read as "match anything" returns more than the parent
          const parent = countOf(await odp(radarBody(themeQ([p.slice(0, 4)], form), 'published', w.cur)));
          for (const v of prefixVariants(p)) { try { if (plausibleSub(countOf(await odp(radarBody(v, 'published', w.cur))), parent)) { parts.push(v); break; } } catch { /* try the next spelling */ } }
        }
        q = parts.length ? orQ(parts) : '';
        setCached(kq, q, parts.length ? 7 * 86400 : 86400);
      } else q = '';
      if (!q) { themes.push({ id: t.id, label: t.label, group: t.group, cur: { published: null, granted: null }, prev: { published: null, granted: null }, top: [], unmatched: true }); continue; }
    }
    const row = { id: t.id, label: t.label, group: t.group, cur: { published: null as number | null, granted: null as number | null }, prev: { published: null as number | null, granted: null as number | null }, top: [] as { name: string; n: number }[] };
    for (const [win, slot] of [[w.cur, 'cur'], [w.prev, 'prev']] as const) for (const kind of ['published', 'granted'] as RadarKind[]) {
      const facet = slot === 'cur' && kind === 'published';
      const k = `pat:radar:${kind}:${win.from}:${q}${facet ? ':f' : ''}`;
      const hit = getCached<{ n: number; top: { name: string; n: number }[] }>(k);
      if (hit) { row[slot][kind] = hit.val.n; if (facet) row.top = hit.val.top; continue; }
      if (Date.now() - started > budget || errors.counts) { complete = false; continue; }
      const r = await (async () => { try { return (await cached(k, 12 * 3600, async () => { const j = await odp(radarBody(q, kind, win, facet)); return { n: countOf(j), top: facet ? topFacet(j) : [] }; })).val; } catch (e) { errors.counts = String((e as Error).message).slice(0, 160); return null; } })();
      if (!r) { complete = false; continue; }
      row[slot][kind] = r.n; if (facet) row.top = r.top;
    }
    themes.push(row);
  }
  return json({ form, windows: w, base, themes, complete, errors, asOf: Date.now(), source: 'USPTO Open Data Portal (official, refreshed daily). Themes are patent classification (CPC) groups.' },
    { sMaxAge: complete && !Object.keys(errors).length ? 3600 : 0 });
}

/** GET fn=patentwatch&symbols=NVDA,MRNA -> per name: patents granted in the last 4 finished quarters vs the 4 before. */
export async function patentwatch(req: Request): Promise<Response> {
  if (!hasKey('patentsview')) return json({ needsKey: true });
  const syms = [...new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 30);
  const started = Date.now(), budget = 25_000;
  const tickers = hasKey('sec') ? await (async () => { try { return (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val; } catch { return null; } })() : null;
  const done = lastQuarters(new Date()).filter((x) => x.done);
  const w1 = { from: done[done.length - 4].from, to: done[done.length - 1].to }, w0 = { from: done[done.length - 8].from, to: done[done.length - 5].to };
  let complete = true;
  const rows = [];
  for (const s of syms) {
    const row = { sym: s, name: s, names: [] as string[], last: null as number | null, prior: null as number | null, error: null as string | null };
    if (Date.now() - started > budget) { complete = false; rows.push(row); continue; }
    try {
      const f = await filerNames(tickers, s);
      row.name = f.name; row.names = f.names;
      const q = ownerQ(f.names);
      for (const [w, slot] of [[w1, 'last'], [w0, 'prior']] as const) {
        const k = `pat:n:granted:${w.from}:${w.to}:${q}`;
        const hit = getCached<number>(k);
        if (hit) { row[slot] = hit.val; continue; }
        if (Date.now() - started > budget) { complete = false; continue; }
        row[slot] = (await cached(k, 7 * 86400, async () => countOf(await odp(countBody(q, 'granted', w.from, w.to))))).val;
      }
    } catch (e) { row.error = String((e as Error).message).slice(0, 120); }
    rows.push(row);
  }
  return json({ rows, complete, window: { last: w1, prior: w0 }, asOf: Date.now() }, { sMaxAge: complete ? 3600 : 0 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Rollout evidence and plain-English descriptions (Company section and Patents & Tech page). Labeled AI; quotes verified.

/** GET fn=patentrollout&symbol=VRTX -> for each of the latest filings: in products / in development / no evidence,
 *  with the 10-K sentence that shows it (checked to be in the 10-K). Free AI chain; cached a week per 10-K. */
export async function patentrollout(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('patentsview') || !hasKey('sec')) return json({ error: 'Needs the USPTO key and SEC_USER_AGENT.' });
  if (!hasAi()) return json({ error: 'Needs a free AI key in Vercel: GEMINI_API_KEY or GROQ_API_KEY.' });
  try {
    const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
    const f = await filerNames(tickers, sym);
    if (!f.filing) return json({ error: 'No annual report (10-K) found for this company, so there is nothing to compare against.' });
    const q = ownerQ(f.names);
    const rows = (await cached(`pat:latest:${q}`, 86400, async () => parseRows(await odp(latestBody(q))))).val;
    const excerpt = (await cached(`excerpt:${f.filing.url}`, 30 * 86400, async () => tenKExcerpt(htmlToText(await secText(f.filing!.url))))).val;
    const titles = rows.map((r) => r.title);
    const key = `pat:rollout:${f.filing.url}:${rows.map((r) => r.app).join(',')}`;
    const out = (await cached(key, 7 * 86400, async () => {
      const sents = candidateSentences(excerpt, titles);
      if (!sents.length) return { items: titles.map(() => ({ verdict: 'no_evidence', quote: '', dropped: false })), model: null };
      const r = await geminiJson(rolloutPrompt(f.name, titles, sents), ROLLOUT_SCHEMA);
      return { items: checkRollout(r.data, titles.length, excerpt), model: r.model };
    })).val;
    return json({ sym, filing: { date: f.filing.date, url: f.filing.url, form: f.filing.form }, model: out.model, items: rows.map((r, i) => ({ app: r.app, ...out.items[i] })),
      note: 'AI guess from the company\'s latest 10-K: each quote was checked to be in the filing. "No evidence" means the 10-K does not say, not that the tech is unused.' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: String((e as Error).message).slice(0, 200) }); }
}

/** GET fn=patentabstract&id=US12345678&title=... -> the abstract (public Google Patents page) and a one-line plain-English
 *  summary (free AI chain, labeled). Cached 30 days per patent. */
export async function patentabstract(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const id = (u.searchParams.get('id') ?? '').toUpperCase();
  const title = (u.searchParams.get('title') ?? '').slice(0, 300);
  if (!GP_ID_RE.test(id)) return json({ error: 'bad patent id' }, { status: 400 });
  const page = `https://patents.google.com/patent/${id}/en`;
  try {
    const abstract = (await cached(`gp:abs:${id}`, 30 * 86400, async () => {
      if (!take('googlepatents')) throw new Error('Too many patent pages opened just now; try again in a minute.');
      const r = await fetch(page, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; trading-desk research)' }, signal: AbortSignal.timeout(12000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Google Patents answered HTTP ${r.status}`);
      return gpAbstract(await r.text());
    })).val;
    let plain: string | null = null, model: string | null = null;
    if (abstract && hasAi()) {
      try { const p = (await cached(`gp:plain:${id}`, 30 * 86400, async () => { const r = await geminiJson(plainPrompt(title, abstract), PLAIN_SCHEMA); return { plain: String(r.data?.plain ?? '').slice(0, 300), model: r.model }; })).val; plain = p.plain || null; model = p.model; } catch { /* abstract alone is still useful */ }
    }
    return json({ id, url: page, abstract, plain, model }, { sMaxAge: abstract ? 86400 : 0 });
  } catch (e) { return json({ id, url: page, error: String((e as Error).message).slice(0, 160) }); }
}
