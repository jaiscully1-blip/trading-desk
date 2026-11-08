// Which kinds of days move, and which ones let option time decay win. From daily OHLC only (CALCULATED, not a forecast).
// A day is "chop" if it moved under half, and "big" if it moved 1.5x or more, of the trailing 20-day average absolute move,
// so the yardstick follows the market's own mood instead of one fixed number. Pure + tested.
import type { Bar } from './types.js';

export interface DayStat { key: string; label: string; n: number; avgMovePct: number; avgRangePct: number; chopPct: number; bigPct: number }
export interface GapStat { n: number; fillPct: number; continuePct: number }
export interface MoveStats {
  all: DayStat; weekday: DayStat[]; events: DayStat[];
  gaps: { up: GapStat; down: GapStat; minPct: number };
  /** share of total day-to-day variance that happens overnight (close to open) rather than in the session */
  overnightVarShare: number; overnightAvgPct: number; sessionAvgPct: number;
  days: number;
}
export interface EventDays { cpi?: string[]; jobs?: string[]; fomc?: string[] }

const dayOf = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** monthly options expiration day: the third Friday (the real date moves a day earlier when that Friday is a market holiday) */
export function isMonthlyOpex(date: string): boolean {
  const d = new Date(`${date}T12:00:00Z`);
  return d.getUTCDay() === 5 && d.getUTCDate() >= 15 && d.getUTCDate() <= 21;
}

export function moveStats(bars: Bar[], events: EventDays = {}, gapMinPct = 0.3): MoveStats | null {
  if (bars.length < 60) return null;
  interface Row { date: string; wd: number; move: number; range: number; ref: number; gap: number; ses: number; filled: boolean }
  const rows: Row[] = [];
  const moves: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1], b = bars[i];
    const move = Math.abs(b.close / p.close - 1), gap = b.open / p.close - 1;
    moves.push(move);
    const trail = moves.slice(-21, -1); // the 20 days before this one
    if (trail.length < 20) continue;
    rows.push({
      date: dayOf(b.time), wd: new Date(b.time * 1000).getUTCDay(), move, range: (b.high - b.low) / p.close,
      ref: trail.reduce((a, c) => a + c, 0) / trail.length, gap, ses: b.close / b.open - 1,
      filled: gap > 0 ? b.low <= p.close : b.high >= p.close,
    });
  }
  if (rows.length < 40) return null;
  const stat = (key: string, label: string, r: Row[]): DayStat => ({
    key, label, n: r.length,
    avgMovePct: r.length ? (r.reduce((a, c) => a + c.move, 0) / r.length) * 100 : 0,
    avgRangePct: r.length ? (r.reduce((a, c) => a + c.range, 0) / r.length) * 100 : 0,
    chopPct: r.length ? (r.filter((c) => c.move < 0.5 * c.ref).length / r.length) * 100 : 0,
    bigPct: r.length ? (r.filter((c) => c.move >= 1.5 * c.ref).length / r.length) * 100 : 0,
  });
  const set = (a?: string[]) => new Set(a ?? []);
  const cpi = set(events.cpi), jobs = set(events.jobs), fomc = set(events.fomc);
  const evRows: [string, string, Row[]][] = [
    ['cpi', 'CPI day', rows.filter((r) => cpi.has(r.date))], ['jobs', 'Jobs report day', rows.filter((r) => jobs.has(r.date))],
    ['fomc', 'FOMC day', rows.filter((r) => fomc.has(r.date))], ['opex', 'Monthly options expiration', rows.filter((r) => isMonthlyOpex(r.date))],
    ['day-after', 'Day after CPI / jobs / FOMC', rows.filter((_r, i) => i > 0 && (cpi.has(rows[i - 1].date) || jobs.has(rows[i - 1].date) || fomc.has(rows[i - 1].date)))],
  ];
  const gp = (r: Row[], up: boolean): GapStat => {
    const g = r.filter((x) => (up ? x.gap : -x.gap) * 100 >= gapMinPct);
    return { n: g.length, fillPct: g.length ? (g.filter((x) => x.filled).length / g.length) * 100 : 0, continuePct: g.length ? (g.filter((x) => (up ? x.ses > 0 : x.ses < 0)).length / g.length) * 100 : 0 };
  };
  const v = (x: number[]) => { const m = x.reduce((a, b) => a + b, 0) / x.length; return x.reduce((a, b) => a + (b - m) ** 2, 0) / x.length; };
  const vo = v(rows.map((r) => r.gap)), vs = v(rows.map((r) => r.ses));
  return {
    all: stat('all', 'All days', rows),
    weekday: [1, 2, 3, 4, 5].map((d) => stat(WD[d], WD[d], rows.filter((r) => r.wd === d))),
    events: evRows.filter(([, , r]) => r.length >= 3).map(([k, l, r]) => stat(k, l, r)),
    gaps: { up: gp(rows, true), down: gp(rows, false), minPct: gapMinPct },
    overnightVarShare: (vo / (vo + vs)) * 100,
    overnightAvgPct: (rows.reduce((a, r) => a + Math.abs(r.gap), 0) / rows.length) * 100,
    sessionAvgPct: (rows.reduce((a, r) => a + Math.abs(r.ses), 0) / rows.length) * 100,
    days: rows.length,
  };
}
