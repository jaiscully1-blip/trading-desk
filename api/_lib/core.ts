// Server-side plumbing for /api functions: keys, rate limits, caching, JSON responses.
// Keys are read from process.env here and never sent to the browser.
import { ProviderError } from '../../shared/parse.js';
import { clock } from '../../shared/clock.js';

export type Provider = 'bis' | 'pubs' | 'fdic' | 'googlepatents' | 'groq' | 'openrouter' | 'twelvedata' | 'finnhub' | 'alphavantage' | 'fred' | 'finra' | 'kalshi' | 'gdelt' | 'binance' | 'coingecko' | 'sec' | 'gemini' | 'wikipedia' | 'aisstream' | 'polymarket' | 'github' | 'yahoo' | 'openfigi' | 'ark' | 'tradingview' | 'alpaca' | 'cboe' | 'nasdaq' | 'earningsapi' | 'tradetime' | 'zillow' | 'mempool' | 'dataroma' | 'apewisdom' | 'rdw' | 'copernicus' | 'stocktwits' | 'opensky' | 'adsblol' | 'adsbfi' | 'eia' | 'noaa' | 'patentsview' | 'courtlistener' | 'french' | 'steam' | 'cfpb' | 'nhtsa' | 'openfda' | 'fema' | 'usdm' | 'agencies' | 'dtcc' | 'cftc' | 'cryptoex';

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
  sec: 'SEC_USER_AGENT', // not a key: SEC asks automated tools to send a contact email in the User-Agent
  gemini: 'GEMINI_API_KEY',
  bis: '', // BIS statistics API (stats.bis.org), no key
  pubs: '', // central bank and regulator publication feeds (Agencies page), no key
  fdic: '', // FDIC BankFind public API (call reports), no key
  googlepatents: '', // public patent pages (abstracts), fetched one at a time when a patent is opened
  groq: 'GROQ_API_KEY', // free plan, backup AI when Gemini fails
  openrouter: 'OPENROUTER_API_KEY', // free models (openrouter/free), last backup AI
  wikipedia: '',
  aisstream: 'AISSTREAM_API_KEY',
  polymarket: '', // public read-only market data
  github: '', // public repo files
  yahoo: '', // unofficial public chart data
  openfigi: '', // CUSIP -> ticker, keyless tier
  ark: '', // arkfunds.io community API over ARK's public daily files
  tradingview: '', // public screener endpoint
  alpaca: 'ALPACA_KEY_ID', // + ALPACA_SECRET_KEY; free account, IEX real-time + Benzinga news
  nasdaq: '', // nasdaq.com's public calendar JSON (earnings, IPOs): unofficial, no key, personal use
  cboe: '', // public delayed option chains (cdn.cboe.com), ~15 min delayed; personal, non-commercial use
  earningsapi: 'EARNINGSAPI_KEY', // earningsapi.com free plan: 100 requests a day, values refresh once a day
  tradetime: '', // api.tradeti.me: exchange hours and holidays, free, no key
  zillow: '', // Zillow Research public CSVs (monthly)
  mempool: '', // mempool.space public API (bitcoin network stats)
  dataroma: '', // Dataroma's public superinvestor updates RSS feed
  apewisdom: '', // apewisdom.io: Reddit ticker mentions, free, no key
  rdw: '', // Netherlands vehicle register (RDW open data, Socrata), free, no key
  stocktwits: '', // StockTwits public symbol streams, no key
  opensky: '', // OpenSky Network anonymous REST: 400 credits a day
  adsblol: '', // adsb.lol open ADS-B API, no key (ODbL); jet lookups when OpenSky refuses cloud servers
  adsbfi: '', // adsb.fi open data API, no key, personal non-commercial use, 1 request a second; airport fallback
  eia: 'EIA_API_KEY', // U.S. Energy Information Administration open data, free key
  noaa: '', // api.weather.gov, no key (asks for a User-Agent)
  fema: '', // FEMA OpenFEMA disaster declarations, no key
  usdm: '', // US Drought Monitor data services (UNL), no key
  dtcc: '', // DTCC public swap dissemination (pddata.dtcc.com), no key
  cftc: '', // CFTC Commitments of Traders (publicreporting.cftc.gov), no key
  cryptoex: '', // OKX, Kraken Futures, Deribit public market data, no key
  agencies: '', // World Monitor: USGS, NOAA, NIFC, GDACS, IFRC, WHO, CDC, ECDC, FDA, CPSC, Federal Register, SEC, Fed, State, CISA, FAA, UN (all no key)
  patentsview: 'USPTO_API_KEY', // USPTO Open Data Portal API key (free; needs a USPTO.gov account verified with ID.me). PatentsView's own API went offline in 2026
  french: '', // Kenneth French data library (Dartmouth): factor returns, free CSV zips, updated monthly
  steam: '', // Steam store public review summaries (store.steampowered.com/appreviews), no key
  cfpb: '', // CFPB consumer complaint database public API, no key
  nhtsa: '', // NHTSA recalls and complaints public API, no key
  openfda: '', // openFDA public API, no key (240 requests a minute, 1,000 a day without a key)
  courtlistener: 'COURTLISTENER_TOKEN', // CourtListener (Free Law Project) API, free account token
  copernicus: 'COPERNICUS_CLIENT_ID', // + COPERNICUS_CLIENT_SECRET; Copernicus Data Space (Sentinel Hub), free account and monthly quota
};

