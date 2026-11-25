// Options "tide": call vs put premium traded through the day, built from Cboe delayed chain snapshots taken while the
// desk is open (about every 10-15 minutes). Gross premium (volume × mid), not net: free data has no buy / sell side.
// Stored in this browser, last 10 trading days per ticker.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';
import type { PremTotals } from '../../shared/gamma';

export interface TidePt extends PremTotals { t: number; spot: number }
const KEY = 'tide';
let all: Record<string, Record<string, TidePt[]>> = load(KEY, {});
const subs = new Set<() => void>();
const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms);

/** Record one chain snapshot (deduped by the chain's own timestamp). */
export function recordTide(sym: string, t: number | null | undefined, spot: number, prem: PremTotals | undefined) {
  if (!prem || !t || !(spot > 0)) return;
  const day = etDay(t), bySym = { ...(all[sym] ?? {}) }, pts = bySym[day] ?? [];
  if (pts.some((p) => p.t === t)) return;
  bySym[day] = [...pts, { ...prem, t, spot }].sort((a, b) => a.t - b.t);
  const days = Object.keys(bySym).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 10))) delete bySym[d];
  all = { ...all, [sym]: bySym }; save(KEY, all); subs.forEach((f) => f());
}
export const useTide = (sym: string) => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => all[sym]);
