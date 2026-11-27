// Nightly Global trends collector -> published/trends.json (one record per thing, first / last seen per country). Run by
// .github/workflows/trends.yml. Free public sources only; a source that fails is skipped for the night and listed in
// `errors` (never filled in). Research, not advice; nothing here can trade. Run locally:
//   SEC_USER_AGENT="your-app contact@example.com" npx --yes tsx@4.19.2 scripts/trends-build.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES, WIKI_LANGS, addRaises, appleTop, emptyDb, formdDoc, formdHits, ghRising, hfTrending, kworbTop, mergeNight, phFeed, prune, steamTop, wikiTop, type Item, type Raise, type TrendDb } from '../shared/globaltrends';

const OUT = process.env.TRENDS_OUT ?? 'published/trends.json';
const UA = 'Mozilla/5.0 (compatible; trade-desk-research/0.1; personal research project)';
const SEC_UA = process.env.SEC_USER_AGENT;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
// Form D window: the last 3 days (weekends and holidays have no filings; filings already saved are skipped)
const fdFrom = process.env.TRENDS_FD_FROM ?? new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10), fdTo = process.env.TRENDS_FD_TO ?? today;
const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, kind: 'json' | 'text' = 'json', headers: Record<string, string> = {}): Promise<any> {
  for (let i = 0; i < 3; i++) {
    let r: Response;
    try { r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(30000) }); }
    catch (e) { if (i < 2) { await sleep(3000 * (i + 1)); continue; } throw e; } // timeouts and dropped connections: try again
    if (r.status === 429 || r.status >= 500) { await sleep(4000 * (i + 1)); continue; } // back off, then try again
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return kind === 'json' ? r.json() : r.text();
  }
  throw new Error('no answer after 3 tries');
}
const tryAdd = async (label: string, items: Item[], f: () => Promise<Item[]>) => { try { const x = await f(); if (!x.length) errors.push(`${label}: empty`); items.push(...x); } catch (e) { errors.push(`${label}: ${(e as Error).message}`); } };

const prev: TrendDb = (() => { try { return existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : emptyDb(); } catch { return emptyDb(); } })();
const items: Item[] = [];

for (const c of COUNTRIES) {
  for (const [feed, src] of [['top-free', 'apps-free'], ['top-paid', 'apps-paid']] as const) {
    await tryAdd(`apps ${c.cc} ${feed}`, items, async () => appleTop(await get(`https://rss.marketingtools.apple.com/api/v2/${c.cc}/apps/${feed}/25/apps.json`), c.cc, src));
    await sleep(300);
  }
  if (c.steam) { await tryAdd(`steam ${c.cc}`, items, async () => steamTop(await get(`https://store.steampowered.com/api/featuredcategories?cc=${c.cc}&l=english`), c.cc)); await sleep(800); }
  if (c.spotify) { await tryAdd(`music ${c.cc}`, items, async () => kworbTop(await get(`https://kworb.net/spotify/country/${c.cc}_daily.html`, 'text'), c.cc)); await sleep(1500); }
}
// Wikipedia publishes a day's most-read list the next day: read yesterday's
const [y, m, d] = yesterday.split('-');
for (const lang of WIKI_LANGS) {
  await tryAdd(`wiki ${lang}`, items, async () => wikiTop(await get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${y}/${m}/${d}`), lang, 15));
  await sleep(300);
}
await tryAdd('ai models', items, async () => hfTrending(await get('https://huggingface.co/api/models?sort=trendingScore&limit=30')));
const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
await tryAdd('github', items, async () => ghRising(await get(`https://api.github.com/search/repositories?q=created:%3E${weekAgo}&sort=stars&order=desc&per_page=30`, 'json', process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})));
await tryAdd('launches', items, async () => phFeed(await get('https://www.producthunt.com/feed', 'text')));

// US startups raising money: the last few days' new Form D filings, each read for industry and amount (SEC asks for
// a named user agent and at most 10 requests a second)
const raises: Raise[] = [];
if (!SEC_UA) errors.push('form D: SEC_USER_AGENT not set, skipped');
else {
  try {
    const have = new Set(prev.raises.map((r) => r.adsh));
    const hits: ReturnType<typeof formdHits> = [];
    for (let from = 0; from < 1000; from += 100) {
      const j = await get(`https://efts.sec.gov/LATEST/search-index?q=%22%22&forms=D&dateRange=custom&startdt=${fdFrom}&enddt=${fdTo}&from=${from}`, 'json', { 'user-agent': SEC_UA });
      hits.push(...formdHits(j));
      if ((j?.hits?.hits?.length ?? 0) < 100) break;
      await sleep(300);
    }
    for (const h of hits.filter((x) => !have.has(x.adsh)).slice(0, 400)) {
      try {
        const xml = await get(`https://www.sec.gov/Archives/edgar/data/${h.cik}/${h.adsh.replace(/-/g, '')}/primary_doc.xml`, 'text', { 'user-agent': SEC_UA });
        const r = formdDoc(xml, h); if (r) raises.push(r);
      } catch (e) { errors.push(`form D ${h.adsh}: ${(e as Error).message}`); }
      await sleep(150);
    }
  } catch (e) { errors.push(`form D search: ${(e as Error).message}`); }
}

let db = mergeNight(prev, items, today);
db = addRaises(db, raises);
db = prune(db, today);
// Wikipedia's lists churn every day: keep those records 30 days, not 120, so the file stays small
const cut30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
for (const [k, r] of Object.entries(db.items)) if (r.src === 'wiki' && !Object.values(r.seen).some((s) => s.last >= cut30)) delete db.items[k];
db.errors = errors.slice(0, 60);
writeFileSync(OUT, JSON.stringify(db));
console.log(`${today}: ${items.length} list entries, ${Object.keys(db.items).length} records, ${raises.length} new raises (${raises.filter((r) => !r.fund).length} companies), ${errors.length} errors, ${(JSON.stringify(db).length / 1024).toFixed(0)} KB`);
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
