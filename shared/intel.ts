// Filings Intel: pure text helpers (tested). Risk-factor diff between two 10-Ks, customer-concentration sentences,
// words that changed between two earnings calls, and the guidance-vs-actual comparison.

/** Item 1A (Risk Factors) of a 10-K as plain text, or '' when it can't be found. */
export function riskSection(text: string): string {
  const starts = [...text.matchAll(/item\s*1a\.?\s*[-–—:]?\s*risk\s+factors/gi)].map((m) => m.index ?? 0);
  if (!starts.length) return '';
  // the table of contents mentions it first: take the occurrence followed by the most text before Item 1B / Item 2
  let best = '';
  for (const s of starts) {
    const rest = text.slice(s + 20);
    const end = rest.search(/item\s*1b\.?\s*[-–—:]?\s*unresolved|item\s*1c\.?\s*[-–—:]?\s*cybersecurity|item\s*2\.?\s*[-–—:]?\s*properties/i);
    const sec = rest.slice(0, end > 0 ? end : 200_000);
    if (sec.length > best.length) best = sec;
  }
  return best;
}

const norm = (p: string) => p.toLowerCase().replace(/\d+/g, '#').replace(/[^a-z# ]+/g, ' ').replace(/\s+/g, ' ').trim();
const paras = (s: string) => s.split(/\n{1,}|(?<=\.)\s{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 160);

/** Paragraphs new in this year's risk factors, and ones dropped from last year's (fuzzy: 80% of words shared counts as the same). */
export function riskDiff(oldText: string, newText: string): { added: string[]; removed: string[]; oldCount: number; newCount: number } {
  const a = paras(oldText), b = paras(newText);
  const words = (p: string) => new Set(norm(p).split(' ').filter((w) => w.length > 3));
  const aw = a.map(words), bw = b.map(words);
  const same = (x: Set<string>, ys: Set<string>[]) => ys.some((y) => { let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.max(1, Math.min(x.size, y.size)) >= 0.8; });
  const added = b.filter((_, i) => !same(bw[i], aw)), removed = a.filter((_, i) => !same(aw[i], bw));
  const top = (xs: string[]) => [...xs].sort((x, y) => y.length - x.length).slice(0, 10).map((p) => (p.length > 420 ? `${p.slice(0, 420)}…` : p));
  return { added: top(added), removed: top(removed), oldCount: a.length, newCount: b.length };
}

/** Sentences naming a customer's share of revenue (e.g. "Customer A accounted for 14% of net revenue"). */
export function customerConcentration(text: string): string[] {
  const sents = text.replace(/\s+/g, ' ').split(/(?<=[.;])\s+(?=[A-Z])/);
  const share = /(accounted for|represented|comprised|contributed|made up)\s+(approximately\s+|about\s+|over\s+|more than\s+)?\d{1,2}(\.\d+)?\s?%\s+(and\s+\d{1,2}(\.\d+)?\s?%\s+)?of\s+(our\s+)?(total\s+|consolidated\s+|net\s+)*(revenues?|net sales|sales)/i;
  const hit = (s: string) => /\bcustomers?\b|\bdistributors?\b|\bclients?\b|\bpartners?\b/i.test(s) && share.test(s) && s.length < 600;
  return [...new Set(sents.filter(hit).map((s) => s.trim()))].slice(0, 8);
}

const STOP = new Set('the and for that with this have from they will were been their which about there would could into more than also some what when your just over very like then them these those only other such through while where being because each both after before most much many make made well even back still year quarter quarters think really going we our you are was its it’s it\'s can not but all any one two three'.split(' '));
/** Words used much more (or less) on this call than the last one, per 10,000 words. */
export function wordsChanged(prev: string, cur: string, n = 12): { up: { w: string; delta: number }[]; down: { w: string; delta: number }[] } {
  const freq = (t: string) => { const m = new Map<string, number>(); const ws = t.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []; for (const w of ws) if (!STOP.has(w)) m.set(w, (m.get(w) ?? 0) + 1); return { m, total: ws.length || 1 }; };
  const a = freq(prev), b = freq(cur);
  const all = new Set([...a.m.keys(), ...b.m.keys()]);
  const d = [...all].map((w) => ({ w, delta: ((b.m.get(w) ?? 0) / b.total - (a.m.get(w) ?? 0) / a.total) * 10_000 })).filter((x) => (a.m.get(x.w) ?? 0) + (b.m.get(x.w) ?? 0) >= 4);
  return { up: d.filter((x) => x.delta > 0).sort((x, y) => y.delta - x.delta).slice(0, n), down: d.filter((x) => x.delta < 0).sort((x, y) => x.delta - y.delta).slice(0, n) };
}

/** Guidance vs result: where the actual landed in (or outside) the guided range. */
export function guidanceCheck(low: number | null, high: number | null, actual: number | null): 'above' | 'inside' | 'below' | null {
  if (actual == null || (low == null && high == null)) return null;
  const lo = low ?? high!, hi = high ?? low!;
  return actual > hi ? 'above' : actual < lo ? 'below' : 'inside';
}

/** Calendar quarter label ("2026Q3") for a period end date. */
export const quarterOf = (end: string) => { const d = new Date(`${end}T00:00:00Z`); return `${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`; };
