// Journal + account engine. Pure functions: trades and fills in, P&L, R, equity, guardrails and violations out.
import { et, etToUtc } from '../../shared/clock';

export type Side = 'long' | 'short';
export type Emotion = 'calm' | 'confident' | 'fomo' | 'revenge' | 'anxious' | 'bored' | 'tired';
export const EMOTIONS: Emotion[] = ['calm', 'confident', 'fomo', 'revenge', 'anxious', 'bored', 'tired'];

export interface Fill {
  id: string;
  t: number; // ms epoch
  action: 'buy' | 'sell';
  qty: number;
  price: number;
  src: 'manual' | 'csv';
  fee?: number;
}

export interface ChecklistItem { label: string; auto: 'pass' | 'fail' | 'na' }

export interface Trade {
  id: string;
  created: number;
  updated: number;
  sym: string;
  side: Side;
  initialStop: number | null;
  stop: number | null;
  stopHistory: { t: number; stop: number }[];
  target: number | null;
  plannedSize: number | null;
  thesis: string;
  setup: string;
  emotion: Emotion | null;
  grade: { grade: string; score: number; playbook: string } | null;
  checklist: ChecklistItem[];
  fills: Fill[];
  screenshot?: string; // compressed JPEG data URL
  notes?: string;
  /** created from a broker import with no plan logged beforehand */
  imported?: boolean;
  /** dollars per 1.00 of price per unit: 100 for option contracts, 1 (default) for shares */
  mult?: number;
  /** option contract details when this is an options trade */
  opt?: { root: string; type: 'call' | 'put'; strike: number; expiry: string };
  /** sample data for the preview */
  demo?: boolean;
  deleted?: boolean;
}

export interface Transfer { id: string; t: number; amount: number; note: string; src: 'csv' | 'manual'; updated: number; deleted?: boolean }

export interface AccountSettings {
  startBalance: number | null;
  startDate: number | null;
  riskPct: number; // per trade
  maxDailyLossPct: number;
  maxHeatPct: number;
  cooldownMin: number;
  cooldownAfterLosses: number;
}
export const DEFAULT_SETTINGS: AccountSettings = { startBalance: null, startDate: null, riskPct: 0.5, maxDailyLossPct: 2, maxHeatPct: 6, cooldownMin: 10, cooldownAfterLosses: 2 };

export interface CheckIn { day: string; t: number; sleep: number; mood: number; stress: number; chasing: boolean; note: string; tilt: number; updated: number }

/* ---------------- one trade ---------------- */

export interface RealizedEvent { t: number; pnl: number; qty: number; tradeId: string }
export interface TradeView {
  t: Trade;
  status: 'planned' | 'open' | 'closed';
  openQty: number; // shares still held (positive)
  maxQty: number;
  avgEntry: number | null;
  avgExit: number | null;
  openedAt: number | null;
  closedAt: number | null;
  realized: number; // net of fees
  fees: number;
  risk: number | null; // initial $ risk = |avgEntry - initialStop| x maxQty
  r: number | null; // realized / risk (closed trades)
  events: RealizedEvent[];
  /** an option still open after its expiry was closed at $0 by the desk (no closing fill was logged or imported) */
  assumedExpired?: boolean;
}

const sgn = (s: Side) => (s === 'long' ? 1 : -1);

/** Close of an option's expiry day: 16:00 New York, taken as 21:00 UTC (an hour early in summer time, which only makes the close sooner). */
export const expiryCloseMs = (expiry: string) => Date.parse(`${expiry}T21:00:00Z`);

/** Average-cost position math. Fills that would flip the position are clipped at flat.
 *  An option still open after its expiry is closed at $0 ("assumed expired worthless"): an in-the-money option may have been
 *  exercised or sold instead, which only a logged or imported fill can show. */
