// Weekly review: a trading week (Mon-Fri, ET) of check-ins next to results, rule breaks by cost, and plain comparisons
// (days you checked in vs not, high vs low tilt, good vs bad sleep). Pure and tested. Comparisons need 2+ days a side.
import type { CheckIn, TradeView, Violation } from './journal';
import { VIOLATION_LABEL, etDay } from './journal';

export interface WeekDay { day: string; wd: string; checkin?: CheckIn; pnl: number; trades: number; wins: number; breaks: number; breakCost: number; grade?: string; review?: Record<string, string> }
export interface WeekSum { start: string; end: string; days: WeekDay[]; pnl: number; trades: number; winRate: number | null; breaks: number; breakCost: number; rules: { label: string; n: number; cost: number }[]; compare: { label: string; a: string; aAvg: number; aN: number; b: string; bAvg: number; bN: number }[] }

const DAY = 86400_000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday (YYYY-MM-DD) of the week containing `day`, shifted by `weeksBack`. */
export function mondayOf(day: string, weeksBack = 0): string {
  const d = new Date(`${day}T12:00:00Z`), wd = d.getUTCDay();
  return new Date(d.getTime() - ((wd + 6) % 7) * DAY - weeksBack * 7 * DAY).toISOString().slice(0, 10);
}

export function weekReview(monday: string, views: TradeView[], violations: Violation[], checkins: CheckIn[], grades: Record<string, { grade?: string; answers?: Record<string, string> }>): WeekSum {
  const days: WeekDay[] = [];
  for (let i = 0; i < 5; i++) {
    const day = new Date(Date.parse(`${monday}T12:00:00Z`) + i * DAY).toISOString().slice(0, 10);
    const closed = views.filter((v) => v.status === 'closed' && v.closedAt != null && etDay(v.closedAt) === day);
    const vs = violations.filter((x) => etDay(x.t) === day);
    days.push({ day, wd: WD[new Date(`${day}T12:00:00Z`).getUTCDay()], checkin: checkins.find((c) => c.day === day), pnl: closed.reduce((a, v) => a + v.realized, 0), trades: closed.length, wins: closed.filter((v) => v.realized > 0).length, breaks: vs.length, breakCost: vs.reduce((a, x) => a + x.cost, 0), grade: grades[day]?.grade, review: grades[day]?.answers });
  }
  const traded = days.filter((d) => d.trades > 0);
  const all = traded.reduce((a, d) => a + d.trades, 0), wins = traded.reduce((a, d) => a + d.wins, 0);
  const vsWeek = violations.filter((x) => { const d = etDay(x.t); return d >= monday && d <= days[4].day; });
  const byRule = new Map<string, { n: number; cost: number }>();
  for (const x of vsWeek) { const k = VIOLATION_LABEL[x.type] ?? x.type; const e = byRule.get(k) ?? { n: 0, cost: 0 }; e.n++; e.cost += x.cost; byRule.set(k, e); }
  const compare: WeekSum['compare'] = [];
  const cmp = (label: string, a: string, b: string, isA: (d: WeekDay) => boolean | null) => {
    const A = traded.filter((d) => isA(d) === true), B = traded.filter((d) => isA(d) === false);
    if (A.length >= 2 && B.length >= 2) compare.push({ label, a, aAvg: A.reduce((s, d) => s + d.pnl, 0) / A.length, aN: A.length, b, bAvg: B.reduce((s, d) => s + d.pnl, 0) / B.length, bN: B.length });
  };
  cmp('Check-in', 'checked in', 'skipped it', (d) => !!d.checkin);
  cmp('Tilt', 'low tilt (under 60)', 'high tilt (60+)', (d) => (d.checkin ? d.checkin.tilt < 60 : null));
  cmp('Sleep', 'slept 4-5', 'slept 1-3', (d) => (d.checkin ? d.checkin.sleep >= 4 : null));
  cmp('Rules', 'no rule breaks', 'broke a rule', (d) => d.breaks === 0);
  return { start: monday, end: days[4].day, days, pnl: traded.reduce((a, d) => a + d.pnl, 0), trades: all, winRate: all ? (wins / all) * 100 : null, breaks: vsWeek.length, breakCost: vsWeek.reduce((a, x) => a + x.cost, 0), rules: [...byRule.entries()].map(([label, e]) => ({ label, ...e })).sort((a, b) => b.cost - a.cost), compare };
}
