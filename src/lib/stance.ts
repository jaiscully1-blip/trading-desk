// Your stance on each ticker, choose-only (no typing): long-term view, short-term view and chart shape. Stored in this browser
// (per desk account) and shared by every component through a tiny store. Your own labels for yourself: not a signal, not advice.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export type Dir = 'bull' | 'bear' | 'neutral';
export interface Stance { long?: Dir; short?: Dir; shape?: string }
export const DIRS: { id: Dir; label: string; glyph: string }[] = [
  { id: 'bull', label: 'Bull', glyph: '▲' }, { id: 'neutral', label: 'Neutral', glyph: '◆' }, { id: 'bear', label: 'Bear', glyph: '▼' },
];
export const SHAPES: { id: string; label: string; glyph: string }[] = [
  { id: 'channel-up', label: 'Channel up', glyph: '⟋' }, { id: 'channel-down', label: 'Channel down', glyph: '⟍' }, { id: 'range', label: 'Sideways range', glyph: '═' },
  { id: 'breakout', label: 'Breakout', glyph: '⤒' }, { id: 'breakdown', label: 'Breakdown', glyph: '⤓' }, { id: 'pullback', label: 'Pullback in uptrend', glyph: '↘' },
  { id: 'bounce', label: 'Bounce in downtrend', glyph: '↗' }, { id: 'wedge', label: 'Wedge / squeeze', glyph: '◁' }, { id: 'base', label: 'Basing', glyph: '⌣' },
];
const g = (d?: Dir) => DIRS.find((x) => x.id === d)?.glyph ?? '';
/** short text shown next to the ticker, e.g. "L▲ S▼ ⟋" */
export function badge(s?: Stance): string {
  if (!s) return '';
  return [s.long ? `L${g(s.long)}` : '', s.short ? `S${g(s.short)}` : '', SHAPES.find((x) => x.id === s.shape)?.glyph ?? ''].filter(Boolean).join(' ');
}
/** overall colour hint: long-term view if set, else short-term */
export const tone = (s?: Stance): Dir | '' => s?.long ?? s?.short ?? '';
export const describe = (s?: Stance): string => (s ? [s.long && `Long term: ${s.long}`, s.short && `Short term: ${s.short}`, SHAPES.find((x) => x.id === s.shape)?.label].filter(Boolean).join(' · ') : '');

type Map = Record<string, Stance>;
let cache: Map | null = null;
const subs = new Set<() => void>();
const get = (): Map => (cache ??= load<Map>('stances', {}));
export const allStances = get;
export function setStance(sym: string, patch: Stance | null) {
  const next = { ...get() };
  if (!patch) delete next[sym];
  else { const m = { ...next[sym], ...patch }; (Object.keys(m) as (keyof Stance)[]).forEach((k) => { if (m[k] == null) delete m[k]; }); if (Object.keys(m).length) next[sym] = m; else delete next[sym]; }
  cache = next; save('stances', next); subs.forEach((f) => f());
}
export const useStances = (): Map => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, get, get);
export const openStance = (sym: string, x: number, y: number) => window.dispatchEvent(new CustomEvent('td-stance', { detail: { sym, x, y } }));
