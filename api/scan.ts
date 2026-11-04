// GET /api/scan?symbols=NVDA,AMD,...   (up to 40; SPY is always added for relative strength)
// Returns per-symbol daily stats + patterns + short interest + catalyst. Symbols the free-tier budget
// can't cover yet come back in `pending`; the client polls again and the table fills in progressively.
import type { ApiError } from '../shared/types';
import { encodeInstant, type FinraSI } from '../shared/parse';
import { computeBase, type ScanBase } from '../shared/scan';
import { finnhubNews, finnhubProfile, finraShortInterest } from './_lib/adapters';
import { SYMBOL_RE, cached, getCached, hasKey, json, setCached, ttl } from './_lib/core';
import { loadSeries } from './_lib/series';

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
  for (const s of all) {
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
  }

  const complete = pending.length === 0;
  return json(
    { rows: bases, pending, errors, asOf: Date.now(), siSource: si ? 'FINRA consolidated short interest' : null, catalystSource: hasKey('finnhub') ? 'Finnhub company news' : null },
    { sMaxAge: complete ? 120 : 0 },
  );
}
