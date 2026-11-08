// Macro pack from /api/research?fn=macropack: Fed liquidity and credit rows (FRED), a year of VIX closes, and past CPI / jobs / FOMC dates.
// One shared fetch for every component that asks (the Macro widget and the Movement watch), refreshed every few hours.
import { useEffect, useState } from 'react';
import type { DataMode } from './live';
import type { LiqRow } from '../../shared/liquidity';
import type { EventDays } from '../../shared/movementStats';

export interface MacroPack { liquidity: LiqRow[]; vix: number[]; events: EventDays; /** SPY daily [time, open, high, low, close], about 3 years (Yahoo) */ spy?: number[][]; asOf: number; errors?: Record<string, string> }

let pack: MacroPack | null = null;
let inflight: Promise<void> | null = null;
let fetchedAt = 0;
let lastError = '';
const subs = new Set<() => void>();

async function refresh() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/research?fn=macropack');
      const j = await r.json();
      if (r.ok) { pack = j as MacroPack; lastError = ''; } else lastError = j.error ?? `HTTP ${r.status}`;
    } catch (e) { lastError = (e as Error).message; }
    fetchedAt = Date.now();
    inflight = null;
    subs.forEach((f) => f());
  })();
  return inflight;
}

export function useMacroPack(mode: DataMode): { pack: MacroPack | null; error: string; loading: boolean } {
  const [, bump] = useState(0);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    const f = () => bump((x) => x + 1);
    subs.add(f);
    if (!pack || Date.now() - fetchedAt > 3 * 3600_000) void refresh();
    const id = setInterval(() => { if (Date.now() - fetchedAt > 3 * 3600_000) void refresh(); }, 15 * 60_000);
    return () => { subs.delete(f); clearInterval(id); };
  }, [mode.kind]);
  return { pack, error: lastError, loading: mode.kind === 'live' && !pack && !lastError };
}
