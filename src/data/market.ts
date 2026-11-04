import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import { setMarketCalendar, type MarketCalendar } from '../../shared/marketCalendar';

export interface MarketStatusState {
  status: { isOpen: boolean; session: string | null; holiday: string | null; source: string; t: number } | null;
  sources: { name: string; ok: boolean; error?: string }[];
  asOf: number;
}

/** Polls the market-status feed (every 10 min) and merges it into the clock's calendar. Without /api: published NYSE calendar only. */
export function useMarketStatus(mode: DataMode): MarketStatusState | null {
  const [st, setSt] = useState<MarketStatusState | null>(null);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false;
    const go = () => fetch('/api/market-status').then(async (r) => {
      if (!r.ok || stop) return;
      const j = await r.json();
      const cal = j.calendar as MarketCalendar;
      setMarketCalendar({ holidays: cal.holidays, early: cal.early, unscheduled: cal.unscheduled });
      setSt({ status: j.status, sources: j.sources, asOf: j.asOf });
    }).catch(() => {});
    go();
    const id = setInterval(go, 10 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind]);
  return st;
}
