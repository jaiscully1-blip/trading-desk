// End-of-day recap: numbers, best/worst, violations, a process-first day grade and one lesson. Plus the journal CSV backup.
import { etDay, stats, VIOLATION_LABEL, type CheckIn, type TradeView, type Violation, type ViolationType } from './journal';

export interface Recap {
  day: string;
  created: number;
  updated: number;
  /** trades CLOSED this day (P&L, R and win rate are about these) */
  trades: number;
  /** trades opened this day, and the ones among them still open: a day with only new positions has no realized P&L yet */
  opened?: number;
  open?: { id: string; sym: string }[];
  /** realized on partial exits of trades that are still open (already inside pnl) */
  partialPnl?: number;
  pnl: number;
  r: number;
  winRate: number | null;
  best: { id: string; sym: string; pnl: number; r: number | null } | null;
  worst: { id: string; sym: string; pnl: number; r: number | null } | null;
  violations: { n: number; cost: number; top: string | null };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  score: number;
  reasons: string[];
  lesson: string;
  /** opened mid-session from /recap; the real one is still generated at the close */
  partial?: boolean;
}

const LESSONS: Record<ViolationType, string> = {
  'oversized': 'Size from the stop, not from conviction. Let the calculator pick the share count.',
  'widened-stop': 'The stop is the plan. If it gets hit, the idea was wrong; moving it only makes the loss bigger.',
  'traded-locked': 'When the daily max loss locks you out, the day is over. Walk away and review instead.',
  'traded-cooldown': 'Two losses in a row means pause. The next trade after a streak is usually a revenge trade.',
  'no-plan': 'Every trade goes through the ticket first. No checklist, no trade.',
  'checklist-fail': 'Don’t tick boxes the data says failed. If it isn’t an A setup, pass.',
  'no-checkin': 'Do the check-in before the first trade. It takes 20 seconds and sets your size for the day.',
  'over-heat': 'Too much open risk at once. Close or tighten something before adding.',
};

/**
 * Grade is about process first: start at 100, lose points for each rule broken (more for lockout/cooldown breaks),
 * for trading on a high-tilt day, and a little for a red day. A green day with broken rules can still grade C.
 */
