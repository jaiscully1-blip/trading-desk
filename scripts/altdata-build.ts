// Daily alt-data snapshot -> published/altdata.json (one row per day, kept ~2 years). Run by .github/workflows/altdata.yml.
// Free public sources only; a source that fails is skipped for the day (never filled in). Run locally:
//   npx tsx scripts/altdata-build.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AIRLINES, AIRPORTS, countAirlines, countNear } from '../shared/realecon';
import { APP_PUBLISHERS, GITHUB_ORGS, JOB_BOARDS, STEAM_GAMES, STOCKTWITS_DAILY, appRank, countJobs, jobsUrl, prune, type AltDay, type AltFile } from '../shared/altdata';

const FILE = 'published/altdata.json';
const UA = { 'user-agent': 'trade-desk-research/0.1 (personal project)' };
const today = new Date().toISOString().slice(0, 10);
const errors: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const day: AltDay = {};

// job openings
day.jobs = {};
for (const [sym, [ats, slug]] of Object.entries(JOB_BOARDS)) {
  try { const n = countJobs(await get(jobsUrl(ats, slug))); if (n != null) day.jobs[sym] = n; } catch (e) { errors.push(`jobs ${sym}: ${(e as Error).message}`); }
  await sleep(300);
}

// App Store rank (US top free, top 100: the 200 list is slow to answer)
try {
  const j = await get('https://rss.applemarketingtools.com/api/v2/us/apps/top-free/100/apps.json');
  const results = j?.feed?.results ?? [];
  day.apps = {};
  for (const [sym, pubs] of Object.entries(APP_PUBLISHERS)) { const r = appRank(results, pubs); if (r != null) day.apps[sym] = r; }
} catch (e) { errors.push(`apps: ${(e as Error).message}`); }

// Steam players right now (one reading a day, same time)
day.steam = {};
for (const games of Object.values(STEAM_GAMES)) for (const g of games) {
  try { const j = await get(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${g.id}`); const n = j?.response?.player_count; if (typeof n === 'number') day.steam[String(g.id)] = n; } catch (e) { errors.push(`steam ${g.id}: ${(e as Error).message}`); }
}

// GitHub: repos pushed in the last 30 days (of the 100 most recently pushed), their stars, and public repo count
day.github = {};
const gh = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
for (const [sym, org] of Object.entries(GITHUB_ORGS)) {
  try {
    const [o, repos] = await Promise.all([get(`https://api.github.com/orgs/${org}`, gh), get(`https://api.github.com/orgs/${org}/repos?per_page=100&sort=pushed`, gh)]);
    const cut = Date.now() - 30 * 86400_000;
    const recent = (repos as any[]).filter((r) => Date.parse(r.pushed_at) >= cut);
    day.github[sym] = { repos: Number(o.public_repos) || 0, pushed30: recent.length, stars: recent.reduce((s, r) => s + (Number(r.stargazers_count) || 0), 0) };
  } catch (e) { errors.push(`github ${sym}: ${(e as Error).message}`); }
}

// Reddit mentions (ApeWisdom, all stocks, 24 h)
try {
  day.reddit = {};
  for (let p = 1; p <= 3; p++) {
    const j = await get(`https://apewisdom.io/api/v1.0/filter/all-stocks/page/${p}`);
    for (const r of j?.results ?? []) if (r?.ticker && Number.isFinite(Number(r.mentions))) day.reddit[String(r.ticker)] = Number(r.mentions);
    await sleep(500);
  }
} catch (e) { errors.push(`reddit: ${(e as Error).message}`); }

// StockTwits watchers
day.twits = {};
for (const sym of STOCKTWITS_DAILY) {
  try { const j = await get(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`); const n = j?.symbol?.watchlist_count; if (typeof n === 'number') day.twits[sym] = n; } catch (e) { errors.push(`stocktwits ${sym}: ${(e as Error).message}`); }
  await sleep(400);
}

// air traffic: airborne flights per airline, aircraft within 40 km of big airports (OpenSky, anonymous)
try {
  const all = await get('https://opensky-network.org/api/states/all');
  const al = countAirlines(all?.states ?? []);
  day.air = {};
  for (const a of AIRLINES) day.air[a.prefix] = al[a.prefix] ?? 0;
  for (const p of AIRPORTS) { const c = countNear(all?.states ?? [], p.lat, p.lon); day.air[p.code] = c.airborne + c.ground; }
} catch (e) { errors.push(`air: ${(e as Error).message}`); }

const old: AltFile = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { version: 1, updated: '', days: {} };
// a second run on the same day keeps what the first run got for anything that failed this time
const prev = old.days[today] ?? {};
const merged: AltDay = {};
for (const k of ['jobs', 'apps', 'steam', 'github', 'reddit', 'twits', 'air'] as const) merged[k] = { ...(prev[k] ?? {}), ...(day[k] ?? {}) } as never;
const out = prune({ version: 1, updated: new Date().toISOString(), days: { ...old.days, [today]: merged } }, today);
writeFileSync(FILE, JSON.stringify(out));
console.log(`altdata ${today}: jobs ${Object.keys(day.jobs ?? {}).length}, apps ${Object.keys(day.apps ?? {}).length}, steam ${Object.keys(day.steam ?? {}).length}, github ${Object.keys(day.github ?? {}).length}, reddit ${Object.keys(day.reddit ?? {}).length}, stocktwits ${Object.keys(day.twits ?? {}).length}${errors.length ? ` · skipped: ${errors.join('; ')}` : ''}`);
