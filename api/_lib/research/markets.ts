// Market-wide endpoints:
//   GET /api/research?fn=snapshot           -> price, % change and market cap for ~1,500 US stocks/funds (heatmap + state map)
//   GET /api/research?fn=etf&symbol=XLK      -> an ETF's holdings and sector weights
//   GET /api/research?fn=closes&symbols=A,B  -> ~1 year of daily closes for custom baskets
import { COMPANIES } from '../../../shared/data/companies.js';
import { ETFS } from '../../../shared/etfs.js';
import { TV_BODY, approxSectorEtf, parseEtfProfile, parseTvScan, parseYahooSpark, type SnapMap } from '../../../shared/markets.js';
import { SYMBOL_RE, cached, getJson, hasKey, json, key, take, ttl } from '../core.js';
import { YH_HEADERS, dailyBars } from '../yahoo.js';
import { alignCloses, quantRead } from '../../../shared/quant.js';

async function tradingView(): Promise<SnapMap> {
  if (!take('tradingview')) throw new Error('rate limit');
  const snap = parseTvScan(await getJson('https://scanner.tradingview.com/america/scan', 'tradingview', 12000, { method: 'POST', body: JSON.stringify(TV_BODY), headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)', origin: 'https://www.tradingview.com' } }));
  if (Object.keys(snap).length < 200) throw new Error('screener returned too few rows');
  return snap;
}
async function yahooSpark(): Promise<SnapMap> {
  const syms = [...new Set([...COMPANIES.map((c) => c[0]), ...Object.keys(ETFS)])];
  const out: SnapMap = {};
  const batches: string[][] = [];
  for (let i = 0; i < syms.length; i += 20) batches.push(syms.slice(i, i + 20));
  for (let i = 0; i < batches.length; i += 6) {
    await Promise.all(batches.slice(i, i + 6).map(async (b) => {
      if (!take('yahoo')) return;
      try { Object.assign(out, parseYahooSpark(await getJson(`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${b.map((s) => s.replace('.', '-')).join(',')}&range=1d&interval=1d`, 'yahoo', 8000, { headers: YH_HEADERS }))); } catch { /* skip batch */ }
    }));
  }
  if (Object.keys(out).length < 100) throw new Error('Yahoo returned too few quotes');
  return out;
}

export async function snapshot(): Promise<{ snap: SnapMap; source: string; caps: boolean }> {
  return (await cached('snapshot', ttl(120, 1800), async () => {
    try { return { snap: await tradingView(), source: 'TradingView screener (public, ~15 min delayed)', caps: true }; }
    catch { return { snap: await yahooSpark(), source: 'Yahoo Finance spark quotes (no market caps)', caps: false }; }
  })).val;
}

async function snapshotRoute(): Promise<Response> {
  try {
    const s = await snapshot();
    return json({ ...s, count: Object.keys(s.snap).length, asOf: Date.now() }, { sMaxAge: ttl(120, 1800) });
  } catch (e) { return json({ snap: {}, error: (e as Error).message }, { status: 502 }); }
}

async function etf(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  let err = '';
  if (hasKey('alphavantage')) {
    try {
      const { val, stale } = await cached(`etf:${sym}`, 7 * 86400, async () => {
        if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget (25 calls) used up');
        return parseEtfProfile(sym, await getJson(`https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=${sym}&apikey=${key('alphavantage')}`, 'alphavantage', 15000));
      });
      return json({ ...val, stale, asOf: Date.now(), source: 'Alpha Vantage ETF_PROFILE (issuer holdings)' }, { sMaxAge: 86400, swr: 6 * 86400 });
    } catch (e) { err = (e as Error).message; }
  } else err = 'needs ALPHAVANTAGE_API_KEY';
  try {
    const approx = approxSectorEtf(sym, (await snapshot()).snap);
    if (approx) return json({ ...approx, asOf: Date.now(), note: `Issuer holdings unavailable (${err}). Showing the S&P 500 members of this sector weighted by market cap, which is how the fund is built.`, source: 'S&P 500 sector members × live market caps' }, { sMaxAge: 3600 });
  } catch { /* fall through */ }
  return json({ sym, error: err }, { status: 502 });
}

async function closes(req: Request): Promise<Response> {
  const syms = [...new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean))];
  if (!syms.length || syms.length > 16 || !syms.every((s) => SYMBOL_RE.test(s))) return json({ error: '1-16 symbols' }, { status: 400 });
  const out: Record<string, [number, number][]> = {};
  const missing: string[] = [];
  const sources = new Set<string>();
  for (let i = 0; i < syms.length; i += 6) {
    await Promise.all(syms.slice(i, i + 6).map(async (s) => {
      const r = await dailyBars(s, 1).catch(() => null);
      if (r) { out[s] = r.bars.map((b) => [b.time, b.close]); sources.add(r.source); } else missing.push(s);
    }));
  }
  return json({ closes: out, missing, sources: [...sources], asOf: Date.now() }, { sMaxAge: missing.length ? 60 : 3 * 3600 });
}

// GET /api/research?fn=quant&symbol=NVDA -> risk, CAPM vs SPY, GARCH volatility, Hurst memory, entropy and a bull/bear lean
async function quant(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  try {
    const { val, stale } = await quantCached(sym);
    return json({ ...val, stale, asOf: Date.now() }, { sMaxAge: 3 * 3600 });
  } catch (e) { return json({ sym, error: (e as Error).message }, { status: 502 }); }
}

/** Quant read from ~1 year of daily closes vs SPY, cached 3h (shared by fn=quant and the Morning page). */
export function quantCached(sym: string) {
  return cached(`quant:${sym}`, 3 * 3600, async () => {
    const [a, b] = await Promise.all([dailyBars(sym, 1), sym === 'SPY' ? null : dailyBars('SPY', 1)]);
    if (!a) throw new Error('no daily history for this ticker');
    const pts = (x: { bars: { time: number; close: number }[] }) => x.bars.map((k) => [k.time, k.close] as [number, number]);
    const inp = alignCloses(pts(a), b ? pts(b) : pts(a));
    const q = quantRead(inp);
    if (!q) throw new Error('not enough history (needs ~3 months of daily closes)');
    return { sym, ...q, asOfDay: new Date(a.bars[a.bars.length - 1].time * 1000).toISOString().slice(0, 10), source: a.source };
  });
}

export const MARKET_ROUTES = { snapshot: () => snapshotRoute(), etf, closes, quant };
