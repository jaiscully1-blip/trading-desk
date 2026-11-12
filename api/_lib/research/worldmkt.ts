// World markets routes (all through /api/research):
//   fn=world&set=indices|futures|fx  quotes with intraday sparklines (Yahoo, unofficial, delayed; FX falls back to ECB daily rates)
//   fn=halts                         trading halts and volatility pauses today (Nasdaq Trader RSS, official, covers all US listings)
//   fn=idxmovers&index=spx|ndx       which stocks added or took away the most from the index today (cap-weighted approximation)
import { COMPANIES } from '../../../shared/data/companies.js';
import { FUTURES, FX_PAIRS, WORLD_INDICES, currencyStrength, fxFromFrankfurter, indexMovers, parseHalts, parseNdxList, parseSparkPx, type Px } from '../../../shared/worldmkt.js';
import { etToUtc } from '../../../shared/clock.js';
import { fredHistory, getText } from '../adapters.js';
import { cached, getJson, hasKey, json, take, ttl } from '../core.js';
import { ACTIVE_UNDERLYINGS, CURVE, RATES, at, chainActivity, mostActive, parseHyperliquid, yieldCurve } from '../../../shared/optrates.js';
import { parseCboe, type Chain } from '../../../shared/gamma.js';
import { YH_HEADERS } from '../yahoo.js';
import { snapshot } from './markets.js';

const SETS = { indices: WORLD_INDICES, futures: FUTURES, fx: FX_PAIRS };
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function yahooPx(syms: string[]): Promise<Record<string, Px>> {
  const out: Record<string, Px> = {};
  for (let i = 0; i < syms.length; i += 20) {
    if (!take('yahoo')) break;
    const b = syms.slice(i, i + 20);
    Object.assign(out, parseSparkPx(await getJson(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${b.map(encodeURIComponent).join(',')}&range=1d&interval=15m`, 'yahoo', 9000, { headers: YH_HEADERS })));
  }
  return out;
}

export async function world(req: Request): Promise<Response> {
  const set = (new URL(req.url).searchParams.get('set') ?? 'indices') as keyof typeof SETS;
  const list = SETS[set];
  if (!list) return json({ error: 'set must be indices, futures or fx' }, { status: 400 });
  let px: Record<string, Px> = {}, source = 'Yahoo Finance (unofficial, about 15 min delayed; FX and futures near real time)', err = '';
  try { px = (await cached(`world:${set}`, ttl(60, 300), () => yahooPx(list.map((x) => x.sym)))).val; } catch (e) { err = (e as Error).message.slice(0, 120); }
  if (set === 'fx' && Object.keys(px).length < 4) {
    try {
      const { val } = await cached('fx:ecb', 3600, async () => {
        const latest = await getJson('https://api.frankfurter.dev/v1/latest?base=USD', 'yahoo', 8000);
        const prior = await getJson(`https://api.frankfurter.dev/v1/${ymd(Date.parse(latest.date) - 86400_000 * (new Date(latest.date).getUTCDay() === 1 ? 3 : 1))}?base=USD`, 'yahoo', 8000);
        return fxFromFrankfurter(latest, prior);
      });
      px = val; source = 'European Central Bank reference rates via Frankfurter (daily, ~16:00 CET)'; err = '';
    } catch (e) { err ||= (e as Error).message.slice(0, 120); }
  }
  const rows = list.map((x) => ({ ...x, ...(px[x.sym] ?? {}) })).filter((x) => 'last' in x);
  if (!rows.length) return json({ error: err || 'no quotes' }, { status: 502 });
  return json({ set, rows, strength: set === 'fx' ? currencyStrength(px) : undefined, asOf: Date.now(), source }, { sMaxAge: 60 });
}

