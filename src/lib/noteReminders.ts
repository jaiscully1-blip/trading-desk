// Reminders you set from a note (Essays): one-time on a date, or routine (every weekday, every day, weekly, monthly).
// Stored in this browser; the app checks every 30 seconds and shows a desk ping (and a browser notification if allowed).
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export type Repeat = 'once' | 'weekdays' | 'daily' | 'weekly' | 'monthly';
export const REPEAT_LABEL: Record<Repeat, string> = { once: 'Once', weekdays: 'Every weekday', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };
export interface Reminder { id: string; noteId?: string; text: string; sym?: string; date: string; time: string; repeat: Repeat; active: boolean; lastFired?: string; created: number }

const KEY = 'noteReminders';
let list: Reminder[] = load<Reminder[]>(KEY, []);
const subs = new Set<() => void>();
const set = (x: Reminder[]) => { list = x; save(KEY, x); subs.forEach((f) => f()); };
export const useReminders = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => list);
export const addReminder = (r: Omit<Reminder, 'id' | 'active' | 'created'>) => set([...list, { ...r, id: Math.random().toString(36).slice(2, 10), active: true, created: Date.now() }]);
export const removeReminder = (id: string) => set(list.filter((r) => r.id !== id));

/** ET calendar day and minute of day for a time. */
export function etNowParts(ms = Date.now()): { day: string; min: number; wd: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

/** Does this reminder fall on that day (YYYY-MM-DD)? */
export function onDay(r: Reminder, day: string): boolean {
  if (day < r.date) return false;
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay();
  switch (r.repeat) {
    case 'once': return day === r.date;
    case 'daily': return true;
    case 'weekdays': return wd > 0 && wd < 6;
    case 'weekly': return wd === new Date(`${r.date}T12:00:00Z`).getUTCDay();
    case 'monthly': return day.slice(8) === r.date.slice(8);
  }
}

/** Reminders due now (ET), marked as fired for today; a one-time reminder turns off after it fires. */
export function takeDue(ms = Date.now()): Reminder[] {
  const { day, min } = etNowParts(ms);
  const due = list.filter((r) => { const [h, m] = r.time.split(':').map(Number); return r.active && r.lastFired !== day && onDay(r, day) && min >= h * 60 + m; });
  if (due.length) set(list.map((r) => (due.includes(r) ? { ...r, lastFired: day, active: r.repeat !== 'once' } : r)));
  return due;
}
