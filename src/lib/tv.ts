// Floating live-TV windows, app-wide: any page (Messages, the Home TV widget, search) can open one, several can run at once,
// and they keep playing while you move between pages. Each window has its own sound (YouTube's own mute button). Saved per
// desk, so they come back after a reload.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export interface TvWin { id: string; name: string; src: string; x: number; y: number; w: number; min: boolean; z?: number }
export const MAX_TV = 6;
const KEY = 'tvWins';
const ok = (v: any): v is TvWin => v && typeof v.id === 'string' && typeof v.src === 'string' && /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(v.src);
let wins: TvWin[] = (() => { const v = load<unknown>(KEY, []); return Array.isArray(v) ? v.filter(ok).slice(0, MAX_TV) : []; })();
const subs = new Set<() => void>();
const set = (next: TvWin[]) => { wins = next; save(KEY, next); subs.forEach((f) => f()); };

export function useTvWins(): TvWin[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => wins, () => wins);
}
/** Open another floating window (staggered from the bottom right). False when the limit is reached. */
export function openTv(s: { name: string; src: string }): boolean {
  if (wins.length >= MAX_TV) return false;
  const w = 400, h = Math.round(w * 9 / 16) + 30, i = wins.length;
  const vw = typeof window === 'undefined' ? 1400 : window.innerWidth, vh = typeof window === 'undefined' ? 900 : window.innerHeight;
  set([...wins, { id: `tv${Date.now().toString(36)}${i}`, name: s.name, src: s.src, w, x: Math.max(8, vw - w - 24 - i * 36), y: Math.max(8, vh - h - 56 - i * 36), min: false }]);
  return true;
}
export const updateTv = (id: string, patch: Partial<TvWin>) => set(wins.map((w) => (w.id === id ? { ...w, ...patch } : w)));
export const closeTv = (id: string) => set(wins.filter((w) => w.id !== id));
/** Bring a window to the front by its stacking number (never by reordering: moving an iframe in the page reloads it). */
export const raiseTv = (id: string) => {
  const w = wins.find((x) => x.id === id); if (!w) return;
  const top = Math.max(0, ...wins.map((x) => x.z ?? 0));
  if ((w.z ?? 0) === top && wins.filter((x) => (x.z ?? 0) === top).length === 1) return; // already alone on top
  updateTv(id, { z: top + 1 });
};
