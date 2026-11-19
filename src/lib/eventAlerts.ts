// Calendar event alerts: ring the desk 10 minutes before an event you belled (a report, a data release, the Fed).
// Stored in this browser; the app checks every 30 seconds and shows a desk ping (and a browser notification if you
// allowed them). Phone alerts are separate and stay off unless you turn them on.
import { useSyncExternalStore } from 'react';
import { load, save } from './store';
import { etToUtc } from './clock';

export interface EventAlert { id: string; label: string; sym?: string; at: number; when: string }
let list: EventAlert[] = load<EventAlert[]>('eventAlerts', []).filter((a) => a.at > Date.now() - 3600_000);
const subs = new Set<() => void>();
const set = (x: EventAlert[]) => { list = x; save('eventAlerts', x); subs.forEach((f) => f()); };
export const useEventAlerts = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => list);
export const toggleEventAlert = (a: EventAlert) => set(list.some((x) => x.id === a.id) ? list.filter((x) => x.id !== a.id) : [...list, a]);
/** Alerts that are due now (and removes them). */
export function takeDue(now = Date.now()): EventAlert[] { const due = list.filter((a) => a.at <= now); if (due.length) set(list.filter((a) => a.at > now)); return due; }

/** When to ring for an event on an ET date, from its time label: 10 minutes before. */
export function alertTime(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const t = time.toLowerCase();
  let h = 9, mi = 30;
  if (/after close/.test(t)) { h = 16; mi = 0; }
  else if (/during market/.test(t)) { h = 10; mi = 0; }
  else if (/before open/.test(t)) { h = 9; mi = 30; }
  else { const x = /(\d{1,2}):(\d{2})\s*(am|pm)?/.exec(t); if (x) { h = +x[1] % 12 + (x[3] === 'pm' || (!x[3] && +x[1] < 7) ? 12 : 0); mi = +x[2]; } }
  return etToUtc(y, m, d, h, mi) - 10 * 60_000;
}
