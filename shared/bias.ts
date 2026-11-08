// Political lean of news: the outlet's AllSides rating, plus (for political stories only) an AI read of the headline's
// own framing. Blue = left, red = right, gray = center / neutral. Market news with no politics is just "not political".
import { DOMAINS, OLD_2019, VERIFIED, type Lean5 } from './data/bias.js';

export type ArticleLean = 'left' | 'center' | 'right';
export interface Lean {
  outlet: Lean5 | null; outletBasis: string | null; // e.g. "AllSides 2025-26"
  political: boolean;
  article?: ArticleLean; why?: string; // AI read of this headline (political stories only)
}

const norm = (s: string) => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '');
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function outletLean(src: string, url = ''): { lean: Lean5; basis: string } | null {
  const h = host(url);
  const byDomain = Object.entries(DOMAINS).find(([d]) => h === d || h.endsWith(`.${d}`))?.[1];
  for (const k of [byDomain, norm(src), norm(src.replace(/\.(com|org|net)$/i, ''))]) {
    if (!k) continue;
    if (VERIFIED[k]) return { lean: VERIFIED[k], basis: 'AllSides rating (reviewed 2025-26)' };
    if (OLD_2019[k]) return { lean: OLD_2019[k], basis: 'AllSides rating (2019 data, may be out of date)' };
  }
  return null;
}

// politics words: elections, parties, officials, partisan policy fights. Plain market / company news is not political.
const POL = /\b(trump|biden|harris|vance|obama|democrat\w*|republican\w*|gop|maga|congress\w*|senat\w*|house speaker|lawmakers?|white house|administration|election\w*|campaign|ballot|voter\w*|partisan|liberal\w*|conservative\w*|progressive\w*|left-wing|right-wing|immigration|deport\w*|abortion|gun control|impeach\w*|shutdown|filibuster|supreme court|governor|mayor|executive order|tariff\w*|sanction\w*|doge|epstein)\b/i;
export const isPolitical = (title: string, summary = '') => POL.test(`${title} ${summary.slice(0, 200)}`);

export function leanOf(src: string, url: string, title: string, summary?: string, ai?: { lean: ArticleLean; why: string }): Lean {
  const o = outletLean(src, url);
  const political = isPolitical(title, summary);
  return { outlet: o?.lean ?? null, outletBasis: o?.basis ?? null, political, ...(political && ai ? { article: ai.lean, why: ai.why } : {}) };
}

/** Color for the badge: the article's own read wins for political stories; otherwise the outlet's rating. */
export function leanColor(l: Lean | undefined): 'blue' | 'red' | 'gray' | null {
  if (!l) return null;
  if (l.political && l.article) return l.article === 'left' ? 'blue' : l.article === 'right' ? 'red' : 'gray';
  if (!l.outlet) return null;
  return l.outlet === 'L' || l.outlet === 'LL' ? 'blue' : l.outlet === 'R' || l.outlet === 'LR' ? 'red' : 'gray';
}
export const LEAN5_LABEL: Record<Lean5, string> = { L: 'Left', LL: 'Lean Left', C: 'Center', LR: 'Lean Right', R: 'Right' };

/** Simple stable key for caching an AI read of a headline. */
export function titleKey(t: string): string {
  let h = 5381;
  for (const ch of t.toLowerCase().replace(/\s+/g, ' ').trim()) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

export const LEAN_PROMPT = (items: { i: number; title: string; src: string }[]) => `You label the political framing of news headlines for a trader who wants to know when a story is slanted.
For each headline, judge ONLY its own wording and framing (loaded words, which side's claims are presented as fact, what is emphasized), not the topic and not the outlet.
- "center": straight, factual reporting, or both sides presented evenly. Most wire-style headlines are center.
- "left": framing that favors Democratic / progressive positions or is hostile to Republicans / conservatives.
- "right": framing that favors Republican / conservative positions or is hostile to Democrats / progressives.
Give a short reason (max 12 words) quoting the words that drove your call. When unsure, answer "center".
Headlines:
${items.map((x) => `${x.i}. [${x.src}] ${x.title}`).join('\n')}`;
export const LEAN_SCHEMA = { type: 'ARRAY', items: { type: 'OBJECT', properties: { i: { type: 'INTEGER' }, lean: { type: 'STRING', enum: ['left', 'center', 'right'] }, why: { type: 'STRING' } }, required: ['i', 'lean', 'why'] } };
