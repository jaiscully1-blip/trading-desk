// GET /api/research?fn=feed&symbols=NVDA,AMD -> messages: earnings filings (SEC 8-K item 2.02, near real time), earnings
// calendar + beat/miss (Finnhub, delayed), Fed speeches/testimony and White House releases (RSS), and live streams (YouTube).
import { BIG_CAPS, earningsMessages, parseEdgar8k, parseYoutubeLive, type FeedItem } from '../../../shared/feed.js';
import { parseSecTickers, type SecTicker } from '../../../shared/company.js';
import { finnhubEarnings, getText, rssFeed, secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';
import { et as etOf } from '../../../shared/clock.js';

const RSS = [
  { kind: 'fed' as const, name: 'Fed speeches', url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
  { kind: 'fed' as const, name: 'Fed testimony', url: 'https://www.federalreserve.gov/feeds/testimony.xml' },
  { kind: 'fed' as const, name: 'Fed press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { kind: 'whitehouse' as const, name: 'White House', url: 'https://www.whitehouse.gov/briefings-statements/feed/' },
];
export const STREAMS = [
  { name: 'White House', handle: 'WhiteHouse' },
  { name: 'Federal Reserve', handle: 'federalreserve' },
  { name: 'C-SPAN', handle: 'cspan' },
  // financial news channels that stream on YouTube
  { name: 'Bloomberg TV', handle: 'markets' },
  { name: 'Yahoo Finance', handle: 'YahooFinance' },
  { name: 'CNBC', handle: 'CNBCtelevision' },
  { name: 'Schwab Network', handle: 'SchwabNetwork' },
  { name: 'Fox Business', handle: 'FoxBusiness' },
  { name: 'Reuters', handle: 'Reuters' },
];
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(req: Request): Promise<Response> {
  const mine = new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)));
  const want = new Set([...mine, ...BIG_CAPS]);
  const items: FeedItem[] = [];
  const sources: { name: string; ok: boolean; count: number; error?: string }[] = [];
  const run = async (name: string, f: () => Promise<FeedItem[]>) => {
    try { const r = await f(); items.push(...r); sources.push({ name, ok: true, count: r.length }); } catch (e) { sources.push({ name, ok: false, count: 0, error: (e as Error).message }); }
  };
  const now = Date.now();
  const jobs: Promise<void>[] = [];

  if (hasKey('sec')) jobs.push(run('SEC 8-K item 2.02', async () => {
    const [tick, filings] = await Promise.all([
      cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json'))),
      cached('sec:8k', 60, async () => parseEdgar8k(await secText('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&start=0&count=100&output=atom', 10000))),
    ]);
    const byCik = new Map<number, SecTicker>();
    for (const t of tick.val) if (!byCik.has(t.cik)) byCik.set(t.cik, t);
    return filings.val.filter((f) => f.items.includes('2.02')).map((f) => ({ f, t: byCik.get(f.cik) })).filter(({ t }) => t && want.has(t.ticker))
      .map(({ f, t }) => ({ id: `8k:${f.cik}:${f.t}`, t: f.t, kind: 'filing' as const, sym: t!.ticker, title: `${t!.ticker} just filed its earnings results`, text: `${f.company} filed an 8-K with Item 2.02 (Results of Operations). The press release is in the filing.`, url: f.url }));
  }));
  if (hasKey('finnhub')) jobs.push(run('Finnhub earnings', async () => {
    const from = ymd(now - 4 * 86400_000), to = ymd(now + 14 * 86400_000); // same window/cache as /api earnings
    const { val } = await cached(`earn:${from}:${to}`, 900, () => finnhubEarnings(from, to));
    const e = etOf(now), et = `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
    return earningsMessages(val.filter((r) => want.has(r.sym) && r.date >= ymd(now - 2 * 86400_000) && r.date <= et), et, now);
  }));
  for (const r of RSS) jobs.push(run(r.name, async () => (await cached(`rss:${r.name}`, 600, () => rssFeed(r.name, r.url))).val
    .filter((x) => now - x.t < 4 * 86400_000)
    .map((x) => ({ id: `${r.kind}:${x.url || x.title}`, t: x.t, kind: r.kind, title: x.title, text: r.name, url: x.url }))));
  jobs.push(run('YouTube live', async () => {
    const live = await Promise.all(STREAMS.map(async (s) => {
      try {
        const id = (await cached(`yt:${s.handle}`, 180, async () => parseYoutubeLive(await getText(`https://www.youtube.com/@${s.handle}/live`, 7000)))).val;
        return id ? [{ id: `live:${id}`, t: now, kind: 'live' as const, title: `${s.name} is live now`, text: s.name, url: `https://www.youtube.com/watch?v=${id}` }] : [];
      } catch { return []; }
    }));
    return live.flat();
  }));
  await Promise.all(jobs);
  items.sort((a, b) => a.t - b.t);
  return json({ items: items.slice(-200), sources, asOf: now }, { sMaxAge: 60 });
}
