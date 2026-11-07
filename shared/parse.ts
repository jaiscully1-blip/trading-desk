// Pure parsers that turn provider JSON into normalized shapes. No network here, so they're unit-tested.
import type { Bar, MacroPoint, QuoteResult } from './types.js';

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    /** rate-limited or temporarily failing: try a fallback, maybe retry later */
    public retryable = false,
    /** this provider's free tier does not offer it */
    public notOnFreeTier = false,
  ) {
    super(`${provider}: ${message}`);
  }
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
};

/** "2026-11-03" or "2026-11-03 09:30:00" (ET wall clock) -> encoded seconds. */
export function encodeEtWall(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s.trim());
  if (!m) throw new Error(`bad datetime ${s}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)) / 1000;
}

/** Real UTC ms -> encoded ET wall-clock seconds (same encoding as intraday bars). */
export function encodeInstant(ms: number): number {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 1000;
}

function cleanBars(bars: Bar[]): Bar[] {
  const ok = bars.filter((b) => [b.open, b.high, b.low, b.close].every((x) => Number.isFinite(x) && x > 0));
  ok.sort((a, b) => a.time - b.time);
  // drop duplicate timestamps (keep last)
  const out: Bar[] = [];
  for (const b of ok) {
    if (out.length && out[out.length - 1].time === b.time) out[out.length - 1] = b;
    else out.push(b);
  }
  return out;
}

/* ---------------- Twelve Data ---------------- */
// /time_series -> { meta: {...}, values: [{ datetime, open, high, low, close, volume }], status: "ok" }
// errors       -> { code, message, status: "error" }
export function parseTwelveSeries(j: any): Bar[] {
  if (!j || j.status !== 'ok' || !Array.isArray(j.values)) {
    const code = Number(j?.code);
    const msg = String(j?.message ?? 'unexpected response');
    throw new ProviderError('twelvedata', msg, code === 429 || code >= 500, code === 403);
  }
  return cleanBars(
    j.values.map((v: any) => ({
      time: encodeEtWall(v.datetime),
      open: num(v.open),
      high: num(v.high),
      low: num(v.low),
      close: num(v.close),
      volume: Number.isFinite(num(v.volume)) ? num(v.volume) : 0,
    })),
  );
}

// /quote -> { symbol, open, high, low, close, previous_close, percent_change, timestamp, ... }
// with several symbols the response is keyed by symbol.
export function parseTwelveQuote(j: any, symbol: string): QuoteResult {
  const q = j?.symbol ? j : j?.[symbol];
  if (!q || q.status === 'error' || q.code) {
    throw new ProviderError('twelvedata', String(q?.message ?? j?.message ?? 'no quote'), Number(q?.code ?? j?.code) === 429);
  }
  const last = num(q.close), prev = num(q.previous_close);
  return {
    symbol,
    last,
    prevClose: prev,
    chgPct: Number.isFinite(num(q.percent_change)) ? num(q.percent_change) : ((last - prev) / prev) * 100,
    open: num(q.open),
    high: num(q.high),
    low: num(q.low),
    t: num(q.timestamp) * 1000,
    source: 'Twelve Data',
    freshness: 'live',
  };
}

/* ---------------- Finnhub ---------------- */
// /quote -> { c, d, dp, h, l, o, pc, t }   (t in seconds; unknown symbols return zeros)
export function parseFinnhubQuote(j: any, symbol: string): QuoteResult {
  if (!j || typeof j !== 'object' || 'error' in j) {
    throw new ProviderError('finnhub', String(j?.error ?? 'unexpected response'), /limit/i.test(String(j?.error)));
  }
  if (!j.c && !j.t) throw new ProviderError('finnhub', `no data for ${symbol}`);
  return {
    symbol,
    last: num(j.c),
    prevClose: num(j.pc),
    chgPct: Number.isFinite(num(j.dp)) ? num(j.dp) : ((num(j.c) - num(j.pc)) / num(j.pc)) * 100,
    open: num(j.o),
    high: num(j.h),
    low: num(j.l),
    t: num(j.t) * 1000,
    source: 'Finnhub',
    freshness: 'live',
  };
}

/* ---------------- Alpha Vantage ---------------- */
// TIME_SERIES_DAILY -> { "Meta Data": {...}, "Time Series (Daily)": { "YYYY-MM-DD": { "1. open": ... } } }
// throttled/premium -> { "Note": ... } | { "Information": ... } | { "Error Message": ... }
export function parseAlphaDaily(j: any): Bar[] {
  const ts = j?.['Time Series (Daily)'];
  if (!ts || typeof ts !== 'object') {
    const msg = String(j?.Note ?? j?.Information ?? j?.['Error Message'] ?? 'unexpected response');
    throw new ProviderError('alphavantage', msg, /frequency|rate limit|requests per/i.test(msg), /premium/i.test(msg));
  }
  return cleanBars(
    Object.entries(ts).map(([d, v]: [string, any]) => ({
      time: encodeEtWall(d),
      open: num(v['1. open']),
      high: num(v['2. high']),
      low: num(v['3. low']),
      close: num(v['4. close']),
      volume: num(v['5. volume']) || 0,
    })),
  );
}

/* ---------------- FRED ---------------- */
// /fred/series/observations -> { observations: [{ date, value }] }  (value "." = missing)
export function parseFredLatest(j: any): MacroPoint {
  const obs: { date: string; value: string }[] = Array.isArray(j?.observations) ? j.observations : [];
  const valid = obs.filter((o) => o.value !== '.' && Number.isFinite(parseFloat(o.value))).sort((a, b) => (a.date < b.date ? 1 : -1));
  if (!valid.length) throw new ProviderError('fred', String(j?.error_message ?? 'no observations'));
  return { value: parseFloat(valid[0].value), prev: valid[1] ? parseFloat(valid[1].value) : null, date: valid[0].date };
}

/* ---------------- FINRA consolidated short interest (keyless) ---------------- */
// POST api.finra.org/data/group/otcMarket/name/consolidatedShortInterest -> [{ symbolCode, currentShortPositionQuantity,
//   averageDailyVolumeQuantity, daysToCoverQuantity, changePercent, settlementDate, ... }]
export interface FinraSI { symbol: string; shares: number; daysToCover: number; changePct: number; settlementDate: string }
export function parseFinraShortInterest(j: any): Map<string, FinraSI> {
  if (!Array.isArray(j)) throw new ProviderError('finra', String(j?.message ?? j?.error ?? 'unexpected response'));
  const out = new Map<string, FinraSI>();
  for (const r of j) {
    const symbol = String(r?.symbolCode ?? '').toUpperCase();
    const date = String(r?.settlementDate ?? '');
    if (!symbol || !date) continue;
    const prev = out.get(symbol);
    if (prev && prev.settlementDate >= date) continue; // keep the latest settlement per symbol
    out.set(symbol, {
      symbol,
      shares: num(r.currentShortPositionQuantity) || 0,
      daysToCover: num(r.daysToCoverQuantity) || 0,
      changePct: num(r.changePercent) || 0,
      settlementDate: date,
    });
  }
  return out;
}

/* ---------------- Finnhub company news / profile ---------------- */
// /company-news -> [{ category, datetime (s), headline, id, related, source, summary, url }]
export interface NewsItem { id: string; t: number; headline: string; source: string; url: string; symbol: string }
export function parseFinnhubNews(j: any, symbol: string): NewsItem[] {
  if (!Array.isArray(j)) throw new ProviderError('finnhub', String(j?.error ?? 'unexpected response'), false, /access/i.test(String(j?.error)));
  return j
    .filter((x) => x && x.headline && Number.isFinite(num(x.datetime)))
    .map((x) => ({ id: String(x.id ?? `${symbol}-${x.datetime}`), t: num(x.datetime) * 1000, headline: String(x.headline), source: String(x.source ?? ''), url: String(x.url ?? ''), symbol }))
    .sort((a, b) => b.t - a.t);
}
// /stock/profile2 -> { name, shareOutstanding (millions), ticker, ... }  ({} for unknown symbols)
export interface Profile { name: string | null; sharesOut: number | null; industry?: string; exchange?: string; marketCap?: number; web?: string; logo?: string; country?: string; ipo?: string }
export function parseFinnhubProfile(j: any): Profile {
  if (!j || typeof j !== 'object' || 'error' in j) throw new ProviderError('finnhub', String(j?.error ?? 'unexpected response'));
  const so = num(j.shareOutstanding), mc = num(j.marketCapitalization);
  return {
    name: j.name ? String(j.name) : null, sharesOut: Number.isFinite(so) && so > 0 ? so * 1e6 : null,
    industry: j.finnhubIndustry || undefined, exchange: j.exchange || undefined, marketCap: Number.isFinite(mc) && mc > 0 ? mc * 1e6 : undefined,
    web: j.weburl || undefined, logo: j.logo || undefined, country: j.country || undefined, ipo: j.ipo || undefined,
  };
}

/* ---------------- Alpha Vantage movers ---------------- */
// TOP_GAINERS_LOSERS -> { last_updated: "2026-11-03 16:15:57 US/Eastern", top_gainers: [{ ticker, price, change_percentage, volume }], top_losers, most_actively_traded }
export interface Mover { sym: string; price: number; chgPct: number; volume: number; list: 'gainers' | 'losers' | 'active' }
export function parseAlphaMovers(j: any): { lastUpdated: string; movers: Mover[] } {
  if (!j || !Array.isArray(j.top_gainers)) {
    const msg = String(j?.Note ?? j?.Information ?? j?.['Error Message'] ?? 'unexpected response');
    throw new ProviderError('alphavantage', msg, /frequency|rate limit|requests per/i.test(msg), /premium/i.test(msg));
  }
  const map = (arr: any[], list: Mover['list']): Mover[] =>
    (arr ?? []).map((x) => ({ sym: String(x.ticker), price: num(x.price), chgPct: num(String(x.change_percentage).replace('%', '')), volume: num(x.volume), list }));
  return {
    lastUpdated: String(j.last_updated ?? ''),
    movers: [...map(j.top_gainers, 'gainers'), ...map(j.most_actively_traded, 'active'), ...map(j.top_losers, 'losers')],
  };
}

/** Plain common stock / ETF tickers only: drops warrants, units, rights and odd suffixes (e.g. ABCDW, ABCDU, SLND+). */
export function isPlainTicker(sym: string): boolean {
  if (!/^[A-Z]{1,5}$/.test(sym)) return false;
  return !(sym.length === 5 && /[WUR]$/.test(sym));
}
