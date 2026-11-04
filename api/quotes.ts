// GET /api/quotes?symbols=SPY,QQQ,NVDA
import type { ApiError, QuoteResult } from '../shared/types';
import { QUOTE_CHAIN } from './_lib/adapters';
import { SYMBOL_RE, getCached, json, setCached, ttl } from './_lib/core';

const MAX = 40;

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const symbols = [...new Set((u.searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean))];
  if (!symbols.length || symbols.length > MAX || !symbols.every((s) => SYMBOL_RE.test(s))) {
    return json({ error: `1-${MAX} valid symbols required` } satisfies ApiError, { status: 400 });
  }
  const life = ttl(15, 300);
  const out = new Map<string, QuoteResult>();
  const need: string[] = [];
  for (const s of symbols) {
    const c = getCached<QuoteResult>(`q:${s}`);
    if (c?.fresh) out.set(s, c.val);
    else need.push(s);
  }
  const tried: string[] = [];
  let missing = need;
  for (const a of QUOTE_CHAIN) {
    if (!missing.length) break;
    try {
      for (const q of await a.fetch(missing)) {
        out.set(q.symbol, q);
        setCached(`q:${q.symbol}`, q, life);
      }
    } catch (e) {
      tried.push((e as Error).message);
    }
    missing = missing.filter((s) => !out.has(s));
  }
  // stale fallback for anything still missing
  let stale = false;
  for (const s of missing) {
    const c = getCached<QuoteResult>(`q:${s}`);
    if (c) { out.set(s, c.val); stale = true; }
  }
  if (!out.size) return json({ error: 'no quotes', tried } satisfies ApiError, { status: 503 });
  return json({ quotes: symbols.flatMap((s) => (out.has(s) ? [out.get(s)!] : [])), missing: symbols.filter((s) => !out.has(s)), stale }, { sMaxAge: stale ? 5 : life });
}
