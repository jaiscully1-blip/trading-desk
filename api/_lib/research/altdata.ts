// Alt Data routes (through /api/research):
//   fn=altdata&symbol=HOOD     that ticker's daily history from published/altdata.json (jobs, App Store rank, Steam, GitHub, Reddit, StockTwits)
//   fn=wikiviews&symbol=&name=  Wikipedia pageviews for the company's article, daily for two years (public interest proxy)
//   fn=stocktwits&symbol=HOOD   live StockTwits: watchers and the bullish / bearish tags on the latest 30 messages
//   fn=pricebasket              BLS average retail prices (eggs, milk, gas, ...) from FRED's public CSVs, last 26 months
import { cached, getJson, json, take } from '../core.js';
import { getText } from '../adapters.js';
import { GITHUB_ORGS, JOB_BOARDS, APP_PUBLISHERS, PRICE_BASKET, STEAM_GAMES, series, type AltFile } from '../../../shared/altdata.js';
import { COMPANIES } from '../../../shared/data/companies.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;

async function altFile(): Promise<AltFile | null> {
  if (!process.env.VERCEL) { try { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync('published/altdata.json', 'utf8')); } catch { /* fall through */ } }
  try { return (await cached('altdata:file', 1800, () => getJson(`https://raw.githubusercontent.com/${REPO}/main/published/altdata.json`, 'github', 10000))).val as AltFile; } catch { return null; }
}

export async function altdata(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const f = await altFile();
  if (!f) return json({ error: 'not-run-yet' });
  const games = STEAM_GAMES[sym] ?? [];
  return json({
    sym, updated: f.updated, days: Object.keys(f.days).length,
    jobs: JOB_BOARDS[sym] ? { board: JOB_BOARDS[sym], s: series(f, 'jobs', sym) } : null,
    apps: APP_PUBLISHERS[sym] ? { publishers: APP_PUBLISHERS[sym], s: series(f, 'apps', sym) } : null,
    steam: games.map((g) => ({ ...g, s: series(f, 'steam', String(g.id)) })),
    github: GITHUB_ORGS[sym] ? { org: GITHUB_ORGS[sym], s: series(f, 'github', sym), latest: Object.entries(f.days).sort((a, b) => b[0].localeCompare(a[0])).map(([, d]) => d.github?.[sym]).find(Boolean) ?? null } : null,
    reddit: series(f, 'reddit', sym), twits: series(f, 'twits', sym),
    coverage: { jobs: Object.keys(JOB_BOARDS), apps: Object.keys(APP_PUBLISHERS), steam: Object.keys(STEAM_GAMES), github: Object.keys(GITHUB_ORGS) },
    source: 'Daily snapshot by the desk (GitHub Action): Greenhouse / Lever / Ashby public job boards, Apple App Store top-free chart (US), Steam Web API, GitHub API, ApeWisdom (Reddit), StockTwits. History starts the day tracking began.',
  }, { sMaxAge: 900 });
}

export async function wikiviews(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase();
  const name = (u.searchParams.get('name') ?? COMPANIES.find((c) => c[0] === sym)?.[1] ?? '').replace(/[^\w .&'-]/g, '').slice(0, 80);
  if (!name) return json({ error: 'needs a company name' }, { status: 400 });
  try {
    const { val } = await cached(`wv:${name}`, 12 * 3600, async () => {
      if (!take('wikipedia', 2)) throw new Error('rate limited');
      const s = await getJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${name} company`)}&srlimit=1&format=json&origin=*`, 'wikipedia', 8000);
      const title = s?.query?.search?.[0]?.title;
      if (!title) throw new Error(`No Wikipedia article found for ${name}`);
      const end = new Date(), start = new Date(Date.UTC(end.getUTCFullYear() - 2, end.getUTCMonth(), 1));
      const f = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      const pv = await getJson(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${f(start)}/${f(end)}`, 'wikipedia', 10000, { headers: { 'user-agent': 'trade-desk-research/0.1 (personal project)' } });
      const days = (pv?.items ?? []).map((x: any) => ({ date: `${x.timestamp.slice(0, 4)}-${x.timestamp.slice(4, 6)}-${x.timestamp.slice(6, 8)}`, value: Number(x.views) || 0 }));
      return { title, days };
    });
    return json({ ...val, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(val.title.replace(/ /g, '_'))}`, source: 'Wikimedia pageviews API (human views of the English Wikipedia article, daily). A proxy for public interest; Google search volume has no free API.' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

export async function stocktwits(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  try {
    const { val } = await cached(`st:${sym}`, 600, async () => {
      if (!take('stocktwits')) throw new Error('rate limited');
      const j = await getJson(`https://api.stocktwits.com/api/2/streams/symbol/${sym}.json`, 'stocktwits', 8000);
      const msgs: any[] = j?.messages ?? [];
      const bull = msgs.filter((m) => m?.entities?.sentiment?.basic === 'Bullish').length, bear = msgs.filter((m) => m?.entities?.sentiment?.basic === 'Bearish').length;
      const ts = msgs.map((m) => Date.parse(m.created_at)).filter(Number.isFinite).sort((a, b) => a - b);
      const spanH = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 3_600_000 : null;
      return { watchers: j?.symbol?.watchlist_count ?? null, n: msgs.length, bull, bear, perHour: spanH ? msgs.length / Math.max(spanH, 0.05) : null };
    });
    return json({ sym, ...val, source: 'StockTwits public stream (latest 30 messages; sentiment is what posters tagged)' }, { sMaxAge: 600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

export async function pricebasket(): Promise<Response> {
  try {
    const { val } = await cached('basket', 12 * 3600, async () => Promise.all(PRICE_BASKET.map(async (p) => {
      try {
        const csv = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${p.id}`, 10000);
        const rows = csv.trim().split('\n').slice(1).map((l) => l.split(',')).filter((r) => r[1] && r[1] !== '.').map((r) => ({ date: r[0], value: Number(r[1]) })).filter((r) => Number.isFinite(r.value));
        return { ...p, s: rows.slice(-26) };
      } catch { return { ...p, s: [] }; }
    })));
    return json({ items: val, source: 'U.S. Bureau of Labor Statistics average retail prices, via FRED (monthly, about two weeks after the month ends)' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
