// GET /api/research?fn=morning&symbols=NVDA,AMD -> the Morning page: premarket movers, sector and index ETFs,
// your watchlist's premarket, and the best setups with a buy / sell / wait bias and the reasons behind it.
// Sources: TradingView public screener (~15 min delayed premarket), Yahoo daily history for the quant read,
// the desk's cached headlines for catalysts, and an optional Gemini summary (rule-based summary when it isn't available).
import { INDEX_ETFS, PM_ACTIVE_BODY, SECTOR_ETFS, parsePmScan, pmListBody, ruleSummary, setupFor, type PmRow, type Setup } from '../../../shared/morning.js';
import { tagSymbols } from '../../../shared/news.js';
import { et } from '../../../shared/clock.js';
import type { QuantRead } from '../../../shared/quant.js';
import { FEEDS, finnhubMarketNews, geminiJson, rssFeed } from '../adapters.js';
import { SYMBOL_RE, cached, getJson, hasKey, json, take, ttl } from '../core.js';
import { quantCached } from './markets.js';

const TV_HEADERS = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)', origin: 'https://www.tradingview.com' };
async function tv(body: object): Promise<PmRow[]> {
  if (!take('tradingview')) throw new Error('TradingView screener budget used up for this minute');
  return parsePmScan(await getJson('https://scanner.tradingview.com/america/scan', 'tradingview', 12000, { method: 'POST', body: JSON.stringify(body), headers: TV_HEADERS }));
}

/** 'premarket' from 4:00 to 16:00 ET on weekdays (premarket numbers are today's); otherwise the last session. */
function phase(now = Date.now()): 'premarket' | 'day' {
  const e = et(now);
  return e.wd >= 1 && e.wd <= 5 && e.sod >= 4 * 3600 && e.sod < 16 * 3600 ? 'premarket' : 'day';
}

/** Last 36h of desk headlines (same feeds and cache keys as /api/news; RSS is free, Finnhub only when keyed). */
async function deskHeadlines(): Promise<{ title: string; url: string; t: number; src: string }[]> {
  const out: { title: string; url: string; t: number; src: string }[] = [];
  await Promise.all(FEEDS.map(async (f) => { try { out.push(...(await cached(`rss:${f.name}`, ttl(300, 1800), () => rssFeed(f.name, f.url))).val); } catch { /* optional */ } }));
  if (hasKey('finnhub')) { try { for (const n of (await cached('fh:general', ttl(180, 900), finnhubMarketNews)).val) out.push({ title: n.headline, url: n.url, t: n.t, src: n.source || 'Finnhub' }); } catch { /* optional */ } }
  return out.filter((x) => Date.now() - x.t < 36 * 3600_000).sort((a, b) => b.t - a.t);
}

const SUMMARY_SCHEMA = { type: 'object', properties: { summary: { type: 'string' }, watch: { type: 'array', items: { type: 'string' } } }, required: ['summary'] };