export function key(p: Provider): string {
  if (!KEY_ENV[p]) return '';
  const k = process.env[KEY_ENV[p]];
  if (!k) throw new ProviderError(p, `missing ${KEY_ENV[p]}`, false);
  return k;
}
export const hasKey = (p: Provider) => (!KEY_ENV[p] || !!process.env[KEY_ENV[p]]) && (p !== 'alpaca' || !!process.env.ALPACA_SECRET_KEY);

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
  kalshi: { perMin: 40, perDay: 2000 }, // public reads allow ~20/s; stay far below
  gdelt: { perMin: 10, perDay: 1000 },
  binance: { perMin: 30, perDay: 5000 },
  coingecko: { perMin: 5, perDay: 500 },
  sec: { perMin: 300, perDay: 20000 }, // SEC fair access: 10 requests/second
  gemini: { perMin: 8, perDay: 200 }, // free tier; each company is read once and cached
  bis: { perMin: 20, perDay: 500 }, // half-yearly data, cached a week
  pubs: { perMin: 60, perDay: 3000 }, // 18 public feeds cached 30 min, plus summaries cached 30 days
  fdic: { perMin: 120, perDay: 5000 }, // public API, no published limit: kept modest; quarterly data is cached a day or more
  googlepatents: { perMin: 20, perDay: 400 }, // unofficial public pages (robots.txt allows /patent/): kept light, cached 30 days
  groq: { perMin: 25, perDay: 900 }, // free plan: 30 requests/min, 1,000/day per model (console.groq.com/docs/rate-limits), kept under
  openrouter: { perMin: 15, perDay: 45 }, // free models: 20/min, 50/day without bought credits (openrouter.ai/docs/api-reference/limits)
  wikipedia: { perMin: 60, perDay: 5000 },
  aisstream: { perMin: 4, perDay: 400 },
  polymarket: { perMin: 30, perDay: 3000 },
  github: { perMin: 30, perDay: 3000 },
  yahoo: { perMin: 60, perDay: 2000 },
  openfigi: { perMin: 20, perDay: 2000 }, // keyless: 25 requests/min, 10 jobs each
  ark: { perMin: 20, perDay: 500 },
  tradingview: { perMin: 10, perDay: 500 },
  alpaca: { perMin: 180, perDay: Infinity }, // free Basic plan: 200 requests/min
  nasdaq: { perMin: 30, perDay: 1500 }, // no published limit; every response is cached 30 min to 6 hours
  cboe: { perMin: 12, perDay: 400 }, // no published limit (static CDN files); each chain is cached 15-30 min in session
  earningsapi: { perMin: 20, perDay: 80 }, // free plan: 100 a day, 1,000 a month; every call is cached for hours
  tradetime: { perMin: 10, perDay: 1000 }, // asks clients to cache: 30 s for status, 24 h for holidays
  zillow: { perMin: 6, perDay: 60 },
  mempool: { perMin: 20, perDay: 2000 },
  dataroma: { perMin: 4, perDay: 100 },
  apewisdom: { perMin: 6, perDay: 300 }, // no published limit; each chain is cached 15 min in session
  rdw: { perMin: 30, perDay: 2000 }, // Socrata asks anonymous callers to stay modest
  adsblol: { perMin: 2, perDay: 500 }, // allows roughly 2 requests per 30 seconds
  adsbfi: { perMin: 40, perDay: 3000 }, // 1 request a second; answers cached 10 minutes
  opensky: { perMin: 6, perDay: 300 }, // anonymous: 400 credits a day; answers cached 5-10 minutes
  eia: { perMin: 20, perDay: 1000 },
  noaa: { perMin: 20, perDay: 2000 },
  fema: { perMin: 10, perDay: 500 },
  usdm: { perMin: 10, perDay: 300 },
  agencies: { perMin: 60, perDay: 6000 },
  dtcc: { perMin: 30, perDay: 1000 },
  cftc: { perMin: 20, perDay: 500 },
  cryptoex: { perMin: 60, perDay: 8000 }, // ~21 calls per refresh, cached 2 min; OKX allows 20 per 2 s per endpoint
  patentsview: { perMin: 480, perDay: 60000 }, // ODP: 5M metadata calls/week, burst 1, 4-15/s (data.uspto.gov/apis/api-rate-limits); calls run one at a time, so ~3-5/s in practice; a fresh radar is ~130 calls
  french: { perMin: 4, perDay: 50 }, // two small files, cached a day
  steam: { perMin: 30, perDay: 1500 },
  cfpb: { perMin: 20, perDay: 1000 },
  nhtsa: { perMin: 20, perDay: 1000 },
  openfda: { perMin: 20, perDay: 900 },
  courtlistener: { perMin: 20, perDay: 1000 }, // free token allows 5,000 an hour
  stocktwits: { perMin: 3, perDay: 150 }, // public API allows ~200 an hour; every answer is cached 10 minutes
  copernicus: { perMin: 10, perDay: 300 }, // free quota is processing units per month: every answer is cached a day
};
const hits: Record<string, number[]> = {};
const dayCount: Record<string, { day: string; n: number }> = {};

