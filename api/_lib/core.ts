// Server-side plumbing for /api functions: keys, rate limits, caching, JSON responses.
// Keys are read from process.env here and never sent to the browser.
import { ProviderError } from '../../shared/parse.js';
import { clock } from '../../shared/clock.js';

export type Provider = 'twelvedata' | 'finnhub' | 'alphavantage' | 'fred' | 'finra' | 'kalshi' | 'gdelt' | 'binance' | 'coingecko';

export const KEY_ENV: Record<Provider, string> = {
  twelvedata: 'TWELVEDATA_API_KEY',
  finnhub: 'FINNHUB_API_KEY',
  alphavantage: 'ALPHAVANTAGE_API_KEY',
  fred: 'FRED_API_KEY',
  finra: '', // keyless public dataset
  kalshi: '', // public market data
  gdelt: '',
  binance: '',
  coingecko: '',
};

export function key(p: Provider): string {
  if (!KEY_ENV[p]) return '';
  const k = process.env[KEY_ENV[p]];
  if (!k) throw new ProviderError(p, `missing ${KEY_ENV[p]}`, false);
  return k;
}
export const hasKey = (p: Provider) => !KEY_ENV[p] || !!process.env[KEY_ENV[p]];

/* ---------- rate limits (free tiers, verified Nov 2026) ----------
 * Twelve Data Basic: 8 credits/min, 800/day
 * Finnhub free:      60 calls/min
 * Alpha Vantage:     25 requests/day (5/min)
 * FRED:              generous; capped here to stay polite
 * These are per serverless instance (best effort). The CDN cache below absorbs most repeat traffic. */
const LIMITS: Record<Provider, { perMin: number; perDay: number }> = {
  twelvedata: { perMin: 7, perDay: 780 },
  finnhub: { perMin: 55, perDay: Infinity },
  alphavantage: { perMin: 5, perDay: 24 },
  fred: { perMin: 60, perDay: Infinity },
  finra: { perMin: 10, perDay: 200 },
  kalshi: { perMin: 10, perDay: 500 },
  gdelt: { perMin: 10, perDay: 1000 },
  binance: { perMin: 30, perDay: 5000 },
  coingecko: { perMin: 5, perDay: 500 },
};
const hits: Record<string, number[]> = {};
const dayCount: Record<string, { day: string; n: number }> = {};

/** @param reserve credits to leave free this minute for higher-priority callers (charts/levels) */
export function take(p: Provider, cost = 1, now = Date.now(), reserve = 0): boolean {
  const lim = LIMITS[p];
  const w = (hits[p] = (hits[p] ?? []).filter((t) => now - t < 60_000));
  const day = new Date(now).toISOString().slice(0, 10);
  const d = (dayCount[p] = dayCount[p]?.day === day ? dayCount[p] : { day, n: 0 });
  if (w.length + cost + reserve > lim.perMin || d.n + cost + reserve * 20 > lim.perDay) return false;
  for (let i = 0; i < cost; i++) w.push(now);
  d.n += cost;
  return true;
}
export function _resetLimits() {
  for (const k of Object.keys(hits)) delete hits[k];
  for (const k of Object.keys(dayCount)) delete dayCount[k];
}

/* ---------- in-memory cache with stale fallback ---------- */
const mem = new Map<string, { exp: number; val: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function getCached<T>(k: string): { val: T; fresh: boolean } | null {
  const e = mem.get(k);
  return e ? { val: e.val as T, fresh: e.exp > Date.now() } : null;
}
export function setCached(k: string, val: unknown, ttlSec: number) {
  if (mem.size > 500) mem.delete(mem.keys().next().value!);
  mem.set(k, { exp: Date.now() + ttlSec * 1000, val });
}
/** Fresh cache hit, else one shared in-flight fetch; on failure fall back to stale cache if present. */
export async function cached<T>(k: string, ttlSec: number, fn: () => Promise<T>): Promise<{ val: T; stale: boolean }> {
  const hit = getCached<T>(k);
  if (hit?.fresh) return { val: hit.val, stale: false };
  let p = inflight.get(k) as Promise<T> | undefined;
  if (!p) {
    p = fn().finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  try {
    const val = await p;
    setCached(k, val, ttlSec);
    return { val, stale: false };
  } catch (e) {
    if (hit) return { val: hit.val, stale: true };
    throw e;
  }
}
export const _clearCache = () => { mem.clear(); inflight.clear(); };

/** Seconds to cache, depending on whether the regular session is open. */
export function ttl(inSession: number, offHours: number) {
  return clock().session === 'Regular session' ? inSession : offHours;
}

export async function getJson(url: string, provider: Provider, timeoutMs = 8000, init?: { method?: string; body?: string }): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, method: init?.method ?? 'GET', body: init?.body, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
    if (r.status === 429) throw new ProviderError(provider, 'HTTP 429 rate limited', true);
    if (r.status === 401 || r.status === 403) {
      const body = await r.text();
      throw new ProviderError(provider, `HTTP ${r.status} ${body.slice(0, 120)}`, false, true);
    }
    if (!r.ok) throw new ProviderError(provider, `HTTP ${r.status}`, r.status >= 500);
    return await r.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(provider, (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message, true);
  } finally {
    clearTimeout(t);
  }
}

export function json(data: unknown, opts: { status?: number; sMaxAge?: number; swr?: number } = {}) {
  const { status = 200, sMaxAge = 0, swr = 0 } = opts;
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Vercel's CDN honors s-maxage, so repeat requests across windows/devices don't spend credits.
      'cache-control': sMaxAge ? `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr || sMaxAge}` : 'no-store',
    },
  });
}

export const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
