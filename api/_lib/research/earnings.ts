// GET /api/earnings?symbols=NVDA,AMD -> upcoming + just-reported earnings for those tickers (Finnhub free calendar).
// Estimates show before the report; actual EPS / revenue appear once Finnhub records them (usually within hours: delayed).
import { finnhubEarnings, type EarningRow } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json, ttl } from '../core.js';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export async function GET(req: Request): Promise<Response> {
  const syms = new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)));
  if (!hasKey('finnhub')) return json({ rows: [], error: 'missing FINNHUB_API_KEY' }, { status: 503 });
  const now = Date.now(), from = ymd(now - 4 * 86400_000), to = ymd(now + 14 * 86400_000);
  try {
    const { val, stale } = await cached(`earn:${from}:${to}`, ttl(900, 3600), () => finnhubEarnings(from, to));
    const rows: EarningRow[] = val.filter((r) => syms.has(r.sym)).sort((a, b) => a.date.localeCompare(b.date));
    return json({ rows, from, to, stale, source: 'Finnhub earnings calendar', asOf: Date.now() }, { sMaxAge: 600 });
  } catch (e) {
    return json({ rows: [], error: (e as Error).message }, { status: 502 });
  }
}
