// Global → US routes (through /api/research):
//   fn=global      each region's indexes and the US-listed funds / ADRs that trade it, plus a two-year history check of how
//                  each index's day has lined up with SPY (Yahoo, unofficial, delayed)
//   fn=globalnews  world business headlines from 12 free feeds, tagged by region and by the US tickers linked to it
import { REGIONS, impliedSpy, linkStats, overnightLine, tagWorldNews, WORLD_FEEDS } from '../../../shared/global.js';
import { rssFeed } from '../adapters.js';
import { BIG_CAPS } from '../../../shared/feed.js';
import { COMPANIES } from '../../../shared/data/companies.js';
import { tagSymbols } from '../../../shared/news.js';

// names whose first word is generic ("Bank of America", "American Express", "General Motors") would tag unrelated
// headlines ("central bank"), so those match by ticker only
const GENERIC = /^(bank|american|general|united|international|first|national|energy|health|capital|global|the|texas|southern|union|progressive|public|digital|advanced|applied|automatic|marsh|charles|walt|home|eli|morgan|goldman|wells|procter|johnson|lockheed|northrop|thermo|intercontinental|s&p)$/i;
const NAMES: Record<string, string> = Object.fromEntries(COMPANIES.filter((c) => BIG_CAPS.includes(c[0]) && !GENERIC.test(c[1].split(/[\s,.]+/)[0])).map((c) => [c[0], c[1]]));
const TAGGABLE = COMPANIES.filter((c) => BIG_CAPS.includes(c[0])).map((c) => c[0]);
import { cached, json, ttl } from '../core.js';
import { longDaily } from '../yahoo.js';
import { yahooPx } from './worldmkt.js';

export async function global(): Promise<Response> {
  try {
    const idxSyms = REGIONS.flatMap((r) => r.indexes.map((i) => i.sym));
    const usSyms = REGIONS.flatMap((r) => r.us.map((u) => u.sym));
    const [px, spy, hist] = await Promise.all([
      cached('global:px', ttl(60, 300), () => yahooPx([...idxSyms, ...usSyms, 'ES=F'])).then((r) => r.val),
      cached('global:spy2y', 86400, () => longDaily('SPY', '2y')).then((r) => r.val).catch(() => null),
      Promise.all(idxSyms.map((s) => cached(`global:h:${s}`, 86400, () => longDaily(s, '2y')).then((r) => [s, r.val] as const).catch(() => [s, null] as const))),
    ]);
    const links = new Map(hist.map(([s, bars]) => [s, spy && bars ? linkStats(s, bars, spy) : null]));
    const q = (sym: string) => (px[sym] ? { last: px[sym].last, chgPct: px[sym].chgPct, at: px[sym].at } : null);
    const regions = REGIONS.map((r) => ({
      id: r.id, label: r.label,
      indexes: r.indexes.map((i) => { const l = links.get(i.sym) ?? null; const m = q(i.sym); return { ...i, quote: m, link: l, implied: impliedSpy(m?.chgPct ?? null, l) }; }),
      us: r.us.map((u) => ({ ...u, quote: q(u.sym) })),
    }));
    const moves = Object.fromEntries(idxSyms.map((s) => [s, px[s]?.chgPct ?? null]));
    return json({ regions, overnight: overnightLine(moves, px['ES=F']?.chgPct ?? null), futures: q('ES=F'), asOf: Date.now(), source: 'Yahoo Finance (unofficial, delayed). History: two years of daily bars; Asian indexes vs SPY\'s opening gap, others vs SPY\'s whole day.' }, { sMaxAge: 60 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

export async function globalnews(): Promise<Response> {
  const errors: Record<string, string> = {};
  const lists = await Promise.all(WORLD_FEEDS.map(async (f) => {
    try { return (await cached(`wf:${f.name}`, 600, () => rssFeed(f.name, f.url))).val; } catch (e) { errors[f.name] = (e as Error).message.slice(0, 80); return []; }
  }));
  const items = tagWorldNews(lists.flat().filter((x) => Date.now() - x.t < 2 * 86400_000), 150, (title) => tagSymbols(title, TAGGABLE, NAMES));
  return json({ items, errors, feeds: WORLD_FEEDS.map((f) => f.name), asOf: Date.now(), source: 'Public RSS feeds: BBC, CNBC World, Bloomberg, FT, Nikkei Asia, SCMP, Economic Times, DW, Euronews, Guardian, Al Jazeera, CNA. Headlines and links only.' }, { sMaxAge: 300 });
}