export function viewTrade(t: Trade, opts?: { now?: number } | number): TradeView {
  // an object, so `trades.map(viewTrade)` (which passes the array index second) can never be read as a time
  const now = typeof opts === 'object' && opts?.now != null ? opts.now : Date.now();
  const s = sgn(t.side), m = t.mult ?? 1;
  const fills = [...t.fills].sort((a, b) => a.t - b.t);
  let pos = 0, cost = 0, maxQty = 0, fees = 0, exitQty = 0, exitVal = 0;
  let openedAt: number | null = null, closedAt: number | null = null;
  const events: RealizedEvent[] = [];
  let entryQty = 0, entryVal = 0;
  for (const f of fills) {
    fees += f.fee ?? 0;
    const adds = (f.action === 'buy') === (s === 1);
    if (adds) {
      if (pos === 0) { openedAt ??= f.t; closedAt = null; }
      cost += f.qty * f.price;
      pos += f.qty;
      entryQty += f.qty; entryVal += f.qty * f.price;
      maxQty = Math.max(maxQty, pos);
    } else {
      const q = Math.min(f.qty, pos);
      if (q <= 0) continue;
      const avg = cost / pos;
      const pnl = s * (f.price - avg) * q * m - (f.fee ?? 0);
      events.push({ t: f.t, pnl, qty: q, tradeId: t.id });
      cost -= avg * q;
      pos -= q;
      exitQty += q; exitVal += q * f.price;
      if (pos === 0) closedAt = f.t;
    }
  }
  let assumedExpired = false;
  const expMs = t.opt?.expiry ? expiryCloseMs(t.opt.expiry) : NaN;
  if (pos > 0 && Number.isFinite(expMs) && now > expMs && fills.length && fills[fills.length - 1].t <= expMs + 3 * 86400_000) {
    const avg = cost / pos;
    events.push({ t: expMs, pnl: s * (0 - avg) * pos * m, qty: pos, tradeId: t.id });
    exitQty += pos; // exit value adds 0
    pos = 0; cost = 0; closedAt = expMs; assumedExpired = true;
  }
  const avgEntry = entryQty ? entryVal / entryQty : null;
  const realized = events.reduce((a, e) => a + e.pnl, 0) - fills.filter((f) => (f.action === 'buy') === (s === 1)).reduce((a, f) => a + (f.fee ?? 0), 0);
  const risk = avgEntry != null && t.initialStop != null && maxQty > 0 ? Math.abs(avgEntry - t.initialStop) * maxQty * m : null;
  const status = !fills.length ? 'planned' : pos > 0 ? 'open' : 'closed';
  return {
    t, status, openQty: pos, maxQty, avgEntry, avgExit: exitQty ? exitVal / exitQty : null, openedAt, closedAt: status === 'closed' ? closedAt : null,
    realized, fees, risk, r: status === 'closed' && risk ? realized / risk : null, events, ...(assumedExpired ? { assumedExpired } : {}),
  };
}

export function unrealized(v: TradeView, last: number | undefined): number {
  if (v.status !== 'open' || last == null || !Number.isFinite(last) || v.avgEntry == null) return 0;
  // average cost of remaining shares equals avgEntry under average-cost accounting only if no partial exits changed it; recompute
  const s = sgn(v.t.side);
  let pos = 0, cost = 0;
  for (const f of [...v.t.fills].sort((a, b) => a.t - b.t)) {
    if ((f.action === 'buy') === (s === 1)) { cost += f.qty * f.price; pos += f.qty; }
    else { const q = Math.min(f.qty, pos); if (q > 0) { cost -= (cost / pos) * q; pos -= q; } }
  }
  return pos ? s * (last - cost / pos) * pos * (v.t.mult ?? 1) : 0;
}

/** $ at risk to the current stop on what's still open (0 once the stop locks in profit). */
export function openRisk(v: TradeView, last?: number): number {
  if (v.status !== 'open') return 0;
  const m = v.t.mult ?? 1;
  if (v.t.stop == null) {
    // a long option can lose at most the premium paid, so that is its risk when no stop is set; anything else without a stop is unbounded
    return v.t.opt && v.t.side === 'long' && v.avgEntry != null ? v.avgEntry * v.openQty * m : Infinity;
  }
  const ref = last != null && Number.isFinite(last) ? last : v.avgEntry ?? v.t.stop;
  const s = sgn(v.t.side);
  return Math.max(0, s * (ref - v.t.stop)) * v.openQty * m;
}

