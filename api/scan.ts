// GET /api/scan?symbols=NVDA,AMD,...   (up to 40; SPY is always added for relative strength)
// Returns per-symbol daily stats + patterns + short interest + catalyst. Symbols the free-tier budget
// can't cover yet come back in `pending`; the client polls again and the table fills in progressively.
import type { ApiError } from '../shared/types.js';
import { encodeInstant, type FinraSI } from '../shared/parse.js';
import { computeBase, type ScanBase } from '../shared/scan.js';
import { finnhubNews, finnhubProfile, finraShortInterest, secJson } from './_lib/adapters.js';
import { parseSecTickers } from '../shared/company.js';
import { closeOn, floatShares, latestByCik, recentInstantPeriods } from '../shared/tearsheet.js';
import { frameUrl } from '../shared/distressGather.js';
import { SYMBOL_RE, cached, getCached, getJson, hasKey, json, setCached, ttl } from './_lib/core.js';
import { loadSeries } from './_lib/series.js';
import { YH_HEADERS, longDaily, yahooDaily } from './_lib/yahoo.js';

const MAX = 40;

async function shortInterest(symbols: string[]): Promise<Map<string, FinraSI | null> | null> {
  const out = new Map<string, FinraSI | null>();
  const missing: string[] = [];
  for (const s of symbols) {
    const c = getCached<FinraSI | null>(`si:${s}`);
    if (c?.fresh) out.set(s, c.val);
    else missing.push(s);
  }
  if (missing.length) {
    try {
      const got = await finraShortInterest(missing);
      for (const s of missing) {
        const v = got.get(s) ?? null;
        out.set(s, v);
        setCached(`si:${s}`, v, 12 * 3600);
      }
    } catch {
      if (!out.size) return null; // source down: report unavailable rather than "no short interest"
    }
  }
  return out;
}

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const symbols = [...new Set((u.searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean))];
  if (!symbols.length || symbols.length > MAX || !symbols.every((s) => SYMBOL_RE.test(s))) {
    return json({ error: `1-${MAX} valid symbols required` } satisfies ApiError, { status: 400 });
  }
  const all = symbols.includes('SPY') ? symbols : ['SPY', ...symbols];
  const nowEnc = encodeInstant(Date.now());

  // Daily bars: Twelve Data only (never the 25/day Alpha Vantage budget). Sequential so the per-minute budget is honored in order.
  const bases: ScanBase[] = [];
  const pending: string[] = [];
  const errors: Record<string, string> = {};
  // Yahoo's public daily chart first (no credits, cached 6 hours): it keeps the scan full when Twelve Data's free minute or day budget is
  // used up. Whatever Yahoo can't give falls back to Twelve Data, one symbol at a time inside its per-minute budget.
  const yh = new Map<string, Awaited<ReturnType<typeof yahooDaily>>>();
  for (let i = 0; i < all.length; i += 8) await Promise.all(all.slice(i, i + 8).map(async (s) => { yh.set(s, await yahooDaily(s)); }));
  for (const s of all) {
    const y = yh.get(s);
    if (y) { bases.push(computeBase(s, y, nowEnc, Date.now(), 'Yahoo Finance')); continue; }
    const r = await loadSeries(s, 'D', { fallback: false, reserve: 2 });
    if (r.ok) bases.push(computeBase(s, r.val.bars, nowEnc, r.val.asOf, r.val.source));
    else if (r.budget) pending.push(s);
    else errors[s] = r.error;
  }

  // Short interest (FINRA, keyless) + shares outstanding (Finnhub profile) for % of shares out
  const names = bases.map((b) => b.sym).filter((s) => s !== 'SPY' && s !== 'QQQ');
  const si = names.length ? await shortInterest(names) : new Map();
  const shares = new Map<string, number | null>();
  if (hasKey('finnhub')) {
    await Promise.all(names.map(async (s) => {
      try { shares.set(s, (await cached(`prof:${s}`, 7 * 86400, () => finnhubProfile(s))).val.sharesOut); } catch { /* optional */ }
    }));
  }

  // Float (estimated): SEC public float (dollar value held by non-affiliates on one date, from 10-K covers) ÷ that day's close.
  const floats = new Map<string, { shares: number; asOf: string } | null>();
  if (hasKey('sec')) {
    try {
      const [tick, pf] = await Promise.all([
        cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json'))),
        cached('sec:pfloat', 86400, async () => [...latestByCik(await Promise.all(recentInstantPeriods(new Date().toISOString().slice(0, 10), 7)
          .map((p) => secJson(frameUrl('dei', 'EntityPublicFloat', 'USD', p)).catch(() => null)))).entries()]),
      ]);
      const cikOf = new Map(tick.val.map((t) => [t.ticker, t.cik] as const));
      const pfBy = new Map(pf.val);
      await Promise.all(names.slice(0, 60).map(async (s) => {
        const p = pfBy.get(cikOf.get(s) ?? cikOf.get(s.replace('.', '-')) ?? -1);
        if (!p) { floats.set(s, null); return; }
        let close = closeOn(yh.get(s) ?? [], p.end);
        if (close == null) close = closeOn(await longDaily(s, '2y').catch(() => []), p.end); // float dates can be over a year old
        const sh = floatShares(p.val, close, shares.get(s) ?? null);
        floats.set(s, sh ? { shares: sh, asOf: p.end } : null);
      }));
    } catch { /* optional */ }
  }

  // 5-year low from weekly bars (one small call per ticker a day)
  const lo5 = new Map<string, number | null>();
  await Promise.all(names.slice(0, 80).map(async (s) => {
    try {
      const { val } = await cached(`yh:5ylow:${s}`, 86400, async () => {
        const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.replace('.', '-'))}?range=5y&interval=1wk`, 'yahoo', 8000, { headers: YH_HEADERS });
        const lows: number[] = (j?.chart?.result?.[0]?.indicators?.quote?.[0]?.low ?? []).filter((x: unknown) => typeof x === 'number' && x > 0);
        return lows.length >= 52 ? Math.min(...lows) : null;
      });
      lo5.set(s, val);
    } catch { /* optional */ }
  }));

  // Catalyst: any company news in the last 24h (Finnhub)
  const catalysts = new Map<string, ScanBase['catalyst']>();
  if (hasKey('finnhub')) {
    await Promise.all(names.map(async (s) => {
      try {
        const { val } = await cached(`news:${s}`, ttl(1800, 3 * 3600), () => finnhubNews(s));
        const recent = val.filter((n) => Date.now() - n.t < 24 * 3600_000);
        catalysts.set(s, { count: recent.length, latest: recent[0]?.headline, latestAt: recent[0]?.t });
      } catch { /* leave undefined = unknown */ }
    }));
  }

  for (const b of bases) {
    if (b.sym === 'SPY' || b.sym === 'QQQ') continue;
    if (si) {
      const x = si.get(b.sym);
      const so = shares.get(b.sym);
      b.si = x ? { shares: x.shares, daysToCover: x.daysToCover, changePct: x.changePct, settlementDate: x.settlementDate, pctOut: so ? (x.shares / so) * 100 : null } : x === null ? null : undefined;
    }
    if (catalysts.has(b.sym)) b.catalyst = catalysts.get(b.sym);
    if (floats.has(b.sym)) b.float = floats.get(b.sym);
    if (lo5.has(b.sym)) b.lo5y = lo5.get(b.sym);
  }

  const complete = pending.length === 0;
  return json(
    { rows: bases, pending, errors, asOf: Date.now(), siSource: si ? 'FINRA consolidated short interest' : null, floatSource: floats.size ? 'Estimated: SEC public float ÷ close on that date' : null, catalystSource: hasKey('finnhub') ? 'Finnhub company news' : null },
    { sMaxAge: complete ? 120 : 0 },
  );
}
