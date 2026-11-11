// Browser data layer: talks only to our /api functions (never to providers directly, so keys stay server-side).
// If /api isn't reachable (e.g. the static preview), everything falls back to DEMO DATA with a badge.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Bar, Freshness, MacroResult, QuoteResult, TF } from '../types';
import { encodeInstant } from '../../shared/parse';
import { clock } from '../lib/clock';
import { DEMO_AT, makeCandles } from '../lib/demo';
import { load as loadLocal, save as saveLocal } from '../lib/store';

export interface Health {
  ok: boolean;
  providers: Record<'twelvedata' | 'finnhub' | 'alphavantage' | 'fred', boolean> & { sec?: boolean; gemini?: boolean; alpaca?: boolean };
  extendedHours: boolean;
}
export type DataMode = { kind: 'checking' } | { kind: 'demo'; reason: string } | { kind: 'live'; health: Health };

let modePromise: Promise<DataMode> | null = null;
export function detectMode(): Promise<DataMode> {
  if (modePromise) return modePromise;
  modePromise = (async (): Promise<DataMode> => {
    if (import.meta.env.MODE === 'single') return { kind: 'demo', reason: 'Static preview: no /api functions here' };
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch('/api/health', { signal: ctl.signal });
      clearTimeout(t);
      const j = r.ok && (r.headers.get('content-type') ?? '').includes('json') ? ((await r.json()) as Health) : null;
      if (!j?.ok) return { kind: 'demo', reason: '/api not reachable' };
      if (!j.providers.twelvedata && !j.providers.finnhub) return { kind: 'demo', reason: 'No data keys set (TWELVEDATA_API_KEY, FINNHUB_API_KEY)' };
      return { kind: 'live', health: j };
    } catch {
      return { kind: 'demo', reason: '/api not reachable' };
    }
  })();
  return modePromise;
}

const MODE_KEY = 'lastHealth';
/** The last visit's answer is used straight away (so data requests start with the page), then the real check confirms or corrects it. */
export function useDataMode(): DataMode {
  const [m, setM] = useState<DataMode>(() => {
    if (import.meta.env.MODE === 'single') return { kind: 'checking' };
    const saved = loadLocal<Health | null>(MODE_KEY, null);
    return saved?.ok ? { kind: 'live', health: saved } : { kind: 'checking' };
  });
  useEffect(() => { detectMode().then((r) => { setM(r); saveLocal(MODE_KEY, r.kind === 'live' ? r.health : null); }); }, []);
  return m;
}

/** A copy of the mode that stays "checking" for a few seconds after load: used by the heavier background feeds (scanner, rotation,
 *  calendars) so the first quotes, news and the page you are on get the network first. */
export function useLateMode(mode: DataMode, delayMs = 3000): DataMode {
  const [late, setLate] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLate(true), delayMs); return () => clearTimeout(t); }, [delayMs]);
  return late ? mode : { kind: 'checking' };
}

/* ---------------- series store (shared across components, deduped polling) ---------------- */
export interface SeriesState {
  bars: Bar[];
  source: string;
  freshness: Freshness;
  asOf: number;
  loading: boolean;
  error?: string;
  note?: string;
}
const EMPTY: SeriesState = { bars: [], source: '', freshness: 'pending', asOf: 0, loading: true };

type Entry = { state: SeriesState; subs: Set<() => void>; timer?: ReturnType<typeof setTimeout>; live: boolean };
const store = new Map<string, Entry>();

/** The last good bars for each ticker / timeframe live in this browser, so a rate limit or outage never leaves an empty chart. */
const CACHE_PREFIX = 'series:';
const cacheKey = (sym: string, tf: TF) => `${CACHE_PREFIX}${sym}:${tf}`;
function cachedSeries(sym: string, tf: TF): SeriesState | null {
  const c = loadLocal<{ bars: Bar[]; source: string; at: number } | null>(cacheKey(sym, tf), null);
  return c?.bars?.length ? { bars: c.bars, source: c.source, freshness: 'eod', asOf: c.at, loading: true, note: 'Saved copy from your last visit' } : null;
}

/** Next refresh: right after the next bar closes (5m), or on a slower cadence. Saves free-tier credits. */
export function nextRefreshMs(tf: TF, now = Date.now()) {
  const inSession = clock(now).session === 'Regular session';
  if (!inSession) return 30 * 60_000;
  if (tf === '5m' || tf === '15m') {
    const period = (tf === '5m' ? 5 : 15) * 60_000;
    return period - (now % period) + 20_000; // 20s after each bar closes
  }
  return 15 * 60_000;
}

async function load(key: string, sym: string, tf: TF) {
  const e = store.get(key)!;
  try {
    const r = await fetch(`/api/candles?symbol=${encodeURIComponent(sym)}&tf=${tf}`);
    const j = await r.json();
    if (!r.ok) {
      e.state = {
        ...e.state,
        loading: false,
        error: j.error ?? `HTTP ${r.status}`,
        // "unavailable" is reserved for things no free source offers; a missing key or outage is "no data"
        freshness: j.unavailable ? 'unavailable' : e.state.bars.length ? e.state.freshness : 'nodata',
      };
    } else {
      e.state = { bars: j.bars, source: j.source, freshness: j.freshness, asOf: j.asOf, loading: false, note: j.note };
      if (j.bars?.length) saveLocal(cacheKey(sym, tf), { bars: j.bars.slice(-400), source: j.source, at: j.asOf });
    }
  } catch (err) {
    e.state = { ...e.state, loading: false, error: (err as Error).message };
  }
  e.subs.forEach((f) => f());
  // after a failure (429 rate limit, outage) try again in a minute instead of waiting for the normal cadence
  if (e.subs.size) e.timer = setTimeout(() => load(key, sym, tf), e.state.error ? 60_000 : nextRefreshMs(tf));
}

