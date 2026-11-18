// Research notebook: notes and clips you collect while researching (not trades). Saved in this browser under the
// desk account, grouped by ticker in Journal → Research. Anything with a "Save to research" button lands here.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export interface ResearchNote { id: string; t: number; sym?: string; title: string; body: string; src?: string; url?: string; kind?: string }
const KEY = 'research';
let notes: ResearchNote[] = load<ResearchNote[]>(KEY, []);
const subs = new Set<() => void>();
const set = (n: ResearchNote[]) => { notes = n; save(KEY, n); subs.forEach((f) => f()); };
const uid = () => `${Date.now().toString(36)}${Math.floor(performance.now() * 1000).toString(36).slice(-4)}`;

export const addResearch = (n: Omit<ResearchNote, 'id' | 't'>): ResearchNote => { const x = { ...n, sym: n.sym?.toUpperCase() || undefined, id: uid(), t: Date.now() }; set([x, ...notes]); return x; };
export const updateResearch = (id: string, patch: Partial<ResearchNote>) => set(notes.map((n) => (n.id === id ? { ...n, ...patch } : n)));
export const removeResearch = (id: string) => set(notes.filter((n) => n.id !== id));
export const useResearch = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => notes);

/** Markdown export of a set of notes (for pasting into Obsidian or anywhere). */
export function toMarkdown(xs: ResearchNote[]): string {
  const by = new Map<string, ResearchNote[]>();
  for (const n of xs) by.set(n.sym ?? 'General', [...(by.get(n.sym ?? 'General') ?? []), n]);
  return [...by].map(([k, v]) => `## ${k}\n\n${v.map((n) => `### ${n.title}\n_${new Date(n.t).toLocaleString()}${n.src ? ` · ${n.src}` : ''}_\n\n${n.body}${n.url ? `\n\n${n.url}` : ''}`).join('\n\n')}`).join('\n\n');
}
