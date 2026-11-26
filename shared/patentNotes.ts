// Nightly patent notes for the tickers in patents/tickers.txt. Plain, quiet facts: what was made public or granted this week,
// a first filing in a tech area not seen before, and a change in the 12-month grant trend. No scores, streaks or badges.
// Pure + tested; the nightly job (scripts/patents-build.ts) supplies the numbers.

export interface TickerNight {
  sym: string; name: string; names: string[];
  week: { published: number | null; granted: number | null; from: string; to: string };
  trendWord: string | null; trendPct: number | null;
  areasSeen: string[];          // every tech area seen in this name's latest filings, across runs
  notes: string[];
}
export interface PatentsNightFile { schema: 1; asOf: string; tickers: Record<string, TickerNight>; patents: Record<string, unknown>; radar: unknown | null; errors: Record<string, string> }

/** Tickers from the list file: one per line, # starts a comment, max 40. */
export function parseTickerList(txt: string): string[] {
  return [...new Set(txt.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))].slice(0, 40);
}

/** The 7 days ending yesterday. */
export function lastWeek(now: Date): { from: string; to: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  const start = new Date(end.getTime() - 6 * 86400000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
/** Notes for one ticker, comparing tonight with the last run. `recentAreas` = tech areas of filings made public this week. */
export function buildNotes(cur: { week: TickerNight['week']; trendWord: string | null; trendPct: number | null; recentAreas: string[] }, prev: TickerNight | null): string[] {
  const out: string[] = [];
  const w = cur.week;
  if (w.published || w.granted) {
    const parts = [w.published ? `${plural(w.published, 'application')} made public` : '', w.granted ? `${plural(w.granted, 'patent')} granted` : ''].filter(Boolean);
    out.push(`This week (${w.from} to ${w.to}): ${parts.join(', ')}.`);
  }
  if (prev) {
    const fresh = [...new Set(cur.recentAreas)].filter((a) => !prev.areasSeen.includes(a));
    if (fresh.length) out.push(`First filing seen in ${fresh.join(', ')}.`);
    if (cur.trendWord && prev.trendWord && cur.trendWord !== prev.trendWord && cur.trendPct != null) out.push(`Grants over the last 12 months are now ${cur.trendWord} (${cur.trendPct >= 0 ? '+' : ''}${Math.round(cur.trendPct)}% vs the year before; was ${prev.trendWord}).`);
  }
  return out;
}