export function buildRecap(day: string, views: TradeView[], violations: Violation[], checkin: CheckIn | undefined, opts: { hadTilt?: boolean } = {}): Recap | null {
  const todays = views.filter((v) => v.status === 'closed' && v.closedAt != null && etDay(v.closedAt) === day);
  const opened = views.filter((v) => v.openedAt != null && etDay(v.openedAt) === day);
  // money realized this day on trades that are NOT closed yet (scaling out): it belongs to the day's P&L too
  const partialPnl = views.filter((v) => v.status !== 'closed').reduce((a, v) => a + v.events.filter((e) => etDay(e.t) === day).reduce((x, e) => x + e.pnl, 0), 0);
  if (!todays.length && !opened.length && !partialPnl) return null;
  const s = stats(todays);
  const net = s.net + partialPnl;
  const r = todays.reduce((a, v) => a + (v.r ?? 0), 0);
  const byPnl = [...todays].sort((a, b) => b.realized - a.realized);
  const pick = (v?: TradeView) => (v ? { id: v.t.id, sym: v.t.sym, pnl: v.realized, r: v.r } : null);
  const dv = violations.filter((x) => etDay(x.t) === day);
  const cost = dv.reduce((a, x) => a + x.cost, 0);
  const byType = new Map<ViolationType, number>();
  for (const x of dv) byType.set(x.type, (byType.get(x.type) ?? 0) + Math.max(1, x.cost));
  const top = [...byType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let score = 100;
  const reasons: string[] = [];
  for (const x of dv) {
    const p = x.type === 'traded-locked' || x.type === 'traded-cooldown' ? 25 : x.type === 'no-plan' ? 20 : 12;
    score -= p;
    reasons.push(`−${p} ${VIOLATION_LABEL[x.type]} (${x.sym})`);
  }
  if ((opts.hadTilt || (checkin && checkin.tilt >= 60)) && opened.length) { score -= 10; reasons.push('−10 traded on a high-tilt day'); }
  if (net < 0) { score -= 5; reasons.push('−5 red day'); }
  if (!dv.length) reasons.push('No rules broken');
  score = Math.max(0, score);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 45 ? 'D' : 'F';

  let lesson: string;
  if (top) lesson = LESSONS[top];
  else if (s.trades && s.winRate != null && s.winRate < 40 && net > 0) lesson = 'Low win rate but green: your winners are paying for your losers. Keep cutting losses fast.';
  else if (s.trades && net < 0) lesson = 'Rules followed and still red: that’s variance. Review whether the setups were truly A+ before changing anything.';
  else if (!s.trades && opened.length) lesson = 'Positions opened, nothing closed yet. The grade is about process; the result comes when you exit.';
  else lesson = 'Clean day. Same process tomorrow.';

  return {
    day, created: Date.now(), updated: Date.now(), trades: todays.length, pnl: net, r, winRate: s.winRate,
    opened: opened.length, open: opened.filter((v) => v.status === 'open').map((v) => ({ id: v.t.id, sym: v.t.sym })), partialPnl,
    best: pick(byPnl[0]), worst: byPnl.length > 1 ? pick(byPnl[byPnl.length - 1]) : null,
    violations: { n: dv.length, cost, top: top ? VIOLATION_LABEL[top] : null }, grade, score, reasons, lesson,
  };
}

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per trade, with fills flattened, for a daily backup that opens in any spreadsheet. */
export function journalCsv(views: TradeView[], violations: Violation[]): string {
  const vc = new Map<string, Violation[]>();
  for (const v of violations) vc.set(v.tradeId, [...(vc.get(v.tradeId) ?? []), v]);
  const head = ['opened_et', 'closed_et', 'symbol', 'side', 'status', 'setup', 'grade', 'emotion', 'qty', 'avg_entry', 'avg_exit', 'initial_stop', 'stop', 'target', 'realized', 'r', 'fees', 'thesis', 'notes', 'violations', 'violation_cost', 'fills', 'id'];
  const iso = (ms: number | null) => (ms == null ? '' : new Date(ms).toISOString());
  const rows = views.map((v) => {
    const vs = vc.get(v.t.id) ?? [];
    return [
      iso(v.openedAt), iso(v.closedAt), v.t.sym, v.t.side, v.status, v.t.setup, v.t.grade?.grade ?? '', v.t.emotion ?? '', v.maxQty,
      v.avgEntry?.toFixed(4) ?? '', v.avgExit?.toFixed(4) ?? '', v.t.initialStop ?? '', v.t.stop ?? '', v.t.target ?? '',
      v.realized.toFixed(2), v.r?.toFixed(3) ?? '', v.fees.toFixed(2), v.t.thesis, v.t.notes ?? '',
      vs.map((x) => x.type).join('|'), vs.reduce((a, x) => a + x.cost, 0).toFixed(2),
      v.t.fills.map((f) => `${iso(f.t)} ${f.action} ${f.qty}@${f.price}`).join(' | '), v.t.id,
    ].map(esc).join(',');
  });
  return [head.join(','), ...rows].join('\n') + '\n';
}

/** Every day that has journal activity gets a recap built from the journal as it is NOW, so a broker CSV imported days later
 *  shows up in that day's card. A stored recap only contributes what cannot be recomputed (its creation time, the tilt penalty,
 *  the "day in progress" flag). Newest day first. */
export function liveRecaps(stored: Recap[], views: TradeView[], violations: Violation[], today: string, checkin: CheckIn | undefined, beforeClose: boolean): Recap[] {
  const days = new Set<string>(stored.map((r) => r.day));
  for (const v of views) {
    if (v.openedAt != null) days.add(etDay(v.openedAt));
    if (v.closedAt != null) days.add(etDay(v.closedAt));
    for (const e of v.events) days.add(etDay(e.t));
  }
  const out: Recap[] = [];
  for (const day of days) {
    const old = stored.find((r) => r.day === day);
    const hadTilt = !!old?.reasons.some((x) => /high-tilt/.test(x));
    const r = buildRecap(day, views, violations, day === today ? checkin : undefined, { hadTilt });
    if (!r) { if (old) out.push(old); continue; }
    const partial = day === today && beforeClose;
    out.push({ ...r, created: old?.created ?? r.created, partial: partial || undefined, lesson: partial ? `(Day in progress) ${r.lesson}` : r.lesson });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
