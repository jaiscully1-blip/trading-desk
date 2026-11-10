// Earnings and IPO calendar from /api/research?fn=eventcal (Nasdaq public JSON + Finnhub + SEC EDGAR). One shared fetch for the
// widget and the Calendars page, refreshed every 15 minutes while something is showing it. Live data only: nothing is invented in demo mode.
import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import type { EarnItem, FilingItem, IpoItem } from '../../shared/eventsCal';

export interface EventCal {
  asOf: number; from: string; to: string; days: string[];
  earnings: EarnItem[]; totals: Record<string, number>; ipos: IpoItem[]; filings: FilingItem[];
  errors: Record<string, string>; sources: { earnings: string; ipos: string; filings: string };
}

let cal: EventCal | null = null;
let calKey = '';
let fetchedAt = 0;
let inflight: Promise<void> | null = null;
let lastError = '';
const subs = new Set<() => void>();

async function refresh(symbols: string) {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(`/api/research?fn=eventcal&symbols=${encodeURIComponent(symbols)}`);
      const j = await r.json();
      if (r.ok) { cal = j as EventCal; calKey = symbols; lastError = ''; } else lastError = j.error ?? `HTTP ${r.status}`;
    } catch (e) { lastError = (e as Error).message; }
    fetchedAt = Date.now();
    inflight = null;
    subs.forEach((f) => f());
  })();
  return inflight;
}

export function useEventCal(mode: DataMode, symbols: string[]): { cal: EventCal | null; error: string; loading: boolean } {
  const [, bump] = useState(0);
  const key = [...new Set(symbols)].sort().slice(0, 40).join(',');
  useEffect(() => {
    if (mode.kind !== 'live') return;
    const f = () => bump((x) => x + 1);
    subs.add(f);
    if (!cal || calKey !== key || Date.now() - fetchedAt > 15 * 60_000) void refresh(key);
    const id = setInterval(() => { if (Date.now() - fetchedAt > 15 * 60_000) void refresh(key); }, 60_000);
    return () => { subs.delete(f); clearInterval(id); };
  }, [mode.kind, key]);
  return { cal, error: lastError, loading: mode.kind === 'live' && !cal && !lastError };
}
