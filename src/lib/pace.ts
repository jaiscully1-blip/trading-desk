// Market-hours pacing: one rule for how often the desk refreshes, to save free-API budget, CPU and battery.
// Auto: normal speed in the regular session, 3× slower pre / after hours, at least 15 minutes when closed.
// Fast: twice as fast during the open (never under 5 s), normal speed otherwise. Saver: 4× slower than Auto. Hidden tabs are paused by the hooks themselves.
import { useSyncExternalStore } from 'react';
import { clock } from './clock';
import { load, save } from './store';

export type PaceMode = 'auto' | 'fast' | 'saver';
const KEY = 'paceMode';
let mode: PaceMode = load<PaceMode>(KEY, 'auto');
const subs = new Set<() => void>();
export const setPace = (m: PaceMode) => { mode = m; save(KEY, m); subs.forEach((f) => f()); };
export const usePace = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => mode);
export const PACE_LABEL: Record<PaceMode, string> = { auto: 'Auto', fast: 'Fast', saver: 'Saver' };

export type Phase = 'open' | 'pre' | 'post' | 'closed';
export function phase(now = Date.now()): Phase {
  const s = clock(now).session;
  return s === 'Regular session' ? 'open' : s === 'Pre-market' ? 'pre' : s === 'After-hours' ? 'post' : 'closed';
}
/** The refresh interval to use now for something that normally refreshes every `baseMs`. */
export function paceMs(baseMs: number, now = Date.now(), m: PaceMode = mode): number {
  if (baseMs <= 0) return baseMs;
  const p = phase(now);
  if (m === 'fast') return p === 'open' ? Math.max(5_000, baseMs / 2) : baseMs; // faster during the open (callers keep their own rate-limit floors)
  const auto = p === 'open' ? baseMs : p === 'closed' ? Math.max(baseMs * 12, 15 * 60_000) : baseMs * 3;
  return m === 'saver' ? auto * 4 : auto;
}
