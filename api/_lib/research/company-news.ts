// GET /api/company-news?symbol=NVDA&from=2025-11-01&to=2026-11-07 -> headlines with keyword sentiment, for the chart's news buttons.
// Finnhub free company news (about a year of history). Range capped at 400 days.
import { keywordSentiment } from '../../../shared/news.js';
import { finnhubNewsRange } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase();
  let from = u.searchParams.get('from') ?? '', to = u.searchParams.get('to') ?? '';
  if (!SYMBOL_RE.test(sym) || !DAY.test(from) || !DAY.test(to)) return json({ error: 'symbol, from, to (YYYY-MM-DD) required' }, { status: 400 });
  const minFrom = new Date(Date.parse(to) - 400 * 86400_000).toISOString().slice(0, 10);
  if (from < minFrom) from = minFrom;
  if (!hasKey('finnhub')) return json({ items: [], error: 'missing FINNHUB_API_KEY' }, { status: 503 });
  try {
    const { val } = await cached(`cnews:${sym}:${from}:${to}`, 3600, () => finnhubNewsRange(sym, from, to));
    const items = val.map((n) => ({ t: n.t, title: n.headline, src: n.source, url: n.url, sentiment: keywordSentiment(n.headline), summary: n.summary }));
    return json({ sym, from, to, items, source: 'Finnhub company news', asOf: Date.now() }, { sMaxAge: 3600 });
  } catch (e) {
    return json({ items: [], error: (e as Error).message }, { status: 502 });
  }
}
