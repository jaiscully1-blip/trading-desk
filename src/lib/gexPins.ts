// Strikes pinned from the Gamma heatmap, drawn as quiet lines on that ticker's chart. Stored in this browser.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

const KEY = 'gexPins';
let pins: Record<string, number[]> = load<Record<string, number[]>>(KEY, {});
const subs = new Set<() => void>();
const set = (x: Record<string, number[]>) => { pins = x; save(KEY, x); subs.forEach((f) => f()); };
export const useGexPins = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => pins);
export const chartSym = (sym: string) => (sym === 'SPX' ? 'SPY' : sym);
/** Pin or unpin a strike for a ticker. SPX strikes are shown on the SPY chart at strike / 10 (approximate). */
export function togglePin(sym: string, k: number) {
  const xs = pins[sym] ?? [];
  set({ ...pins, [sym]: xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k].sort((a, b) => a - b) });
}
export const clearPins = (sym: string) => { const { [sym]: _, ...rest } = pins; set(rest); };
