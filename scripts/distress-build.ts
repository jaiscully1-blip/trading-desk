// Nightly distress read for the S&P 500 + Nasdaq-100 (+ agents/tickers.txt). Writes published/distress.json, which the desk
// reads through /api/research?fn=distress. Run by .github/workflows/distress.yml, or by hand:
//   SEC_USER_AGENT="your-app contact@example.com" npx --yes tsx@4.19.2 scripts/distress-build.ts
// Also: state WARN layoff notices (Big Local News consolidated file) and open-job counts from public Greenhouse / Lever / Ashby boards,
// whose history is kept in published/hiring.json (one point per company per day).
// Optional env: FINNHUB_API_KEY (company news; Yahoo RSS is used without it), GEMINI_API_KEY (short summaries for the 20 most-flagged names,
// written by Gemma first, which has a much larger free allowance than Gemini Flash),
// LIMIT=50 (first N tickers only, for a quick test), INPUTS_OUT=path (save the gathered inputs), INPUTS_IN=path (re-score saved inputs
// without fetching anything, for tuning the scoring). Free sources only; every part that fails is named in `errors`. Nothing here can trade.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
type Sub = ReturnType<typeof fromSubmissions>;
import { COMPANIES } from '../shared/data/companies.js';
import { parseSecTickers } from '../shared/company.js';
import { parseForm4, type InsiderTx } from '../shared/insider.js';
import { priceStats, rollup, scoreCompany, stateOf, type DistressFile, type DistressInput, type DistressRow, type GoingConcern, type NewsHit } from '../shared/distress.js';
import { EMPTY_HIRING, WARN_CSV, WARN_SRC, boardApi, countJobs, jobsAgg, matchWarn, parseWarn, pushHistory, sameCompany, slugCandidates, warnAgg, warnByState, type Board, type HiringFile, type JobsAgg, type StateLayoffs, type WarnAgg } from '../shared/labor.js';
import { ANNUAL, GC_PHRASES, INSTANT, QUARTER, eftsUrl, finFromFrames, framePeriods, frameUrl, fromSubmissions, insiderAgg, parseEfts, parseFinraShort, parseFrame, parseSpark, parseYahooRss, tagNews, yahooSym, type FrameMap } from '../shared/distressGather.js';

const UA = process.env.SEC_USER_AGENT;
if (!UA && !process.env.INPUTS_IN) { console.error('Set SEC_USER_AGENT (an app name and a contact email, as SEC asks).'); process.exit(1); }
const LIMIT = Number(process.env.LIMIT) || Infinity;
const today = new Date().toISOString().slice(0, 10);
const errors: Record<string, string> = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const note = (k: string, e: unknown) => { const m = (e as Error)?.message ?? String(e); errors[k] = errors[k] ? errors[k] : m.slice(0, 160); };