/* ---------------- stats ---------------- */

export interface Stats { trades: number; wins: number; losses: number; winRate: number | null; expectancyR: number | null; expectancy$: number | null; avgWinR: number | null; avgLossR: number | null; profitFactor: number | null; net: number }

export function stats(views: TradeView[]): Stats {
  const closed = views.filter((v) => v.status === 'closed');
  const wins = closed.filter((v) => v.realized > 0), losses = closed.filter((v) => v.realized < 0);
  const rs = closed.map((v) => v.r).filter((x): x is number => x != null);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const gw = wins.reduce((a, v) => a + v.realized, 0), gl = -losses.reduce((a, v) => a + v.realized, 0);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    expectancyR: mean(rs),
    expectancy$: mean(closed.map((v) => v.realized)),
    avgWinR: mean(wins.map((v) => v.r).filter((x): x is number => x != null)),
    avgLossR: mean(losses.map((v) => v.r).filter((x): x is number => x != null)),
    profitFactor: gl > 0 ? gw / gl : gw > 0 ? Infinity : null,
    net: closed.reduce((a, v) => a + v.realized, 0),
  };
}

/* ---------------- account ---------------- */

export const etDay = (ms: number) => { const e = et(ms); return `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`; };

export interface DayPoint { day: string; pnl: number; transfers: number; equity: number; time: number }

/** Equity by ET day: start + realized P&L + deposits - withdrawals. */
export function equityByDay(views: TradeView[], transfers: Transfer[], start: number): DayPoint[] {
  const m = new Map<string, { pnl: number; transfers: number }>();
  const add = (t: number, k: 'pnl' | 'transfers', v: number) => { const d = etDay(t); const x = m.get(d) ?? { pnl: 0, transfers: 0 }; x[k] += v; m.set(d, x); };
  for (const v of views) for (const e of v.events) add(e.t, 'pnl', e.pnl);
  for (const v of views) if (v.status === 'closed') { const entryFees = v.t.fills.filter((f) => (f.action === 'buy') === (v.t.side === 'long')).reduce((a, f) => a + (f.fee ?? 0), 0); if (entryFees) add(v.closedAt!, 'pnl', -entryFees); }
  for (const t of transfers) if (!t.deleted) add(t.t, 'transfers', t.amount);
  let eq = start;
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, x]) => {
    eq += x.pnl + x.transfers;
    const [y, mo, d] = day.split('-').map(Number);
    return { day, pnl: x.pnl, transfers: x.transfers, equity: eq, time: Date.UTC(y, mo - 1, d) / 1000 };
  });
}

export interface Guard {
  equity: number;
  startOfDay: number;
  todayRealized: number;
  todayUnrealized: number;
  rToday: number;
  openRisk: number;
  riskUsedPct: number;
  heatPct: number;
  lockout: 'Clear' | 'Cooldown' | 'Locked';
  cooldownUntil: number | null;
  lossStreak: number;
  reason: string | null;
}

