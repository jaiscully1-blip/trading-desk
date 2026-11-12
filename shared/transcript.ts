// Earnings call transcripts (Alpha Vantage EARNINGS_CALL_TRANSCRIPT, free key, 25 calls a day shared with the rest of
// the desk): speaker turns with Alpha Vantage's sentiment score per turn (−1 to 1, model-made), split into prepared
// remarks and Q&A, plus which analysts asked questions. Pure functions (tested).

export interface Turn { speaker: string; title: string; text: string; sentiment: number | null; role: 'company' | 'analyst' | 'operator' }
export interface Transcript { sym: string; quarter: string; turns: Turn[] }

const roleOf = (speaker: string, title: string): Turn['role'] =>
  /operator/i.test(speaker) || /operator/i.test(title) ? 'operator' : /analyst|research|securities|capital|partners|bank|equity|llc|& co/i.test(title) && !/chief|officer|president|director of investor|head of investor|vice president/i.test(title) ? 'analyst' : 'company';

export function parseTranscript(j: any, sym: string, quarter: string): Transcript | null {
  const rows = Array.isArray(j?.transcript) ? j.transcript : [];
  const turns: Turn[] = rows.filter((r: any) => typeof r?.content === 'string' && r.content.trim()).map((r: any) => {
    const s = Number(r.sentiment);
    const speaker = String(r.speaker ?? '').trim(), title = String(r.title ?? '').trim();
    return { speaker, title, text: r.content.trim(), sentiment: Number.isFinite(s) ? s : null, role: roleOf(speaker, title) };
  });
  return turns.length ? { sym, quarter: String(j?.quarter ?? quarter), turns } : null;
}

/** Index of the first analyst question: everything before it is prepared remarks. */
export const qaStart = (t: Transcript) => { const i = t.turns.findIndex((x) => x.role === 'analyst'); return i < 0 ? t.turns.length : i; };

export function transcriptSummary(t: Transcript) {
  const avg = (xs: Turn[]) => { const v = xs.map((x) => x.sentiment).filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const q = qaStart(t);
  // the investor-relations host only reads disclaimers and hands over: left out of the tone
  const exec = (x: Turn) => x.role === 'company' && !/investor relations/i.test(x.title);
  const prepared = t.turns.slice(0, q).filter(exec), answers = t.turns.slice(q).filter(exec);
  const analysts = [...new Map(t.turns.filter((x) => x.role === 'analyst').map((x) => [x.speaker, x.title])).entries()].map(([name, firm]) => ({ name, firm: firm.replace(/^analyst,?\s*/i, '') }));
  const words = t.turns.reduce((a, x) => a + x.text.split(/\s+/).length, 0);
  return { prepared: avg(prepared), answers: avg(answers), analystsTone: avg(t.turns.filter((x) => x.role === 'analyst')), analysts, words, turns: t.turns.length };
}

/** Fiscal quarters to try, newest first: the calendar quarter just ended and the three before it (companies' fiscal years differ). */
export function quarterCandidates(nowMs: number, n = 4): string[] {
  const d = new Date(nowMs);
  let y = d.getUTCFullYear(), q = Math.floor(d.getUTCMonth() / 3) + 1; // current calendar quarter
  const out: string[] = [];
  for (let i = 0; i < n; i++) { out.push(`${y}Q${q}`); q -= 1; if (q === 0) { q = 4; y -= 1; } }
  return out;
}

/** Usual call time from the report timing (companies set their own; this is only the common pattern). */
export const usualCallTime = (when: string) => (when === 'amc' ? 'usually 4:30–5:00 PM ET' : when === 'bmo' ? 'usually 8:00–9:00 AM ET' : 'time not announced');