export async function halts(): Promise<Response> {
  try {
    const { val } = await cached('halts', 60, async () => parseHalts(await getText('https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts'), etToUtc));
    return json({ halts: val, asOf: Date.now(), source: 'Nasdaq Trader trade halts feed (official; all US-listed stocks, refreshed every minute)' }, { sMaxAge: 60 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

const NQ_HEADERS = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)', accept: 'application/json, text/plain, */*', origin: 'https://www.nasdaq.com', referer: 'https://www.nasdaq.com/' };
export async function idxmovers(req: Request): Promise<Response> {
  const index = new URL(req.url).searchParams.get('index') === 'ndx' ? 'ndx' : 'spx';
  try {
    const { snap, source, caps } = await snapshot();
    if (!caps) return json({ error: 'Market caps unavailable right now (TradingView screener down), so weights cannot be worked out.' }, { status: 503 });
    let members: { sym: string; name: string }[];
    if (index === 'spx') members = COMPANIES.filter((c) => c[7] === 'spx').map((c) => ({ sym: c[0], name: c[1] }));
    else members = (await cached('ndx:list', 7 * 86400, async () => parseNdxList(await getJson('https://api.nasdaq.com/api/quote/list-type/nasdaq100', 'nasdaq', 10000, { headers: NQ_HEADERS })))).val;
    if (members.length < 50) throw new Error('index member list unavailable');
    const m = indexMovers(members, snap);
    return json({ index, ...m, members: members.length, asOf: Date.now(), source: `${source}; weights = market cap share (approximation: the real index adjusts for float${index === 'ndx' ? ' and caps the largest weights' : ''})` }, { sMaxAge: 120 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}

/* ---------------- options + rates ---------------- */
/** fn=optactive -> the most traded option contracts across the busiest underlyings (Cboe delayed chains, read at most every 30 min). */
export async function optactive(): Promise<Response> {
  const chains: Chain[] = [], missed: string[] = [];
  for (const s of ACTIVE_UNDERLYINGS) {
    try {
      const { val } = await cached(`optact:${s}`, ttl(1800, 4 * 3600), async () => {
        if (!take('cboe')) throw new Error('Cboe request budget used up for now');
        return parseCboe(await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/options/${s}.json`, 'cboe', 25000), s);
      });
      chains.push(val);
    } catch { missed.push(s); }
  }
  if (!chains.length) return json({ error: 'No option chains loaded (Cboe budget or network).', missed }, { status: 502 });
  return json({ top: mostActive(chains), names: chains.map(chainActivity).sort((a, b) => b.volume - a.volume), missed, asOf: Date.now(), source: 'Cboe delayed option chains (~15 min delayed), re-read at most every 30 minutes' }, { sMaxAge: 300 });
}

/** fn=rates -> Treasury yield curve now / a month ago / a year ago, curve spreads, and key policy and market rates (FRED). */
export async function rates(): Promise<Response> {
  if (!hasKey('fred')) return json({ needsKey: true, error: 'The yield curve needs FRED_API_KEY (free).' }, { status: 503 });
  const ids = [...CURVE.map((c) => c.id), ...RATES.map((r) => r.id)];
  const series: Record<string, { date: string; value: number }[]> = {};
  await Promise.all(ids.map(async (id) => { try { series[id] = (await cached(`fred:hist:${id}`, 6 * 3600, () => fredHistory(id, 400))).val; } catch { /* leave out */ } }));
  const curve = yieldCurve(series);
  const other = RATES.map((r) => ({ ...r, now: at(series[r.id] ?? [], 0), y1: at(series[r.id] ?? [], 365) })).filter((r) => r.now);
  return json({ ...curve, rates: other, asOf: Date.now(), source: 'FRED (St. Louis Fed): Treasury constant-maturity yields and rates, daily (mortgage rate weekly)' }, { sMaxAge: 3600 });
}

/** fn=perps -> crypto perpetual futures: price, funding rate, open interest and volume (Hyperliquid public API). */
export async function perps(): Promise<Response> {
  try {
    const { val } = await cached('hl:ctx', 60, async () => parseHyperliquid(await getJson('https://api.hyperliquid.xyz/info', 'binance', 10000, { method: 'POST', body: JSON.stringify({ type: 'metaAndAssetCtxs' }), headers: { 'content-type': 'application/json' } })));
    if (!val.length) throw new Error('Hyperliquid returned no markets');
    return json({ perps: val, asOf: Date.now(), source: 'Hyperliquid public API (a crypto derivatives exchange); funding is paid hourly between longs and shorts' }, { sMaxAge: 60 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