// SEC fair access: at most 10 requests a second. Stay at ~6.
let secNext = 0;
async function sec(url: string, as: 'json' | 'text' = 'json'): Promise<any> {
  const wait = secNext - Date.now(); secNext = Math.max(Date.now(), secNext) + 170; if (wait > 0) await sleep(wait);
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: { 'user-agent': UA!, 'accept-encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(25000) }).catch((e) => e as Error);
    if (r instanceof Error) { if (a === 2) throw r; await sleep(1500); continue; }
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`);
    try { return await (as === 'json' ? r.json() : r.text()); } catch (e) { if (a === 2) throw e; await sleep(1500); }
  }
  throw new Error(`gave up ${url.slice(0, 80)}`);
}
async function web(url: string, as: 'json' | 'text' = 'json'): Promise<any> {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal research)' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.text();
}
async function pool<T>(items: T[], n: number, fn: (x: T, i: number) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

// ---------- universe ----------
const extras = (() => { try { return readFileSync('agents/tickers.txt', 'utf8').split('\n').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)); } catch { return []; } })();
const known = new Set(COMPANIES.map((c) => c[0]));
const universe = [...COMPANIES.map((c) => ({ sym: c[0], name: c[1], sector: c[2], industry: c[3], hq: c[4], lat: c[5] as number | null, lon: c[6] as number | null })),
  ...extras.filter((s) => !known.has(s)).map((s) => ({ sym: s, name: s, sector: '', industry: '', hq: '', lat: null, lon: null }))].slice(0, LIMIT);
console.log(`universe ${universe.length}`);

const saved: { inputs: DistressInput[]; errors: Record<string, string>; coverage: Record<string, number>; sources: Record<string, string>; layoffStates?: Record<string, StateLayoffs> } | null = process.env.INPUTS_IN ? JSON.parse(readFileSync(process.env.INPUTS_IN, 'utf8')) : null;
const tickers = saved ? [] : parseSecTickers(await sec('https://www.sec.gov/files/company_tickers.json'));
const cikOf = new Map(tickers.map((t) => [t.ticker.replace(/-/g, '.'), t.cik]));

const P = framePeriods(today);
const frames: Record<string, FrameMap> = {};
const subs = new Map<string, Sub>(), ins = new Map<string, InsiderTx[]>();
const gc = new Map<number, GoingConcern>();
let gcOk = true;
const closes = new Map<string, number[]>();
let shortVol = new Map<string, number>();
const news = new Map<string, NewsHit[]>();
const fh = process.env.FINNHUB_API_KEY;
let warnOk = false;
const warnBy = new Map<string, WarnAgg | null>();
let layoffStates: Record<string, StateLayoffs> = saved?.layoffStates ?? {};
const jobsBy = new Map<string, JobsAgg | null>();
let prevRows: DistressRow[] = [];
if (!saved) {
// ---------- XBRL frames ----------
const jobs: [string, string, string, string][] = [];
for (const per of P.inst) for (const c of INSTANT) jobs.push(['us-gaap', c, 'USD', per]);
for (const per of [...P.inst, ...P.instYearAgo]) jobs.push(['dei', 'EntityCommonStockSharesOutstanding', 'shares', per]);
for (const per of P.q) for (const c of QUARTER) jobs.push(['us-gaap', c, 'USD', per]);
for (const per of P.qYearAgo) for (const c of QUARTER.slice(1)) jobs.push(['us-gaap', c, 'USD', per]);
for (const c of ANNUAL) jobs.push(['us-gaap', c, 'USD', P.year]);
await pool(jobs, 3, async ([tx, c, u, per]) => {
  try { frames[`${c}@${per}`] = parseFrame(await sec(frameUrl(tx as 'us-gaap', c, u, per))); }
  catch (e) { if (!/HTTP 404/.test(String(e))) note(`frame ${c} ${per}`, e); frames[`${c}@${per}`] = new Map(); }
});
console.log(`frames ${jobs.length}`);

// ---------- submissions + Form 4 ----------
let subFail = 0;
await pool(universe, 4, async (u) => {
  const cik = cikOf.get(u.sym);
  if (!cik) return;
  try {
    const s = fromSubmissions(await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`), cik, today);
    subs.set(u.sym, s);
    const txs: InsiderTx[] = [];
    for (const f of s.form4) { try { txs.push(...parseForm4(await sec(f.url, 'text'), f.filed, f.index)); } catch { /* one bad filing is fine */ } }
    ins.set(u.sym, txs);
  } catch (e) { subFail++; note('submissions', e); }
  if ((subs.size + subFail) % 50 === 0) console.log(`  submissions ${subs.size + subFail}/${universe.length}`);
});
if (subFail) errors.submissions = `${subFail} companies failed; first: ${errors.submissions}`;
console.log(`submissions ${subs.size}`);

// ---------- going-concern wording (SEC full-text search, 40 companies per query) ----------
const ciks = universe.map((u) => cikOf.get(u.sym)).filter((c): c is number => !!c);
const gcFrom = new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10);
for (let i = 0; i < ciks.length; i += 40) for (const ph of GC_PHRASES) {
  try { parseEfts(await sec(eftsUrl(ph, ciks.slice(i, i + 40), gcFrom, today)), gc); } catch (e) { gcOk = false; note('going-concern search', e); }
}
console.log(`going concern hits ${gc.size}`);

// ---------- prices (Yahoo spark, unofficial, 20 per call) ----------
for (let i = 0; i < universe.length; i += 20) {
  const syms = universe.slice(i, i + 20).map((u) => u.sym);
  try { parseSpark(await web(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${syms.map(yahooSym).join(',')}&range=1y&interval=1d`), syms).forEach((v, k) => closes.set(k, v)); }
  catch (e) { note('prices', e); }
  await sleep(400);
}
console.log(`prices ${closes.size}`);

// ---------- FINRA short volume, last 5 weekdays that have a file ----------
const want = new Set(universe.map((u) => u.sym));
const finraTexts: string[] = [];
for (let k = 1; k <= 10 && finraTexts.length < 5; k++) {
  const d = new Date(Date.now() - k * 86400_000);
  if ([0, 6].includes(d.getUTCDay())) continue;
  try { finraTexts.push(await web(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${d.toISOString().slice(0, 10).replace(/-/g, '')}.txt`, 'text')); } catch { /* holiday */ }
}
shortVol = parseFinraShort(finraTexts, want);
if (!finraTexts.length) errors.finra = 'no FINRA short volume files in the last 10 days';

