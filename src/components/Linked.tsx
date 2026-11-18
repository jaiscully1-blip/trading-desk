// Turns company names inside any text (headlines, notes) into names you can hover for the preview card and click
// for the company peek, without leaving the page. Uses the names the desk already knows (S&P 500 / Nasdaq-100 and
// anything loaded) plus well-known brands (Google, Instagram, AWS...).
import { useMemo, type ReactNode } from 'react';
import { useDesk } from '../lib/deskctx';
import { BRAND_PARENT } from '../../shared/company';
import { openPeek } from './CompanyPeek';

// words that are company names but also everyday words: only linked as a ticker, never as a name
const SKIP = new Set(['consumer', 'dow', 'nasdaq', 'west', 'east', 'north', 'south', 'interactive', 'federal', 'new', 'regal', 'crown', 'prime', 'atlas', 'summit', 'liberty', 'freedom', 'standard', 'royal', 'union', 'republic', 'central', 'pacific', 'atlantic', 'world', 'general', 'american', 'united', 'first', 'national', 'international', 'global', 'energy', 'bank', 'group', 'health', 'capital', 'digital', 'data', 'real', 'live', 'block', 'match', 'target', 'gap', 'ball', 'progressive', 'public', 'southern', 'eastern', 'western', 'pioneer', 'insight', 'news', 'fox', 'equity', 'core', 'select', 'ross', 'best', 'state', 'focus', 'paramount', 'carrier', 'corning', 'textron', 'trade', 'cash', 'square', 'home', 'dollar', 'regions', 'citizens', 'principal', 'american', 'old', 'big', 'five', 'super', 'intuitive', 'advanced', 'applied', 'analog', 'electronic', 'texas', 'micron', 'meta', 'oracle', 'amazon', 'apple', 'visa']);
const KEEP = new Set(['meta', 'oracle', 'amazon', 'apple', 'visa', 'target']); // famous enough to link even though they are words
const SUFFIX = /\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|llc|holdings?|group|the|class [a-c]|common stock|ordinary shares|n\.?v|s\.?a|sa|ag|se)\b\.?/gi;

export function shortName(full: string): string | null {
  const s = full.replace(/\(.*?\)/g, ' ').replace(/&amp;/g, '&').replace(SUFFIX, ' ').replace(/[.,]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const words = s.split(' '), one = words[0], STOP = new Set(['of', 'and', '&', 'the', 'for']);
  let pick = one;
  if (words.length > 1 && (one.length < 4 || SKIP.has(one.toLowerCase()))) { // a common word alone: keep adding words until two real ones
    const out: string[] = []; let real = 0;
    for (const w of words) { out.push(w); if (!STOP.has(w.toLowerCase())) real++; if (real >= 2) break; }
    pick = out.join(' ');
  }
  if (pick.length < 3 || (SKIP.has(pick.toLowerCase()) && !KEEP.has(pick.toLowerCase()))) return null;
  return pick;
}

let cache: { key: number; rx: RegExp | null; map: Map<string, string> } | null = null;
function index(names: Record<string, string>) {
  const n = Object.keys(names).length;
  if (cache && cache.key === n) return cache;
  const map = new Map<string, string>();
  // brands first (Alphabet/Google -> GOOGL, the main share class), then companies; funds are skipped
  for (const [brand, sym] of Object.entries(BRAND_PARENT)) if (sym && brand.length >= 4) map.set(brand, sym);
  for (const [sym, full] of Object.entries(names)) { if (/\b(ETF|Fund|SPDR|Trust|iShares|ProShares|Index|Select Sector|Portfolio)\b/i.test(full ?? '')) continue; const k = shortName(full ?? ''); if (k && !map.has(k.toLowerCase())) map.set(k.toLowerCase(), sym); }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  cache = { key: n, map, rx: keys.length ? new RegExp(`\\b(${keys.join('|')})(?:'s|’s)?\\b`, 'gi') : null };
  return cache;
}

/** Text with company names linked. Names must start with a capital letter in the text (so "apple pie" stays plain). */
export function Linked({ text, max = 4 }: { text: string; max?: number }) {
  const { names } = useDesk();
  const parts = useMemo(() => {
    const { rx, map } = index(names);
    if (!rx || !text) return [text];
    const out: ReactNode[] = []; let last = 0, n = 0;
    for (const m of text.matchAll(rx)) {
      const word = m[1], sym = map.get(word.toLowerCase());
      if (!sym || !/^[A-Z]/.test(word) || n >= max) continue;
      out.push(text.slice(last, m.index));
      out.push(<span key={m.index} className="co-link" data-sym={sym} role="link" tabIndex={-1} title={`${word}: hover for a preview, click to open (${sym})`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); openPeek(sym); }}>{m[0]}</span>);
      last = (m.index ?? 0) + m[0].length; n++;
    }
    out.push(text.slice(last));
    return out;
  }, [text, names, max]);
  return <>{parts}</>;
}