function subscribe(key: string, sym: string, tf: TF, live: boolean, demoLast: number) {
  return (cb: () => void) => {
    let e = store.get(key);
    if (!e) {
      e = { state: EMPTY, subs: new Set(), live };
      store.set(key, e);
      if (live) { const c = cachedSeries(sym, tf); if (c) e.state = c; load(key, sym, tf); }
      else e.state = { bars: makeCandles(sym, tf, demoLast), source: 'Generated sample candles', freshness: 'demo', asOf: DEMO_AT, loading: false };
    }
    e.subs.add(cb);
    return () => {
      e!.subs.delete(cb);
      if (!e!.subs.size) { clearTimeout(e!.timer); store.delete(key); }
    };
  };
}

export function useSeries(sym: string, tf: TF, mode: DataMode, demoLast: number): SeriesState {
  const live = mode.kind === 'live';
  const key = `${mode.kind}:${sym}:${tf}`;
  const sub = useMemo(() => subscribe(key, sym, tf, live, demoLast), [key, sym, tf, live, demoLast]);
  return useSyncExternalStore(sub, () => (mode.kind === 'checking' ? EMPTY : store.get(key)?.state ?? EMPTY));
}

/* ---------------- patch the forming bar with the latest quote ---------------- */
const PERIOD: Record<TF, number> = { '5m': 300, '15m': 900, '1H': 3600, D: 86400, W: 7 * 86400, M: 31 * 86400 };

export function patchWithQuote(bars: Bar[], q: QuoteResult | undefined, tf: TF): Bar[] {
  if (!q || !bars.length || !Number.isFinite(q.last) || !q.t) return bars;
  const enc = encodeInstant(q.t);
  const last = bars[bars.length - 1];
  if (tf === 'D') {
    const qDay = Math.floor(enc / 86400) * 86400;
    if (qDay === last.time) {
      const b = { ...last, close: q.last, high: Math.max(last.high, q.high || q.last), low: Math.min(last.low, q.low || q.last) };
      return [...bars.slice(0, -1), b];
    }
    if (qDay > last.time && Number.isFinite(q.open) && q.open > 0) {
      return [...bars, { time: qDay, open: q.open, high: q.high, low: q.low, close: q.last, volume: 0 }];
    }
    return bars;
  }
  const p = PERIOD[tf];
  if (tf === 'W' || tf === 'M') {
    // the open weekly / monthly bar takes the live price; a new period's bar appears with the next refresh
    if (enc >= last.time && enc < last.time + p) return [...bars.slice(0, -1), { ...last, close: q.last, high: Math.max(last.high, q.last), low: Math.min(last.low, q.last) }];
    return bars;
  }
  if (enc >= last.time && enc < last.time + p) {
    const b = { ...last, close: q.last, high: Math.max(last.high, q.last), low: Math.min(last.low, q.last) };
    return [...bars.slice(0, -1), b];
  }
  const min = Math.floor((enc % 86400) / 60);
  if (enc >= last.time + p && min >= 570 && min < 960 && enc - last.time < 3 * p) {
    const start = enc - ((min - 570) * 60 % p) - (enc % 60);
    return [...bars, { time: start, open: q.last, high: q.last, low: q.last, close: q.last, volume: 0 }];
  }
  return bars;
}

/* ---------------- quotes ---------------- */
export interface QuotesState {
  quotes: Record<string, QuoteResult>;
  asOf: number;
  error?: string;
  source: string;
  freshness: Freshness;
}

export function useQuotes(symbols: string[], mode: DataMode, baseMs = 30_000): QuotesState | null {
  // Finnhub free is 60 calls/min and quotes are one call per symbol: stretch the interval for big lists
  const intervalMs = Math.max(baseMs, symbols.length * 1200);
  const [st, setSt] = useState<QuotesState | null>(null);
  const key = symbols.join(',');
  useEffect(() => {
    if (mode.kind !== 'live' || !key) return;
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(`/api/quotes?symbols=${key}`);
        const j = await r.json();
        if (!stop) {
          if (r.ok) {
            const quotes: Record<string, QuoteResult> = {};
            for (const q of j.quotes as QuoteResult[]) quotes[q.symbol] = q;
            setSt((s) => ({ quotes: { ...s?.quotes, ...quotes }, asOf: Date.now(), source: [...new Set(j.quotes.map((q: QuoteResult) => q.source))].join(' + '), freshness: 'live', error: j.stale ? 'Some quotes are cached (rate-limited)' : undefined }));
          } else setSt((s) => (s ? { ...s, error: j.error } : { quotes: {}, asOf: Date.now(), source: '', freshness: 'nodata', error: j.error }));
        }
      } catch (e) {
        if (!stop) setSt((s) => (s ? { ...s, error: (e as Error).message } : s));
      }
      const inSession = clock().session !== 'Closed';
      if (!stop) t = setTimeout(tick, inSession ? intervalMs : intervalMs * 10);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }, [key, mode.kind, intervalMs]);
  return st;
}

export function useMacro(mode: DataMode): MacroResult | null {
  const [m, setM] = useState<MacroResult | null>(null);
  useEffect(() => {
    if (mode.kind !== 'live' || !mode.health.providers.fred) return;
    let stop = false;
    const go = () => fetch('/api/macro').then((r) => (r.ok ? r.json() : null)).then((j) => !stop && j && setM(j)).catch(() => {});
    go();
    const id = setInterval(go, 3 * 3600_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode]);
  return m;
}
