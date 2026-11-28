// Nightly Global trends collector -> published/trends.json (one record per thing, first / last seen per country). Run by
// .github/workflows/trends.yml. Free public sources only; a source that fails is skipped for the night and listed in
// `errors` (never filled in). Research, not advice; nothing here can trade. Run locally:
//   SEC_USER_AGENT="your-app contact@example.com" npx --yes tsx@4.19.2 scripts/trends-build.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpsc, fda } from '../shared/wmon';
import { BAN_FEEDS, COUNTRIES, WIKI_LANGS, addNews, addRaises, banUrl, gnewsItems, type News, appleTop, emptyDb, formdDoc, formdHits, ghRising, hfTrending, kworbTop, mergeNight, phFeed, prune, steamTop, wikiTop, type Item, type Raise, type TrendDb } from '../shared/globaltrends';

const OUT = process.env.TRENDS_OUT ?? 'published/trends.json';
const UA = 'Mozilla/5.0 (compatible; trade-desk-research/0.1; personal research project)';
const SEC_UA = process.env.SEC_USER_AGENT;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, kind: 'json' | 'text' = 'json', headers: Record<string, string> = {}): Promise<any> {
  for (let i = 0; i < 3; i++) {
    let r: Response;
    try { r = await fetch(url, { headers: { 'user-agent': UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(45000) }); }
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
// Form D window: since the last collection (every 2 weeks), at most 31 days; filings already saved are skipped
const day0 = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fdFrom = process.env.TRENDS_FD_FROM ?? day0(Math.max(Date.now() - 31 * 86400_000, prev.updated ? Date.parse(`${prev.updated}T00:00:00Z`) - 86400_000 : Date.now() - 15 * 86400_000)), fdTo = process.env.TRENDS_FD_TO ?? today;

/** Run jobs a few at a time (each with a pause after it), so a slow source does not hold up the whole night. */
async function pool<T>(jobs: T[], n: number, run: (j: T) => Promise<void>, pauseMs: number) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (i < jobs.length) { const j = jobs[i++]; await run(j); await sleep(pauseMs); } }));
}
// charts per country, by source: Apple (slowest, 4 at a time), Steam (3), Spotify via Kworb (2, it is a small site)
await pool(COUNTRIES.flatMap((c) => (['top-free', 'top-paid'] as const).map((feed) => ({ c, feed }))), 4, ({ c, feed }) =>
  tryAdd(`apps ${c.cc} ${feed}`, items, async () => appleTop(await get(`https://rss.marketingtools.apple.com/api/v2/${c.cc}/apps/${feed}/25/apps.json`), c.cc, feed === 'top-free' ? 'apps-free' : 'apps-paid')), 300);
await pool(COUNTRIES.filter((c) => c.steam), 3, (c) => tryAdd(`steam ${c.cc}`, items, async () => steamTop(await get(`https://store.steampowered.com/api/featuredcategories?cc=${c.cc}&l=english`), c.cc)), 800);
await pool(COUNTRIES.filter((c) => c.spotify), 2, (c) => tryAdd(`music ${c.cc}`, items, async () => kworbTop(await get(`https://kworb.net/spotify/country/${c.cc}_daily.html`, 'text'), c.cc)), 1500);
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
    for (let from = 0; from < 10000; from += 100) {
      const j = await get(`https://efts.sec.gov/LATEST/search-index?q=%22%22&forms=D&dateRange=custom&startdt=${fdFrom}&enddt=${fdTo}&from=${from}`, 'json', { 'user-agent': SEC_UA });
      hits.push(...formdHits(j));
      if ((j?.hits?.hits?.length ?? 0) < 100) break;
      await sleep(300);
    }
    for (const h of hits.filter((x) => !have.has(x.adsh)).slice(0, 8000)) {
      try {
        const xml = await get(`https://www.sec.gov/Archives/edgar/data/${h.cik}/${h.adsh.replace(/-/g, '')}/primary_doc.xml`, 'text', { 'user-agent': SEC_UA });
        const r = formdDoc(xml, h); if (r) raises.push(r);
      } catch (e) { errors.push(`form D ${h.adsh}: ${(e as Error).message}`); }
      await sleep(110); // SEC allows 10 requests a second
    }
  } catch (e) { errors.push(`form D search: ${(e as Error).message}`); }
}

// ban watch: one Google News search per country in its own language (slowly: Google rate-limits), and US recalls
const news: News[] = [];
for (const f of BAN_FEEDS) {
  try { news.push(...gnewsItems(await get(banUrl(f), 'text'), f.cc)); } catch (e) { errors.push(`bans ${f.cc}: ${(e as Error).message}`); }
  await sleep(6000);
}
const asNews = (ev: { id: string; title: string; url?: string; t: number }[], source: string): News[] => ev.filter((e) => e.title && Number.isFinite(e.t)).map((e) => ({ id: e.id, cc: 'us', title: e.title, url: e.url ?? '', source, date: new Date(e.t).toISOString().slice(0, 10), kind: 'recall' as const }));
try { news.push(...asNews(cpsc(await get(`https://www.saferproducts.gov/RestWebServices/Recall?format=json&RecallDateStart=${new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10)}`)), 'CPSC')); } catch (e) { errors.push(`recalls CPSC: ${(e as Error).message}`); }
try { news.push(...asNews(fda(await get('https://api.fda.gov/food/enforcement.json?limit=15&sort=report_date:desc')), 'FDA')); } catch (e) { errors.push(`recalls FDA: ${(e as Error).message}`); }

let db = mergeNight(prev, items, today);
db = addNews(db, news, today);
db = addRaises(db, raises);
db = prune(db, today);
// Wikipedia's lists churn every day: keep those records 30 days, not 120, so the file stays small
const cut30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
for (const [k, r] of Object.entries(db.items)) if (r.src === 'wiki' && !Object.values(r.seen).some((s) => s.last >= cut30)) delete db.items[k];
db.errors = errors.slice(0, 60);
writeFileSync(OUT, JSON.stringify(db));
console.log(`${today}: ${items.length} list entries, ${news.length} ban / recall headlines, ${Object.keys(db.items).length} records, ${raises.length} new raises (${raises.filter((r) => !r.fund).length} companies), ${errors.length} errors, ${(JSON.stringify(db).length / 1024).toFixed(0)} KB`);
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
