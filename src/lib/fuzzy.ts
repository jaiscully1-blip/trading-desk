// Small fuzzy matcher for the command bar: every typed character must appear in order. Matches at the start, at word starts and
// in a row score higher, so "jr" finds "Journal" before "major". Returns null when it doesn't match.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, ''), t = text.toLowerCase();
  if (!q) return 0;
  if (t.startsWith(q)) return 1000 - t.length;
  const at = t.indexOf(q);
  if (at >= 0) return 700 - at - t.length / 10 + (/\W/.test(t[at - 1] ?? ' ') ? 100 : 0);
  let score = 0, ti = 0, run = 0;
  for (const c of q) {
    const k = t.indexOf(c, ti);
    if (k < 0) return null;
    const wordStart = k === 0 || /[\s\-/:,(]/.test(t[k - 1]);
    run = k === ti ? run + 1 : 0;
    score += 10 + (wordStart ? 25 : 0) + run * 8 - Math.min(20, k - ti);
    ti = k + 1;
  }
  return score;
}
