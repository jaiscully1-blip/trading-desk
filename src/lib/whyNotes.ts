// "Why is it on my watchlist?" one-line notes per ticker. Shown on hover in the watchlist and next to the ticker in the
// Morning plan. Stored in this browser.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

const KEY = 'wlWhy';
let notes: Record<string, string> = load<Record<string, string>>(KEY, {});
const subs = new Set<() => void>();
export const useWhy = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => notes);
export function setWhy(sym: string, text: string) {
  const t = text.trim().slice(0, 140);
  const { [sym]: _, ...rest } = notes;
  notes = t ? { ...rest, [sym]: t } : rest;
  save(KEY, notes); subs.forEach((f) => f());
}
