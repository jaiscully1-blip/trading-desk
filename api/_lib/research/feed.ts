// GET /api/research?fn=feed&symbols=NVDA,AMD -> messages: earnings filings (SEC 8-K item 2.02, near real time), earnings
// calendar + beat/miss (Finnhub, delayed), Fed speeches/testimony and White House releases (RSS), and live streams (YouTube).
import { BIG_CAPS, earningsMessages, parseEdgar8k, parseYoutubeLive, type FeedItem } from '../../../shared/feed.js';
import { parseSecTickers, type SecTicker } from '../../../shared/company.js';
import { finnhubEarnings, getText, nasdaqEarnings, rssFeed, secJson, secText } from '../adapters.js';
import { parseNasdaqEarnings } from '../../../shared/eventsCal.js';
import { SYMBOL_RE, cached, hasKey, json, ttl } from '../core.js';
import { et as etOf } from '../../../shared/clock.js';
import { catalyst8k, insiderMessage, pairFilings, parseEdgarCurrent, stakeMessage, wireMessages } from '../../../shared/catalysts.js';
import { parseForm4 } from '../../../shared/insider.js';

/** Press-release wires with a free RSS feed (GlobeNewswire and Accesswire refuse automated requests). */
const WIRES = [
  { name: 'PR Newswire', url: 'https://www.prnewswire.com/rss/news-releases-list.rss' },
  { name: 'Business Wire', url: 'https://feed.businesswire.com/rss/home/?rss=G1QFDERJXkJeGVtRWA==' },
];
const current = (type: string, start = 0) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(type)}&company=&dateb=&owner=include&start=${start}&count=100&output=atom`;

const RSS = [
  { kind: 'fed' as const, name: 'Fed speeches', url: 'https://www.federalreserve.gov/feeds/speeches.xml' },
  { kind: 'fed' as const, name: 'Fed testimony', url: 'https://www.federalreserve.gov/feeds/testimony.xml' },
  { kind: 'fed' as const, name: 'Fed press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { kind: 'whitehouse' as const, name: 'White House', url: 'https://www.whitehouse.gov/briefings-statements/feed/' },
];
/** YouTube channels checked for a live stream (order = order of the chips: markets first, then world news, then government). */
export const STREAMS = [
  { name: 'Bloomberg TV', handle: 'markets' },
  { name: 'Yahoo Finance', handle: 'YahooFinance' },
  { name: 'CNBC', handle: 'CNBCtelevision' },
  { name: 'Schwab Network', handle: 'SchwabNetwork' },
  { name: 'Fox Business', handle: 'FoxBusiness' },
  { name: 'Reuters', handle: 'Reuters' },
  // world news channels that run 24/7 YouTube streams
  { name: 'Sky News', handle: 'SkyNews' },
  { name: 'Al Jazeera English', handle: 'aljazeeraenglish' },
  { name: 'DW News', handle: 'dwnews' },
  { name: 'France 24', handle: 'France24_en' },
  { name: 'NBC News NOW', handle: 'NBCNews' },
  { name: 'ABC News Live', handle: 'ABCNews' },
  { name: 'CBS News 24/7', handle: 'CBSNews' },
  { name: 'LiveNOW from FOX', handle: 'LiveNOWFOX' },
  { name: 'Euronews', handle: 'euronews' },
  // government
  { name: 'White House', handle: 'WhiteHouse' },
  { name: 'Federal Reserve', handle: 'federalreserve' },
  { name: 'C-SPAN', handle: 'cspan' },
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

  // shared by the SEC jobs: ticker map and the 300 most recent 8-Ks (100 scroll past the morning's earnings filings by the evening)
  const secTick = hasKey('sec') ? cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json'))).then((r) => {
    const m = new Map<number, SecTicker>();
    for (const t of r.val) if (!m.has(t.cik)) m.set(t.cik, t);
    return m;
  }) : null;
  const sec8k = hasKey('sec') ? cached('sec:8k', 60, async () => (await Promise.all([0, 100, 200].map((start) => secText(current('8-K', start), 10000).then(parseEdgar8k).catch(() => [] as ReturnType<typeof parseEdgar8k>)))).flat()) : null;
  secTick?.catch(() => {}); sec8k?.catch(() => {});

  if (hasKey('sec')) jobs.push(run('SEC 8-K item 2.02', async () => {
    const [byCik, filings] = await Promise.all([secTick!, sec8k!]);
    // every listed company that files results (yours and the big ones are no longer the only ones shown)
    const seen = new Set<string>();
    return filings.val.filter((f) => f.items.includes('2.02') && !seen.has(`${f.cik}:${f.t}`) && seen.add(`${f.cik}:${f.t}`)).map((f) => ({ f, t: byCik.get(f.cik) })).filter(({ t }) => !!t)
      .map(({ f, t }) => ({ id: `8k:${f.cik}:${f.t}`, t: f.t, kind: 'filing' as const, sym: t!.ticker, title: `${t!.ticker} just filed its earnings results`, text: `${f.company} filed an 8-K with Item 2.02 (Results of Operations). The press release is in the filing.`, url: f.url }));
  }));
  // other 8-K events (deals, exec changes, layoffs, delisting notices…) for your tickers and the big caps
  if (hasKey('sec')) jobs.push(run('SEC 8-K events', async () => {
    const [byCik, filings] = await Promise.all([secTick!, sec8k!]);
    const seen = new Set<string>();
    return filings.val.flatMap((f) => {
      const t = byCik.get(f.cik);
      if (!t || !want.has(t.ticker) || seen.has(`${f.cik}:${f.t}`)) return [];
      seen.add(`${f.cik}:${f.t}`);
      const m = catalyst8k(f, t.ticker);
      return m ? [m] : [];
    });
  }));
  // 5%+ stakes: every 13D (activist) on a listed company; 13G (passive) only for your tickers and the big caps
  if (hasKey('sec')) jobs.push(run('SEC 13D / 13G', async () => {
    const [byCik, d, g] = await Promise.all([secTick!,
      cached('sec:13d', 300, async () => parseEdgarCurrent(await secText(current('SCHEDULE 13D'), 10000))),
      cached('sec:13g', 300, async () => parseEdgarCurrent(await secText(current('SCHEDULE 13G'), 10000))),
    ]);
    return pairFilings([...d.val, ...g.val]).flatMap((p) => {
      const t = byCik.get(p.subject.cik);
      if (!t || (!/13D/i.test(p.form) && !want.has(t.ticker))) return [];
      return [stakeMessage(p, t.ticker)];
    });
  }));
  // insider buys and sells (Form 4) for your tickers and the big caps: the newest 12 filings are opened and read
  if (hasKey('sec')) jobs.push(run('SEC Form 4', async () => {
    const [byCik, list] = await Promise.all([secTick!,
      cached('sec:f4', 120, async () => (await Promise.all([0, 100].map((start) => secText(current('4', start), 10000).then(parseEdgarCurrent).catch(() => [])))).flat()),
    ]);
    const mine = pairFilings(list.val).filter((p) => want.has(byCik.get(p.subject.cik)?.ticker ?? '')).sort((a, b) => b.t - a.t).slice(0, 12);
    const out = await Promise.all(mine.map(async (p) => {
      try {
        const msg = (await cached(`f4:${p.acc}`, 86400, async () => {
          const base = `https://www.sec.gov/Archives/edgar/data/${p.subject.cik}/${p.acc.replace(/-/g, '')}/`;
          const idx = await secJson(`${base}index.json`);
          const xml = (idx?.directory?.item ?? []).map((x: any) => String(x.name)).find((n: string) => /\.xml$/i.test(n) && !/^(primary_doc|FilingSummary)/i.test(n));
          if (!xml) return null;
          return insiderMessage(parseForm4(await secText(base + xml, 8000), ymd(p.t), base + xml), byCik.get(p.subject.cik)!.ticker, p.acc, p.t, p.url);
        })).val;
        return msg ? [msg] : [];
      } catch { return []; }
    }));
    return out.flat();
  }));
  for (const w of WIRES) jobs.push(run(w.name, async () => wireMessages((await cached(`wire:${w.name}`, 300, () => rssFeed(w.name, w.url))).val.filter((x) => now - x.t < 2 * 86400_000), w.name)));
  jobs.push(run('Nasdaq earnings calendar', async () => {
    const e = etOf(now), et = `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
    const days = [ymd(now - 86400_000), et];
    const rows = (await Promise.all(days.map((d) => cached(`nq:earn:${d}`, ttl(1800, 6 * 3600), async () => parseNasdaqEarnings(await nasdaqEarnings(d), d)).then((r) => r.val).catch(() => [])))).flat();
    // yours, the big ones, and anything worth $2B or more
    const keep = rows.filter((r) => want.has(r.sym) || (r.mcap ?? 0) >= 2e9);
    return earningsMessages(keep.map((r) => ({ sym: r.sym, date: r.date, hour: r.when, epsEst: r.epsEst, epsAct: r.epsAct, revEst: r.revEst, revAct: null })), et, now)
      .map((m) => ({ ...m, id: `nq:${m.id}` }));
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
    const live = await Promise.all(STREAMS.map(async (s, i) => {
      try {
        const id = (await cached(`yt:${s.handle}`, 180, async () => parseYoutubeLive(await getText(`https://www.youtube.com/@${s.handle}/live`, 7000)))).val;
        return id ? [{ id: `live:${id}`, t: now - (STREAMS.length - i), kind: 'live' as const, title: `${s.name} is live now`, text: s.name, url: `https://www.youtube.com/watch?v=${id}` }] : [];
      } catch { return []; }
    }));
    return live.flat();
  }));
  await Promise.all(jobs);
  items.sort((a, b) => a.t - b.t);
  return json({ items: items.slice(-400), sources, asOf: now }, { sMaxAge: 60 });
}
