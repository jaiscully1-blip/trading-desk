import type { Mode } from './types';
import { closeSodFor, getMarketCalendar, holidayName, isTradingDay, ymdKey } from './marketCalendar';

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

/** Next NYSE trading day (skips weekends, published holidays and feed-reported closures). */
export function nextTradingDay(y: number, mo: number, d: number, includeToday: boolean) {
  for (let n = includeToday ? 0 : 1; n < 15; n++) {
    const x = addDays(y, mo, d, n);
    if (isTradingDay(x.y, x.mo, x.d)) return x;
  }
  throw new Error('no trading day within two weeks');
}

/** Phase start times for a day: power hour is the last hour before the close (12:00 on a 1:00 PM early close). */
export function phasesFor(closeSod: number): { id: Mode; label: string; start: number }[] {
  return [
    { id: 'pre', label: 'Pre-market', start: 4 * 3600 },
    { id: 'open', label: 'Open', start: OPEN },
    { id: 'midday', label: 'Midday', start: Math.min(11 * 3600, closeSod - 3600) },
    { id: 'power', label: 'Power hour', start: closeSod - 3600 },
    { id: 'after', label: 'After-hours & review', start: closeSod },
  ];
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
  /** today's close in seconds of day (13:00 on early-close days) */
  closeSod: number;
  holiday: string | null;
  earlyClose: string | null;
}

export function clock(now: number = Date.now()): ClockState {
  const e = et(now);
  const key = ymdKey(e.y, e.mo, e.d);
  const holiday = isWeekday(e.wd) ? holidayName(key) : null;
  const trading = isWeekday(e.wd) && !holiday;
  const closeSod = trading ? closeSodFor(key) : CLOSE;
  const early = trading ? getMarketCalendar().early[key] : undefined;
  const phases = phasesFor(closeSod);
  let mode: Mode = 'after';
  if (trading) for (const m of phases) if (e.sod >= m.start) mode = m.id;
  if (!trading || e.sod < phases[0].start) mode = 'after'; // overnight, weekends and holidays = review layout

  const ahEnd = early ? 17 * 3600 : 20 * 3600;
  const session: ClockState['session'] = !trading
    ? 'Closed'
    : e.sod >= 4 * 3600 && e.sod < OPEN
      ? 'Pre-market'
      : e.sod >= OPEN && e.sod < closeSod
        ? 'Regular session'
        : e.sod >= closeSod && e.sod < ahEnd
          ? 'After-hours'
          : 'Closed';

  // Next phase boundary
  let nextAt: number;
  let nextLabel: string;
  const later = trading ? phases.find((m) => m.start > e.sod) : undefined;
  if (later) {
    nextAt = etToUtc(e.y, e.mo, e.d, Math.floor(later.start / 3600), (later.start % 3600) / 60);
    nextLabel = later.label;
  } else {
    const day = nextTradingDay(e.y, e.mo, e.d, false);
    nextAt = etToUtc(day.y, day.mo, day.d, 4, 0);
    nextLabel = 'Pre-market';
  }

  let toOpen: number | null = null;
  let toClose: number | null = null;
  if (trading && e.sod >= OPEN && e.sod < closeSod) {
    toClose = Math.round((etToUtc(e.y, e.mo, e.d, Math.floor(closeSod / 3600), (closeSod % 3600) / 60) - now) / 1000);
  } else {
    const day = trading && e.sod < OPEN ? { y: e.y, mo: e.mo, d: e.d } : nextTradingDay(e.y, e.mo, e.d, false);
    toOpen = Math.round((etToUtc(day.y, day.mo, day.d, 9, 30) - now) / 1000);
  }

  return {
    now, et: e, mode, session, nextLabel, toNext: Math.round((nextAt - now) / 1000), toOpen, toClose, closeSod,
    holiday, earlyClose: early ? `${early.name}: closes ${early.close === 13 * 3600 ? '1:00' : etHm(early.close)} PM ET` : null,
  };
}

const etHm = (sod: number) => `${Math.floor(sod / 3600) % 12 || 12}:${String((sod % 3600) / 60).padStart(2, '0')}`;

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
  let start = isTradingDay(e.y, e.mo, e.d) && e.sod >= OPEN ? { y: e.y, mo: e.mo, d: e.d } : null;
  if (!start) {
    for (let k = 1; k < 15; k++) {
      const x = addDays(e.y, e.mo, e.d, -k);
      if (isTradingDay(x.y, x.mo, x.d)) { start = x; break; }
    }
  }
  const out: { y: number; mo: number; d: number }[] = [];
  let k = 0;
  while (out.length < n) {
    const x = addDays(start!.y, start!.mo, start!.d, -k++);
    if (isTradingDay(x.y, x.mo, x.d)) out.push({ y: x.y, mo: x.mo, d: x.d });
  }
  return out.reverse();
}
