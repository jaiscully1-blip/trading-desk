// GET /api/research?fn=patents&symbol=MRNA -> Patents section on the Company page: names matched (company + subsidiaries
// from the 10-K's Exhibit 21), filed vs granted per quarter for 5 years, the latest 25 filings, tech mix, peers.
// USPTO Open Data Portal rules: one call at a time per key (burst 1), back off >= 5 s after HTTP 429. So every call goes
// through one queue, each quarter's count is cached on its own, and a request stops after ~25 s and says `complete: false`;
// the page asks again and the next request carries on where this one stopped.
import { PATENT_ALIASES, aliasNames, countBody, ex21FromIndex, countOf, exhibit21Names, grantTrend, lastQuarters, latestBody, ODP_SEARCH, ownerQ, parseRows, simpleQ, techMix, type CountKind } from '../../../shared/patents.js';
import { cleanCoName, htmlToText, latestAnnual, parseSecTickers, secProfile } from '../../../shared/company.js';
import { finnhubPeers, secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, getCached, getJson, hasKey, json, key, take } from '../core.js';

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
  return { name, subs, names: aliasNames(name, subs, PATENT_ALIASES[sym] ?? []) };
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
  const me = (await safe('subsidiaries', () => filerNames(tickers, sym))) ?? { name: sym, subs: [] as string[], names: aliasNames(sym, [], PATENT_ALIASES[sym] ?? []) };
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

  const year = new Date().getUTCFullYear();
  return json({
    sym, name, names, subsidiaries: subs.length, qForm, complete,
    quarters: counts, trend: grantTrend(counts), latest: latest ?? [], mix: techMix(latest ?? [], year), peers, errors, asOf: Date.now(),
    source: 'USPTO Open Data Portal (official, refreshed daily) · names from the company and its 10-K subsidiary list (SEC EDGAR)',
  }, { sMaxAge: complete && !Object.keys(errors).length ? 3600 : 0 });
}
