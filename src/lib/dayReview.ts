// End-of-day review: four weighted questions (two about the trading, two about your head) that grade the day instead of
// an automatic score. A green day grades at least B+. Answers are kept per day in this browser with the journal, so the
// Journal → Calendar patterns can line them up against your P&L later.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';
import type { Recap } from './recap';

export interface ReviewQ { id: string; kind: 'trading' | 'mind'; weight: number; q: string; opts: [string, number][] }
export const REVIEW_QS: ReviewQ[] = [
  { id: 'plan', kind: 'trading', weight: 30, q: 'Did you know your entry, stop and target before each trade?', opts: [['Every trade', 1], ['Most', 0.7], ['Some', 0.35], ['None', 0]] },
  { id: 'risk', kind: 'trading', weight: 30, q: 'Did you keep your size and your stops?', opts: [['Yes, all of them', 1], ['Bent one', 0.5], ['Moved or ignored stops', 0]] },
  { id: 'state', kind: 'mind', weight: 25, q: 'How did you feel while trading?', opts: [['Calm, focused', 1], ['A bit rushed', 0.6], ['Bored or tired', 0.4], ['FOMO or revenge', 0]] },
  { id: 'stop', kind: 'mind', weight: 15, q: 'Did you stop when you meant to?', opts: [['Yes', 1], ['1–2 extra trades', 0.5], ['Kept going', 0]] },
];

export interface DayReview { day: string; answers: Record<string, string>; score: number; grade: string; updated: number }

const KEY = 'journalDayReviews';
let all: Record<string, DayReview> = load<Record<string, DayReview>>(KEY, {});
const subs = new Set<() => void>();
export const useDayReviews = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => all);

/** Score 0–100 from the answers, the letter, and the reasons shown on hover. Green day: at least B+. */
export function reviewGrade(answers: Record<string, string>, pnl: number): { score: number; grade: string; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const q of REVIEW_QS) {
    const v = q.opts.find(([l]) => l === answers[q.id])?.[1] ?? 0, pts = Math.round(q.weight * v);
    score += pts;
    reasons.push(`${pts}/${q.weight} ${q.q} ${answers[q.id] ?? '—'}`);
  }
  const ladder: [number, string][] = [[93, 'A+'], [85, 'A'], [78, 'B+'], [70, 'B'], [60, 'C'], [45, 'D'], [0, 'F']];
  let grade = ladder.find(([m]) => score >= m)![1];
  if (pnl > 0 && score < 78) { grade = 'B+'; reasons.push('Green day: graded at least B+'); }
  return { score, grade, reasons };
}

/** Saves a day's answers, and fills "Followed my plan?" on the journal calendar if you have not set it there. */
export function saveReview(day: string, answers: Record<string, string>, pnl: number) {
  const g = reviewGrade(answers, pnl);
  all = { ...all, [day]: { day, answers, score: g.score, grade: g.grade, updated: Date.now() } };
  save(KEY, all); subs.forEach((f) => f());
  const notes = load<Record<string, { text: string; tags: string[]; mood?: string; followed?: string; updated: number }>>('journalDayNotes', {});
  const n = notes[day] ?? { text: '', tags: [], updated: 0 };
  if (!n.followed) { n.followed = answers.plan === 'Every trade' ? 'yes' : answers.plan === 'None' ? 'no' : 'partly'; n.updated = Date.now(); save('journalDayNotes', { ...notes, [day]: n }); }
}

/** A recap with your review applied: the grade comes from your answers; without answers it waits for them. */
export function withReview(r: Recap, rv: DayReview | undefined): Recap {
  if (!rv) return { ...r, reviewed: false };
  const g = reviewGrade(rv.answers, r.pnl);
  return { ...r, reviewed: true, grade: g.grade[0] as Recap['grade'], gradeLabel: g.grade, score: g.score, reasons: g.reasons };
}
