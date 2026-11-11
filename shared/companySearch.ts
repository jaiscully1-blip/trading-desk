// Ranking for the Company page search: by ticker or by name, typo-tolerant. Exact ticker first, then ticker prefix, then a name
// that starts with the words typed, then names containing them, then loose in-order matches.
import { fuzzyScore } from './fuzzy.js';

export interface CoHit { sym: string; name: string; note?: string }

const clean = (s: string) => s.toLowerCase().replace(/[.,]/g, '').replace(/\b(inc|corp|corporation|co|company|ltd|plc|holdings?|group|class [a-c])\b/g, '').replace(/\s+/g, ' ').trim();

export function scoreCompany(q: string, c: CoHit): number | null {
  const t = q.trim();
  if (!t) return null;
  const up = t.toUpperCase(), lo = clean(t), name = clean(c.name);
  if (c.sym === up) return 3000;
  if (c.sym.startsWith(up) && up.length <= 5) return 2500 - c.sym.length;
  if (name.startsWith(lo)) return 2000 - name.length / 10;
  if (name.split(' ').some((w) => w.startsWith(lo))) return 1700 - name.length / 10;
  if (lo.length >= 3 && name.includes(lo)) return 1400 - name.indexOf(lo);
  const f = lo.length >= 3 ? fuzzyScore(lo, name) : null;
  return f != null && f > 40 ? 500 + f : null;
}

export function searchCompanies(q: string, list: CoHit[], limit = 8): CoHit[] {
  const scored = list.map((c) => ({ c, s: scoreCompany(q, c) })).filter((x): x is { c: CoHit; s: number } => x.s != null);
  // loose in-order matches (typos) only when nothing matches the name properly: "rocket" shouldn't list BlackRock
  const strong = scored.some((x) => x.s >= 1400);
  return scored.filter((x) => !strong || x.s >= 1400).sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.c);
}
