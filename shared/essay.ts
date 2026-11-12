// Essays page: the numbers behind a chart range (pure, tested), the citation sentence it inserts, and the Gemini prompts
// for "outline" and "fact check". Facts come from real daily bars; the AI only arranges and checks, and never says what to trade.

export interface DayBar { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface RangeStats {
  from: number; to: number; days: number; startPx: number; endPx: number; chgPct: number; high: number; low: number;
  highAt: number; lowAt: number; upDays: number; avgVol: number; volVsNormal: number | null; spyChgPct: number | null; vsSpy: number | null;
}

const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
export const ymd = day;
export const fmtDay = (t: number) => new Date(t * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** Stats for bars[i0..i1] (inclusive). The move is measured from the close before the range (or the first open). */
export function rangeStats(bars: DayBar[], i0: number, i1: number, spy?: DayBar[]): RangeStats | null {
  if (!bars.length) return null;
  const a = Math.max(0, Math.min(i0, i1)), b = Math.min(bars.length - 1, Math.max(i0, i1));
  const seg = bars.slice(a, b + 1);
  if (!seg.length) return null;
  const startPx = a > 0 ? bars[a - 1].close : seg[0].open, endPx = seg[seg.length - 1].close;
  let hi = seg[0], lo = seg[0];
  for (const x of seg) { if (x.high > hi.high) hi = x; if (x.low < lo.low) lo = x; }
  const avgVol = seg.reduce((s, x) => s + x.volume, 0) / seg.length;
  const before = bars.slice(Math.max(0, a - 50), a).filter((x) => x.volume > 0);
  const normal = before.length >= 10 ? before.reduce((s, x) => s + x.volume, 0) / before.length : null;
  let spyChgPct: number | null = null;
  if (spy?.length) {
    const s0 = [...spy].reverse().find((x) => day(x.time) < day(seg[0].time)), s1 = [...spy].reverse().find((x) => day(x.time) <= day(seg[seg.length - 1].time));
    if (s0 && s1) spyChgPct = (s1.close / s0.close - 1) * 100;
  }
  const chgPct = (endPx / startPx - 1) * 100;
  return {
    from: seg[0].time, to: seg[seg.length - 1].time, days: seg.length, startPx, endPx, chgPct, high: hi.high, low: lo.low, highAt: hi.time, lowAt: lo.time,
    upDays: seg.filter((x, i) => x.close > (i === 0 ? startPx : seg[i - 1].close)).length, avgVol, volVsNormal: normal ? avgVol / normal : null,
    spyChgPct, vsSpy: spyChgPct == null ? null : chgPct - spyChgPct,
  };
}

/** The sentence a range drops into the essay. */
export function citeText(sym: string, s: RangeStats): string {
  const verb = s.chgPct >= 0 ? 'rose' : 'fell';
  const span = s.days === 1 ? `on ${fmtDay(s.from)}` : `from ${fmtDay(s.from)} to ${fmtDay(s.to)}`;
  const vs = s.spyChgPct == null ? '' : ` (SPY ${s.spyChgPct >= 0 ? '+' : ''}${s.spyChgPct.toFixed(1)}%)`;
  return `${sym} ${verb} ${Math.abs(s.chgPct).toFixed(1)}% ${span}${vs}`;
}

/** Facts list sent to the AI fact check: one line per cited range, straight from the bars. */
export function factLines(sym: string, s: RangeStats): string {
  return `${sym} ${ymd(s.from)} to ${ymd(s.to)} (${s.days} trading days): close before ${s.startPx.toFixed(2)}, last close ${s.endPx.toFixed(2)}, change ${s.chgPct.toFixed(2)}%, high ${s.high.toFixed(2)} on ${ymd(s.highAt)}, low ${s.low.toFixed(2)} on ${ymd(s.lowAt)}, ${s.upDays} up days${s.volVsNormal ? `, volume ${s.volVsNormal.toFixed(2)}x normal` : ''}${s.spyChgPct != null ? `, SPY ${s.spyChgPct.toFixed(2)}% over the same days` : ''}.`;
}

export const OUTLINE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { heading: { type: 'STRING' }, points: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['heading', 'points'] } },
    questions: { type: 'ARRAY', items: { type: 'STRING' } },
    missing: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['sections', 'questions', 'missing'],
};
export const CHECK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    claims: { type: 'ARRAY', items: { type: 'OBJECT', properties: { quote: { type: 'STRING' }, verdict: { type: 'STRING', enum: ['matches', 'wrong', 'unverified'] }, note: { type: 'STRING' } }, required: ['quote', 'verdict', 'note'] } },
  },
  required: ['claims'],
};

const RULES = 'Never tell anyone to buy, sell, short or hold anything; no price targets, no position sizes. You help structure and check writing; the writer decides.';

export function outlinePrompt(o: { sym: string; title: string; text: string; facts: string[] }): string {
  return `You help someone write an essay about the stock ${o.sym}${o.title ? ` titled "${o.title}"` : ''}. Suggest an outline for the essay they are writing.
- sections: 4 to 7 headings in a sensible order (for example: what happened, why, the numbers, bull view, bear view, what to watch), each with 2 to 4 short points drawn from their draft and the facts below.
- questions: up to 5 questions a sharp reader would ask that the draft does not answer yet.
- missing: up to 5 pieces of data that would make it stronger (for example: margins over the last 4 quarters, how peers moved).
${RULES}
Facts from the chart (real daily data):
${o.facts.join('\n') || '(none cited yet)'}
Draft so far:
---
${o.text.slice(0, 12000) || '(empty)'}`;
}

export function checkPrompt(o: { sym: string; text: string; facts: string[] }): string {
  return `Fact-check the numbers and dated claims in this essay about ${o.sym}. Use ONLY the facts listed below and plain arithmetic.
- claims: each sentence or phrase with a number, percentage, price or date. quote it exactly (short), then verdict:
  "matches" if the facts support it, "wrong" if the facts contradict it (say the right number in note), "unverified" if the facts below don't cover it (say what data would check it).
- Skip opinions. At most 15 claims.
${RULES}
Facts (real daily data from the chart):
${o.facts.join('\n') || '(none)'}
Essay:
---
${o.text.slice(0, 12000)}`;
}

const s = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v.map((x) => s(x, len)).filter(Boolean).slice(0, n) : []);
export function cleanOutline(d: any) {
  return {
    sections: (Array.isArray(d?.sections) ? d.sections : []).map((x: any) => ({ heading: s(x?.heading, 80), points: list(x?.points, 4, 200) })).filter((x: { heading: string }) => x.heading).slice(0, 7),
    questions: list(d?.questions, 5, 200), missing: list(d?.missing, 5, 200),
  };
}
export function cleanCheck(d: any) {
  return { claims: (Array.isArray(d?.claims) ? d.claims : []).map((x: any) => ({ quote: s(x?.quote, 200), verdict: ['matches', 'wrong', 'unverified'].includes(x?.verdict) ? x.verdict : 'unverified', note: s(x?.note, 240) })).filter((x: { quote: string }) => x.quote).slice(0, 15) };
}