/** Account state and guardrails at time `now` (also used historically to check whether a trade broke a rule). */
export function guard(views: TradeView[], transfers: Transfer[], s: AccountSettings, now: number, lastPx: (sym: string) => number | undefined = () => undefined): Guard {
  const start = s.startBalance ?? 0;
  const today = etDay(now);
  let before = 0, todayRealized = 0, rToday = 0;
  // the starting balance already includes every trade and transfer before its start date, so those are not added again
  const from = s.startBalance != null && s.startDate != null ? s.startDate : -Infinity;
  for (const v of views) for (const e of v.events) {
    if (e.t > now || e.t < from) continue;
    if (etDay(e.t) === today) { todayRealized += e.pnl; if (v.risk) rToday += e.pnl / v.risk; } else before += e.pnl;
  }
  let tr = 0;
  for (const t of transfers) if (!t.deleted && t.t <= now && t.t >= from) tr += t.amount;
  const startOfDay = start + before + tr;
  const open = views.filter((v) => v.status === 'open' && (v.openedAt ?? 0) <= now);
  const todayUnrealized = open.reduce((a, v) => a + unrealized(v, lastPx(v.t.sym)), 0);
  for (const v of open) if (v.risk) rToday += unrealized(v, lastPx(v.t.sym)) / v.risk;
  const oRisk = open.reduce((a, v) => a + openRisk(v, lastPx(v.t.sym)), 0);
  const equity = startOfDay + todayRealized + todayUnrealized;

  // loss streak today, by close time
  const closedToday = views.filter((v) => v.closedAt != null && v.closedAt <= now && etDay(v.closedAt) === today).sort((a, b) => a.closedAt! - b.closedAt!);
  let streak = 0;
  for (let i = closedToday.length - 1; i >= 0 && closedToday[i].realized < 0; i--) streak++;
  const lastLoss = streak ? closedToday[closedToday.length - 1].closedAt! : null;
  const cooldownUntil = streak >= s.cooldownAfterLosses && lastLoss ? lastLoss + s.cooldownMin * 60_000 : null;

  const maxLoss = (s.maxDailyLossPct / 100) * startOfDay;
  const locked = startOfDay > 0 && maxLoss > 0 && -todayRealized >= maxLoss; // a limit of 0 means "no limit set", not "locked from the first second"
  const lockout: Guard['lockout'] = locked ? 'Locked' : cooldownUntil && now < cooldownUntil ? 'Cooldown' : 'Clear';
  return {
    equity, startOfDay, todayRealized, todayUnrealized, rToday,
    openRisk: oRisk,
    riskUsedPct: startOfDay > 0 ? ((Math.max(0, -todayRealized) + (Number.isFinite(oRisk) ? oRisk : 0)) / startOfDay) * 100 : 0,
    heatPct: equity > 0 ? (oRisk / equity) * 100 : 0,
    lockout,
    cooldownUntil: lockout === 'Cooldown' ? cooldownUntil : null,
    lossStreak: streak,
    reason: locked ? `Max daily loss hit (${s.maxDailyLossPct}% of ${Math.round(startOfDay).toLocaleString()})` : lockout === 'Cooldown' ? `${streak} losses in a row: cooldown` : null,
  };
}

/** Shares allowed for a planned trade: risk % of equity / stop distance (halved on a high-tilt day). */
export function sizeFor(equity: number, riskPct: number, entry: number, stop: number) {
  const per = Math.abs(entry - stop);
  const dollars = (equity * riskPct) / 100;
  return { dollars, shares: per > 0 ? Math.floor(dollars / per) : 0, per };
}

/* ---------------- check-in ---------------- */

/** 0 (steady) - 100 (on tilt). Sleep/mood 1-5 good-high, stress 1-5 bad-high, chasing losses is a big flag. */
export function tiltScore(c: Pick<CheckIn, 'sleep' | 'mood' | 'stress' | 'chasing'>): number {
  const bad = (5 - c.sleep) + (5 - c.mood) + (c.stress - 1); // 0-12
  return Math.min(100, Math.round((bad / 12) * 70 + (c.chasing ? 40 : 0)));
}
export const TILT_HIGH = 60;

/* ---------------- rule violations, priced in dollars ---------------- */

export type ViolationType = 'oversized' | 'widened-stop' | 'traded-locked' | 'traded-cooldown' | 'no-plan' | 'checklist-fail' | 'no-checkin' | 'over-heat';
export const VIOLATION_LABEL: Record<ViolationType, string> = {
  'oversized': 'Position bigger than your risk % allowed',
  'widened-stop': 'Stop moved further away after entry',
  'traded-locked': 'Traded after the max daily loss lockout',
  'traded-cooldown': 'Traded during the loss-streak cooldown',
  'no-plan': 'Trade with no plan logged (broker import only)',
  'checklist-fail': 'Ticked a checklist item the data said failed',
  'no-checkin': 'Traded before the pre-session check-in',
  'over-heat': 'Entry pushed portfolio heat over the max',
};