/* ---------- provider health (per serverless instance): what the Data status page shows ---------- */
const health: Record<string, { lastOk?: number; lastError?: string; lastErrorAt?: number }> = {};
export const noteOk = (p: Provider) => { (health[p] ??= {}).lastOk = Date.now(); };
export const noteError = (p: Provider, msg: string) => { const h = (health[p] ??= {}); h.lastError = msg.slice(0, 200); h.lastErrorAt = Date.now(); };
export const healthOf = (p: Provider) => health[p] ?? {};
/** requests used in the last minute and today, and the limits this instance enforces */
export function usageOf(p: Provider, now = Date.now()) {
  const lim = LIMITS[p];
  const min = (hits[p] ?? []).filter((t) => now - t < 60_000).length;
  const day = new Date(now).toISOString().slice(0, 10);
  return { min: { used: min, limit: lim.perMin }, day: { used: dayCount[p]?.day === day ? dayCount[p].n : 0, limit: lim.perDay } };
}
export const allProviders = (): Provider[] => Object.keys(LIMITS) as Provider[];


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
/** "Reload all data" on the desk adds _fresh to its requests: for a few seconds this server skips its saved copies
 *  and asks the sources again (results are saved as usual, rate limits still apply). */
let freshUntil = 0;
export function markFresh(req?: Request) { try { if (req && new URL(req.url).searchParams.has('_fresh')) freshUntil = Date.now() + 15_000; } catch { /* no url */ } }
export async function cached<T>(k: string, ttlSec: number, fn: () => Promise<T>): Promise<{ val: T; stale: boolean }> {
  const hit = getCached<T>(k);
  if (hit?.fresh && Date.now() > freshUntil) return { val: hit.val, stale: false };
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

export async function getJson(url: string, provider: Provider, timeoutMs = 8000, init?: { method?: string; body?: string; headers?: Record<string, string> }): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, method: init?.method ?? 'GET', body: init?.body, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...(init?.headers ?? {}) } });
    if (r.status === 429) throw new ProviderError(provider, 'HTTP 429 rate limited', true);
    if (r.status === 401 || r.status === 403) {
      const body = await r.text();
      // a short reason when the source sends one as JSON; never a page of HTML
      let why = ''; try { const j = JSON.parse(body); why = String(j.error ?? j.message ?? j.detail ?? '').slice(0, 80); } catch { /* HTML or text */ }
      throw new ProviderError(provider, r.status === 401 ? `the API key was refused${why ? ` (${why})` : ''}` : `the source is blocking requests (403)${why ? `: ${why}` : ''}`, false, true);
    }
    if (!r.ok) {
      // keep the source's own short reason (e.g. Google's "model not found"), so Data status says why, not just a number
      let why = ''; try { const j = JSON.parse(await r.text()); why = String(j?.error?.message ?? j?.error ?? j?.message ?? '').replace(/\s+/g, ' ').slice(0, 120); } catch { /* not JSON */ }
      throw new ProviderError(provider, `HTTP ${r.status}${why ? `: ${why}` : ''}`, r.status >= 500);
    }
    const out = await r.json();
    noteOk(provider);
    return out;
  } catch (e) {
    // a GitHub file that a job hasn't produced yet (404) is 'not run yet', not a broken provider: don't flag it on Data status
    if (e instanceof ProviderError) { if (!(provider === 'github' && /HTTP 404/.test(e.message))) noteError(provider, e.message); throw e; }
    const pe = new ProviderError(provider, (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message, true);
    noteError(provider, pe.message);
    throw pe;
  } finally {
    clearTimeout(t);
  }
}

export function json(data: unknown, opts: { status?: number; sMaxAge?: number; swr?: number } = {}) {
  const { status = 200, sMaxAge = 0 } = opts;
  // stale-while-revalidate: after s-maxage the CDN still answers instantly with the last copy while it fetches a fresh
  // one in the background, so a page opened after a quiet spell doesn't wait seconds on slow upstreams. Ten times the
  // fresh window (at least 5 minutes, at most a day); errors are never kept that long.
  const swr = opts.swr || (status === 200 ? Math.min(86400, Math.max(300, sMaxAge * 10)) : sMaxAge);
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