export async function GET(req: Request): Promise<Response> {
  const watch = [...new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 40);
  const kind = phase();
  const errors: Record<string, string> = {};
  const bucket = Math.floor(Date.now() / 600_000); // 10-minute buckets keep the screener well inside its budget

  let active: PmRow[] = [];
  try { active = (await cached(`am:active:${kind}`, 600, async () => {
    const rows = await tv(kind === 'premarket' ? PM_ACTIVE_BODY : { ...PM_ACTIVE_BODY, filter: PM_ACTIVE_BODY.filter.slice(0, 3), sort: { sortBy: 'volume', sortOrder: 'desc' } });
    if (!rows.length) throw new Error('screener returned no rows');
    return rows;
  })).val; } catch (e) { errors.movers = (e as Error).message.slice(0, 160); }

  const listSyms = [...new Set([...INDEX_ETFS.map((x) => x[0]), ...SECTOR_ETFS.map((x) => x[0]), ...watch])];
  let list: PmRow[] = [];
  try { list = (await cached(`am:list:${listSyms.join(',')}`, 600, () => tv(pmListBody(listSyms)))).val; } catch (e) { errors.etfs = (e as Error).message.slice(0, 160); }
  const by = new Map(list.map((r) => [r.sym, r]));
  const mv = (r: PmRow) => (kind === 'premarket' ? r.pmChg : r.chg);

  const gainers = active.filter((r) => (mv(r) ?? 0) > 0).sort((a, b) => mv(b)! - mv(a)!).slice(0, 12);
  const losers = active.filter((r) => (mv(r) ?? 0) < 0).sort((a, b) => mv(a)! - mv(b)!).slice(0, 12);

  // setups: biggest liquid movers + watchlist names that are moving
  const watchRows = watch.map((s) => by.get(s)).filter((r): r is PmRow => !!r);
  const cands = [...new Map([...watchRows.filter((r) => Math.abs(mv(r) ?? 0) >= 1), ...gainers.slice(0, 6), ...losers.slice(0, 6)].map((r) => [r.sym, r])).values()].slice(0, 14);
  const heads = await deskHeadlines();
  const names = Object.fromEntries(cands.map((r) => [r.sym, r.name.replace(/\b(inc|corp(oration)?|holdings?|ltd|plc|co|class [a-c])\b\.?/gi, '').trim()]));
  const quants = new Map<string, QuantRead | null>();
  await Promise.all(cands.map(async (r) => { try { quants.set(r.sym, (await quantCached(r.sym)).val); } catch { quants.set(r.sym, null); } }));
  const setups: Setup[] = cands.map((r) => {
    const h = heads.find((n) => tagSymbols(n.title, [r.sym], names).includes(r.sym));
    return setupFor(r, quants.get(r.sym) ?? null, h ? { title: h.title, url: h.url, src: h.src } : undefined);
  }).sort((a, b) => b.score - a.score).slice(0, 8);

  const indexes = INDEX_ETFS.map(([s, label]) => ({ ...(by.get(s) ?? null), sym: s, label })).filter((r) => 'close' in r) as (PmRow & { label: string })[];
  const sectors = SECTOR_ETFS.map(([s, label]) => ({ ...(by.get(s) ?? null), sym: s, label })).filter((r) => 'close' in r) as (PmRow & { label: string })[];

  // summary: Gemini (free tier, cached per 10-minute bucket) when keyed, else the rule-based one
  const rule = ruleSummary(indexes, sectors, setups, kind);
  let summary = rule, summarySrc = 'rules';
  if (hasKey('gemini') && setups.length) {
    try {
      const run = cached(`am:sum:${bucket}`, 1200, async () => {
        if (!take('gemini')) throw new Error('Gemini budget used up');
        const facts = { phase: kind, indexes: indexes.map((r) => ({ sym: r.sym, move: mv(r) })), sectors: sectors.map((r) => ({ sym: r.sym, label: r.label, move: mv(r) })), setups: setups.map((s) => ({ sym: s.sym, bias: s.bias, move: +s.move.toFixed(2), quant: s.quant?.label, news: s.catalyst?.title })) };
        const { data } = await geminiJson(`You write the 8am briefing for a swing-momentum stock trader. Using ONLY these facts (no outside knowledge, no prices that are not given), write 3-4 short plain sentences: what the market is doing ${kind === 'premarket' ? 'premarket' : 'in the last session'}, which sectors lead and lag, and which 2-4 tickers are worth watching and why. No hype, no guarantees, say "bias" not "will". Facts: ${JSON.stringify(facts)}`, SUMMARY_SCHEMA);
        const s = String(data?.summary ?? '').trim();
        if (!s) throw new Error('empty summary');
        return s.slice(0, 900);
      }).then((r) => r.val);
      summary = await Promise.race([run, new Promise<string>((_, rej) => setTimeout(() => rej(new Error('summary timeout')), 8000))]);
      summarySrc = 'gemini';
    } catch (e) { errors.summary = (e as Error).message.slice(0, 120); }
  }

  return json({
    phase: kind, indexes, sectors, gainers, losers, watch: watchRows, setups, summary, summarySrc, errors, asOf: Date.now(),
    source: 'TradingView public screener (~15 min delayed) · Yahoo daily history (quant read) · desk headlines',
  }, { sMaxAge: 300 });
}