export interface Violation { type: ViolationType; tradeId: string; sym: string; t: number; cost: number; detail: string }

/**
 * Cost: what the rule break lost you. For a losing trade it's the loss (or the part above plan for size/stop breaks);
 * a winning trade that broke a rule costs $0 but is still logged.
 */
export function violations(views: TradeView[], transfers: Transfer[], s: AccountSettings, checkins: CheckIn[]): Violation[] {
  const out: Violation[] = [];
  const days = new Set(checkins.map((c) => c.day));
  const loss = (v: TradeView) => Math.max(0, -v.realized);
  for (const v of views) {
    if (v.openedAt == null) continue;
    const t = v.t, at = v.openedAt;
    const push = (type: ViolationType, cost: number, detail: string) => out.push({ type, tradeId: t.id, sym: t.sym, t: at, cost, detail });
    const g = guard(views.filter((x) => x.t.id !== t.id), transfers, s, at - 1);
    if (g.lockout === 'Locked') push('traded-locked', loss(v), g.reason ?? '');
    else if (g.lockout === 'Cooldown') push('traded-cooldown', loss(v), `entered ${Math.ceil((g.cooldownUntil! - at) / 60_000)} min before cooldown ended`);
    if (t.imported) push('no-plan', loss(v), 'filled at the broker without a journal entry');
    if (!t.imported && !days.has(etDay(at))) push('no-checkin', loss(v), etDay(at));
    if (v.risk != null && g.startOfDay > 0) {
      const allowed = (g.startOfDay * s.riskPct) / 100;
      if (v.risk > allowed * 1.05) push('oversized', loss(v) * (1 - allowed / v.risk), `risked $${v.risk.toFixed(0)} vs $${allowed.toFixed(0)} allowed`);
      const heatAfter = ((Number.isFinite(g.openRisk) ? g.openRisk : 0) + v.risk) / g.startOfDay * 100;
      if (heatAfter > s.maxHeatPct) push('over-heat', loss(v), `heat ${heatAfter.toFixed(1)}% vs ${s.maxHeatPct}% max`);
    }
    if (t.initialStop != null && t.stopHistory.some((h) => sgn(t.side) * (t.initialStop! - h.stop) > 1e-9)) {
      push('widened-stop', Math.max(0, loss(v) - (v.risk ?? 0)), `initial ${t.initialStop} → ${t.stopHistory.map((h) => h.stop).join(' → ')}`);
    }
    const failed = t.checklist.filter((c) => c.auto === 'fail');
    if (failed.length) push('checklist-fail', loss(v), failed.map((c) => c.label).join('; '));
  }
  return out.sort((a, b) => b.t - a.t);
}

/* ---------------- time-of-day ---------------- */

export interface Bucket { label: string; trades: number; wins: number; net: number; avgR: number | null }
export function timeOfDay(views: TradeView[]): Bucket[] {
  const labels = ['Pre', '9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', 'After'];
  const b = labels.map((label) => ({ label, trades: 0, wins: 0, net: 0, rs: [] as number[] }));
  for (const v of views) {
    if (v.status !== 'closed' || v.openedAt == null) continue;
    const e = et(v.openedAt);
    const m = e.h * 60 + e.mi;
    const i = m < 570 ? 0 : m >= 960 ? 14 : 1 + Math.floor((m - 570) / 30);
    b[i].trades++;
    if (v.realized > 0) b[i].wins++;
    b[i].net += v.realized;
    if (v.r != null) b[i].rs.push(v.r);
  }
  return b.map(({ rs, ...x }) => ({ ...x, avgR: rs.length ? rs.reduce((p, q) => p + q, 0) / rs.length : null }));
}

export { etToUtc };
