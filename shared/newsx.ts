// News tools: top stories (headlines from different outlets grouped into one story and ranked by how many outlets carry
// it), search across every headline the desk has kept, and the archive that keeps them. Pure functions (tested).

export interface Head { id: string; t: number; title: string; src: string; url: string; syms: string[]; sentiment?: number; summary?: string }

const STOP = new Set('the a an and or of to in on for with as at by from after over into amid is are was were be its it this that new says say said will may could would than more about up down out off us u.s. vs stock stocks shares share market markets report reports why how what who when where here'.split(' '));
export const words = (s: string) => new Set(s.toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9$. ]/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };

/** Names in a headline (capitalised words after the first): two shared names usually mean the same story. */
export const names = (s: string) => new Set(s.replace(/[’']s\b/g, '').split(/[^A-Za-z0-9&.-]+/).slice(1).filter((w) => /^[A-Z][a-zA-Z0-9&.-]{2,}$/.test(w) && !STOP.has(w.toLowerCase())).map((w) => w.toLowerCase()));

export interface Story { key: string; title: string; url: string; t0: number; t1: number; sources: string[]; items: Head[]; syms: string[]; tone: number | null; score: number }
/** Group headlines about the same thing, then rank: distinct outlets count most, then how many headlines, then how recent. */
export function topStories(items: Head[], now: number, hours = 24, max = 30): Story[] {
  const recent = items.filter((x) => now - x.t <= hours * 3600_000).sort((a, b) => b.t - a.t);
  const groups: { w: Set<string>; n: Set<string>; items: Head[] }[] = [];
  for (const x of recent) {
    const w = words(x.title), n = names(x.title);
    let best: { g: (typeof groups)[number]; s: number } | null = null;
    for (const g of groups) {
      let sharedNames = 0;
      for (const t of n) if (g.n.has(t)) sharedNames++;
      const sameTicker = x.syms.some((y) => g.items.some((i) => i.syms.includes(y)));
      const s = jaccard(w, g.w) + (sameTicker ? 0.1 : 0) + Math.min(sharedNames, 3) * 0.12;
      if (s >= 0.34 && (!best || s > best.s)) best = { g, s };
    }
    if (best) { best.g.items.push(x); for (const t of w) best.g.w.add(t); for (const t of n) best.g.n.add(t); } else groups.push({ w, n, items: [x] });
  }
  return groups.map((g) => {
    const sources = [...new Set(g.items.map((i) => i.src))];
    const t1 = Math.max(...g.items.map((i) => i.t)), t0 = Math.min(...g.items.map((i) => i.t));
    const tones = g.items.map((i) => i.sentiment).filter((s): s is number => s != null);
    const lead = [...g.items].sort((a, b) => a.t - b.t)[0]; // the first outlet to report it
    const ageH = (now - t1) / 3600_000;
    return {
      key: lead.id, title: lead.title, url: lead.url, t0, t1, sources, items: g.items.sort((a, b) => b.t - a.t),
      syms: [...new Set(g.items.flatMap((i) => i.syms))].slice(0, 6), tone: tones.length ? tones.reduce((a, b) => a + b, 0) / tones.length : null,
      score: sources.length * 3 + Math.min(g.items.length, 8) - ageH / 6,
    };
  }).filter((s) => s.sources.length >= 2).sort((a, b) => b.score - a.score).slice(0, max); // one outlet repeating itself isn't a top story
}

/** Search: every word must appear (any order), "quoted phrases" exactly, $TICKER matches tagged tickers. Newest first. */
export function searchNews(items: Head[], q: string, max = 200): Head[] {
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  const rest = q.replace(/"[^"]*"/g, ' ').trim().split(/\s+/).filter(Boolean);
  const tickers = rest.filter((w) => /^\$[A-Za-z.]{1,6}$/.test(w)).map((w) => w.slice(1).toUpperCase());
  const terms = rest.filter((w) => !w.startsWith('$')).map((w) => w.toLowerCase());
  if (!phrases.length && !terms.length && !tickers.length) return [];
  return items.filter((x) => {
    const hay = `${x.title} ${x.summary ?? ''}`.toLowerCase();
    return phrases.every((p) => hay.includes(p)) && terms.every((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(hay)) && tickers.every((t) => x.syms.includes(t) || new RegExp(`\\b${t}\\b`).test(x.title));
  }).sort((a, b) => b.t - a.t).slice(0, max);
}

/** Keep headlines (deduped by link or title), newest first, up to `max` and `days` old. Summaries are cut to save space. */
export function mergeArchive(archive: Head[], add: Head[], now: number, max = 3000, days = 21): Head[] {
  const key = (x: Head) => x.url || x.title.toLowerCase().slice(0, 90);
  const seen = new Set<string>();
  const out: Head[] = [];
  for (const x of [...add, ...archive].sort((a, b) => b.t - a.t)) {
    const k = key(x);
    if (seen.has(k) || now - x.t > days * 86400_000 || !x.title) continue;
    seen.add(k);
    out.push({ id: x.id, t: x.t, title: x.title, src: x.src, url: x.url, syms: x.syms ?? [], sentiment: x.sentiment, summary: x.summary?.slice(0, 200) });
    if (out.length >= max) break;
  }
  return out;
}