// ---------- headlines: Finnhub company news with a key, Yahoo RSS without ----------
const from30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
let newsFail = 0;
for (const u of universe) {
  try {
    if (fh) {
      const j = await web(`https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(u.sym)}&from=${from30}&to=${today}&token=${fh}`);
      news.set(u.sym, tagNews((Array.isArray(j) ? j : []).slice(0, 60).map((n: any) => ({ t: Number(n.datetime) * 1000, title: String(n.headline ?? ''), url: String(n.url ?? ''), src: `${n.source ?? 'Finnhub'} via Finnhub` }))));
      await sleep(1100);
    } else {
      news.set(u.sym, parseYahooRss(await web(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${yahooSym(u.sym)}&region=US&lang=en-US`, 'text')));
      await sleep(350);
    }
  } catch (e) { newsFail++; if (newsFail === 1) note('news', e); }
}
if (newsFail) errors.news = `${newsFail} tickers failed; first: ${errors.news}`;
console.log(`news ${news.size}`);

// ---------- WARN layoff notices (every state Big Local News covers) ----------
try {
  const notices = parseWarn(await web(WARN_CSV, 'text'), today, 120);
  const m = matchWarn(notices, universe);
  universe.forEach((u) => warnBy.set(u.sym, warnAgg(m.get(u.sym) ?? [], today)));
  layoffStates = warnByState(notices, today);
  warnOk = true;
  console.log(`warn ${notices.length} notices, ${[...warnBy.values()].filter(Boolean).length} listed companies`);
} catch (e) { note('warn', e); }

// ---------- open jobs on public job boards (Greenhouse, Lever, Ashby) ----------
try { const p = JSON.parse(readFileSync('published/distress.json', 'utf8')); if (Array.isArray(p?.rows)) prevRows = p.rows; } catch { /* first run */ }
let hiring: HiringFile = EMPTY_HIRING;
try { const h = JSON.parse(readFileSync('published/hiring.json', 'utf8')); if (h?.version === 1) hiring = h; } catch { /* first run */ }
hiring = { ...hiring, boards: { ...hiring.boards }, misses: { ...hiring.misses }, history: { ...hiring.history } };
const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
async function tryBoard(b: Board, name: string): Promise<number | null> {
  try {
    if (b.ats === 'greenhouse') { const info = await web(`https://boards-api.greenhouse.io/v1/boards/${b.slug}`); if (!sameCompany(String(info?.name ?? ''), name)) return null; }
    return countJobs(b.ats, await web(boardApi(b)));
  } catch { return null; }
}
let boardsFound = 0;
await pool(universe, 6, async (u) => {
  let b: Board | undefined = hiring.boards[u.sym];
  let n: number | null = null;
  if (b) { n = await tryBoard(b, u.name); if (n == null) { delete hiring.boards[u.sym]; b = undefined; } }
  if (!b && !(hiring.misses[u.sym] >= cutoff)) {
    search: for (const slug of slugCandidates(u.name)) for (const ats of ['greenhouse', 'lever', 'ashby'] as const) {
      const c = await tryBoard({ ats, slug }, u.name);
      if (c != null && (ats === 'greenhouse' || c > 0)) { b = { ats, slug }; n = c; hiring.boards[u.sym] = b; delete hiring.misses[u.sym]; break search; }
    }
    if (!b) hiring.misses[u.sym] = today;
  }
  if (b && n != null) { boardsFound++; hiring.history[u.sym] = pushHistory(hiring.history[u.sym] ?? [], today, n); jobsBy.set(u.sym, jobsAgg(b, hiring.history[u.sym], today)); }
});
hiring.asOf = Date.now();
mkdirSync('published', { recursive: true });
writeFileSync('published/hiring.json', JSON.stringify(hiring));
console.log(`job boards ${boardsFound}`);

}

// ---------- score ----------
const inputs: DistressInput[] = saved ? saved.inputs : universe.map((u) => {
  const cik = cikOf.get(u.sym);
  const s = subs.get(u.sym);
  const c = closes.get(u.sym);
  const input: DistressInput = {
    ...u, state: s?.state || stateOf(u.hq), fin: cik ? finFromFrames(frames, P, cik) : null,
    events: s?.events ?? null, late: s?.late ?? null, goingConcern: !cik || !gcOk ? undefined : gc.get(cik) ?? null,
    insiders: s ? insiderAgg(ins.get(u.sym) ?? [], today) : null, price: c ? priceStats(c) : null, shortVol: shortVol.get(u.sym) ?? null, news: news.get(u.sym) ?? null,
    warn: warnOk ? warnBy.get(u.sym) ?? null : undefined, jobs: jobsBy.get(u.sym) ?? null,
  };
  if (!u.hq && s?.city) input.hq = `${s.city[0]}${s.city.slice(1).toLowerCase()}, ${s.state}`;
  return input;
});
if (saved) Object.assign(errors, saved.errors);
const rows: DistressRow[] = inputs.map((x) => scoreCompany(x, today));

// ---------- Gemini: short summaries for the most-flagged names (optional) ----------
if (process.env.GEMINI_API_KEY) {
  const { geminiBulkJson } = await import('../api/_lib/adapters.js');
  const pick = [...rows].sort((a, b) => b.weak - a.weak).slice(0, 14).concat([...rows].filter((r) => r.label === 'turnaround').sort((a, b) => b.turn - a.turn).slice(0, 6));
  const schema = { type: 'OBJECT', properties: { summary: { type: 'STRING' }, watch: { type: 'STRING' } }, required: ['summary', 'watch'] };
  for (const r of [...new Set(pick)]) {
    const prompt = `You summarize public signals about ${r.name} (${r.sym}, ${r.industry}). Use ONLY the facts below. Do not give investment advice, price targets or buy/sell views.
Write "summary": 2 plain sentences on what the signals say about the company's condition. Write "watch": one sentence naming the next public event or number that would confirm or contradict it.
Signals: ${r.signals.map((s) => `${s.text} [${s.src}${s.date ? `, ${s.date}` : ''}]`).join('; ')}
Headlines (30 days): ${r.news.map((n) => n.title).join(' | ') || 'none'}`;
    try { const g = await geminiBulkJson(prompt, schema); r.ai = { summary: String(g.data.summary).slice(0, 400), watch: String(g.data.watch).slice(0, 240), model: g.model, at: Date.now() }; }
    catch (e) { note('gemini', e); }
    await sleep(8000); // stay well inside the free per-minute limits
  }
} else errors.gemini = 'no GEMINI_API_KEY: no summaries';

const file: DistressFile = {
  version: 1, asOf: Date.now(), today, universe: universe.length, rows,
  layoffStates, sectors: rollup(rows, (r) => r.sector), industries: rollup(rows, (r) => r.industry).filter((g) => g.n >= 3), states: rollup(rows, (r) => r.state),
  sources: {
    filings: 'SEC EDGAR submissions (8-K items, NT 10-K / NT 10-Q), SEC full-text search (going-concern wording), SEC Form 4',
    financials: `SEC XBRL frames: balance sheet ${P.inst.join(' / ')}, quarter ${P.q.join(' / ')}, year ${P.year}`,
    prices: 'Yahoo Finance spark (unofficial, delayed)', shortVolume: 'FINRA daily short sale volume (CNMS)',
    news: fh ? 'Finnhub company news (30 days), keyword rules' : 'Yahoo Finance headline RSS (unofficial), keyword rules', ai: process.env.GEMINI_API_KEY ? 'Gemma / Gemini summaries for the 20 most-flagged names' : 'none',
    layoffs: WARN_SRC, hiring: 'Open jobs on public Greenhouse, Lever and Ashby job boards (adverts, not hires)',
  },
  errors,
  coverage: saved ? saved.coverage : { companies: universe.length, sec: subs.size, financials: rows.filter((r) => r.z != null || r.runwayMo != null || r.shareChgPct != null).length, prices: closes.size, news: news.size, goingConcernHits: gc.size, warnCompanies: [...warnBy.values()].filter(Boolean).length, jobBoards: jobsBy.size },
};
if (process.env.INPUTS_OUT) writeFileSync(process.env.INPUTS_OUT, JSON.stringify({ inputs, errors, coverage: file.coverage, sources: file.sources, layoffStates }));
mkdirSync('published', { recursive: true });
writeFileSync('published/distress.json', JSON.stringify(file));
// phone alerts: names on your alert list whose label changed since the last read
if (process.env.NTFY_TOPIC && prevRows.length) {
  const { distressAlerts, readTickers } = await import('../shared/alerts.js');
  const { sendAlert } = await import('../api/_lib/notify.js');
  let watch = new Set<string>();
  try { watch = new Set(readTickers(readFileSync('alerts/tickers.txt', 'utf8'))); } catch { /* none */ }
  for (const a of distressAlerts(prevRows, rows, watch, today).slice(0, 6)) { try { await sendAlert(a); } catch (e) { note('alerts', e); } }
}
console.log(`wrote published/distress.json: ${rows.length} rows, ${rows.filter((r) => r.label === 'distressed').length} distressed, ${rows.filter((r) => r.label === 'turnaround').length} turnarounds; errors: ${Object.keys(errors).join(', ') || 'none'}`);
