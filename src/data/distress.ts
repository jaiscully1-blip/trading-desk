// Distress read from /api/research?fn=distress: the nightly file (S&P 500 + Nasdaq-100) plus a live read for your own tickers
// outside it, plus FRED credit spreads. One shared fetch for the page, the Home widget and the world map; refreshed every 30 minutes.
// Live data only: in demo mode nothing is shown, because a made-up distress list would be worse than none.
import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import type { DistressFile, DistressRow } from '../../shared/distress';

export interface CreditPt { id: string; last: number; date: string; chg3m: number }
export interface DistressState { file: DistressFile | null; extras: DistressRow[]; credit: { hy: CreditPt | null; ccc: CreditPt | null; source: string } | null; errors: Record<string, string>; asOf: number }

let state: DistressState | null = null;
let stateKey = '';
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
let lastError = '';
const subs = new Set<() => void>();

async function refresh(symbols: string) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(`/api/research?fn=distress&symbols=${encodeURIComponent(symbols)}`);
      const j = await r.json();
      if (r.ok) { state = j as DistressState; stateKey = symbols; lastError = ''; } else lastError = j.error ?? `HTTP ${r.status}`;
    } catch (e) { lastError = (e as Error).message; }
    fetchedAt = Date.now();
    inflight = null;
    subs.forEach((f) => f());
  })();
  return inflight;
}

export function useDistress(mode: DataMode, symbols: string[]): { d: DistressState | null; rows: DistressRow[]; error: string; loading: boolean } {
  const [, bump] = useState(0);
  const key = [...new Set(symbols)].sort().slice(0, 40).join(',');
  useEffect(() => {
    if (mode.kind !== 'live') return;
    const f = () => bump((x) => x + 1);
    subs.add(f);
    if (!state || (key && stateKey !== key) || Date.now() - fetchedAt > 30 * 60_000) void refresh(key || stateKey); // the map asks with no tickers: reuse what the page fetched
    const id = setInterval(() => { if (Date.now() - fetchedAt > 30 * 60_000) void refresh(key || stateKey); }, 60_000);
    return () => { subs.delete(f); clearInterval(id); };
  }, [mode.kind, key]);
  const rows = state ? [...(state.file?.rows ?? []), ...state.extras] : [];
  return { d: state, rows, error: lastError || (state?.errors.file && !state.extras.length ? state.errors.file : ''), loading: mode.kind === 'live' && !state && !lastError };
}
