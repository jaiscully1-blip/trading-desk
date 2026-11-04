import type { Mode } from './types';

const TZ = 'America/New_York';
const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export interface ET {
  wd: number; // 0 Sun .. 6 Sat
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  sod: number; // seconds of day
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function et(at: number = Date.now()): ET {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(at))) p[x.type] = x.value;
  const h = +p.hour, mi = +p.minute, s = +p.second;
  return { wd: WD[p.weekday], y: +p.year, mo: +p.month, d: +p.day, h, mi, s, sod: h * 3600 + mi * 60 + s };
}

/** UTC ms for an ET wall-clock time (DST-correct). */
export function etToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let guess = want;
  for (let i = 0; i < 2; i++) {
    const e = et(guess);
    const seen = Date.UTC(e.y, e.mo - 1, e.d, e.h, e.mi);
    guess += want - seen;
  }
  return guess;
}

const OPEN = 9.5 * 3600;
const CLOSE = 16 * 3600;

export const MODES: { id: Mode; label: string; start: number }[] = [
  { id: 'pre', label: 'Pre-market', start: 4 * 3600 },
  { id: 'open', label: 'Open', start: OPEN },
  { id: 'midday', label: 'Midday', start: 11 * 3600 },
  { id: 'power', label: 'Power hour', start: 15 * 3600 },
  { id: 'after', label: 'After-hours & review', start: CLOSE },
];
export const modeLabel = (m: Mode) => MODES.find((x) => x.id === m)!.label;

const isWeekday = (wd: number) => wd >= 1 && wd <= 5;

function addDays(y: number, mo: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}

/** Next weekday ET date (today included if `includeToday`). Holidays are not known until the M7 market-status feed. */
function nextWeekday(e: ET, includeToday: boolean) {
  for (let n = includeToday ? 0 : 1; n < 8; n++) {
    const x = addDays(e.y, e.mo, e.d, n);
    if (isWeekday(x.wd)) return x;
  }
  throw new Error('unreachable');
}

export interface ClockState {
  now: number;
  et: ET;
  mode: Mode;
  session: 'Pre-market' | 'Regular session' | 'After-hours' | 'Closed';
  nextLabel: string;
  toNext: number; // seconds
  toOpen: number | null;
  toClose: number | null;
}

export function clock(now: number = Date.now()): ClockState {
  const e = et(now);
  const trading = isWeekday(e.wd);
  let mode: Mode = 'after';
  if (trading) for (const m of MODES) if (e.sod >= m.start) mode = m.id;
  if (!trading || e.sod < MODES[0].start) mode = 'after'; // overnight & weekends = review layout

  const session: ClockState['session'] = !trading
    ? 'Closed'
    : e.sod >= 4 * 3600 && e.sod < OPEN
      ? 'Pre-market'
      : e.sod >= OPEN && e.sod < CLOSE
        ? 'Regular session'
        : e.sod >= CLOSE && e.sod < 20 * 3600
          ? 'After-hours'
          : 'Closed';

  // Next phase boundary
  let nextAt: number;
  let nextLabel: string;
  const later = trading ? MODES.find((m) => m.start > e.sod) : undefined;
  if (later) {
    nextAt = etToUtc(e.y, e.mo, e.d, Math.floor(later.start / 3600), (later.start % 3600) / 60);
    nextLabel = later.label;
  } else {
    // weekday before 4:00 is caught by `later`; otherwise pre-market starts on the next weekday
    const day = nextWeekday(e, false);
    nextAt = etToUtc(day.y, day.mo, day.d, 4, 0);
    nextLabel = 'Pre-market';
  }

  let toOpen: number | null = null;
  let toClose: number | null = null;
  if (trading && e.sod >= OPEN && e.sod < CLOSE) {
    toClose = Math.round((etToUtc(e.y, e.mo, e.d, 16, 0) - now) / 1000);
  } else {
    const day = trading && e.sod < OPEN ? { y: e.y, mo: e.mo, d: e.d } : nextWeekday(e, false);
    toOpen = Math.round((etToUtc(day.y, day.mo, day.d, 9, 30) - now) / 1000);
  }

  return { now, et: e, mode, session, nextLabel, toNext: Math.round((nextAt - now) / 1000), toOpen, toClose };
}

export function hms(sec: number) {
  const s = Math.max(0, sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const core = `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return d ? `${d}d ${core}` : core;
}

export function etTime(at: number, withSec = false) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    ...(withSec ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  }).format(new Date(at));
}

/** Most recent ET trading date whose session has started (or today if pre-market has begun). */
export function lastSessionDates(n: number, now = Date.now()) {
  const e = et(now);
  let start = isWeekday(e.wd) && e.sod >= OPEN ? { y: e.y, mo: e.mo, d: e.d } : null;
  if (!start) {
    for (let k = 1; k < 8; k++) {
      const x = addDays(e.y, e.mo, e.d, -k);
      if (isWeekday(x.wd)) { start = x; break; }
    }
  }
  const out: { y: number; mo: number; d: number }[] = [];
  let k = 0;
  while (out.length < n) {
    const x = addDays(start!.y, start!.mo, start!.d, -k++);
    if (isWeekday(x.wd)) out.push({ y: x.y, mo: x.mo, d: x.d });
  }
  return out.reverse();
}
