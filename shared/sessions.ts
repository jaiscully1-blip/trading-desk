// World market sessions for the session clock (regular hours, local time; weekends closed; holidays only known for NY).
export interface Market { id: string; name: string; tz: string; open: string; close: string; lunch?: [string, string] }
export const MARKETS: Market[] = [
  { id: 'ny', name: 'New York', tz: 'America/New_York', open: '09:30', close: '16:00' },
  { id: 'ldn', name: 'London', tz: 'Europe/London', open: '08:00', close: '16:30' },
  { id: 'tky', name: 'Tokyo', tz: 'Asia/Tokyo', open: '09:00', close: '15:30', lunch: ['11:30', '12:30'] },
  { id: 'hk', name: 'Hong Kong', tz: 'Asia/Hong_Kong', open: '09:30', close: '16:00', lunch: ['12:00', '13:00'] },
  { id: 'syd', name: 'Sydney', tz: 'Australia/Sydney', open: '10:00', close: '16:00' },
];

/** Local wall-clock parts of an instant in a time zone. */
export function localParts(ms: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), sod: +p.hour * 3600 + +p.minute * 60 + +p.second, hm: `${p.hour}:${p.minute}` };
}
const sec = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 3600 + m * 60; };

export type SessionStatus = 'open' | 'lunch' | 'closed';
/** Status now and seconds until the next change (open, lunch, reopen or close), skipping weekends. */
export function sessionState(m: Market, ms: number, closedToday = false): { status: SessionStatus; next: 'opens' | 'closes' | 'lunch ends' | 'lunch'; inSec: number; local: string } {
  const { wd, sod, hm } = localParts(ms, m.tz);
  const o = sec(m.open), c = sec(m.close), l0 = m.lunch ? sec(m.lunch[0]) : -1, l1 = m.lunch ? sec(m.lunch[1]) : -1;
  const weekday = wd >= 1 && wd <= 5 && !closedToday;
  if (weekday && sod >= o && sod < c) {
    if (m.lunch && sod >= l0 && sod < l1) return { status: 'lunch', next: 'lunch ends', inSec: l1 - sod, local: hm };
    if (m.lunch && sod < l0) return { status: 'open', next: 'lunch', inSec: l0 - sod, local: hm };
    return { status: 'open', next: 'closes', inSec: c - sod, local: hm };
  }
  // next open: today (before the open) or the next weekday
  let days = weekday && sod < o ? 0 : 1;
  let d = (wd + days) % 7;
  while (d === 0 || d === 6) { days++; d = (wd + days) % 7; }
  return { status: 'closed', next: 'opens', inSec: days * 86400 + o - sod, local: hm };
}
