// Notification mute: one switch for the desk's alert sounds, browser notifications and corner pop-ups. Alerts still land in the logs,
// so nothing is lost; you just aren't interrupted. Saved in this browser, and it ends by itself at the time you pick.
// Not affected: confirmations (like "Sent to Webull"), and anything sent outside the browser (Discord, phone).
import { useSyncExternalStore } from 'react';
import { load, save } from './store';

export type MuteState = { until: number | 'manual' } | null;
let cache: MuteState | undefined;
const subs = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
const read = (): MuteState => (cache === undefined ? (cache = load<MuteState>('mute', null)) : cache);
const emit = () => subs.forEach((f) => f());

export function isMuted(now = Date.now()): boolean {
  const m = read();
  if (!m) return false;
  if (m.until === 'manual' || m.until > now) return true;
  cache = null; save('mute', null); return false; // timed mute ended
}
export function setMute(m: MuteState) {
  cache = m; save('mute', m);
  clearTimeout(timer);
  if (m && m.until !== 'manual') timer = setTimeout(() => { isMuted(); emit(); }, Math.min(2 ** 31 - 1, Math.max(0, m.until - Date.now()) + 50));
  emit();
}
/** ms from now until the next 9:30 AM Eastern (tomorrow's open if today's has passed) */
export function msToNextOpen(now = Date.now()): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const mins = Number(p.hour) * 60 + Number(p.minute);
  const d = (9 * 60 + 30 - mins + 1440) % 1440;
  return (d === 0 ? 1440 : d) * 60_000;
}
export function muteLabel(m: MuteState): string {
  if (!m) return '';
  if (m.until === 'manual') return 'until you turn it back on';
  return `until ${new Date(m.until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${m.until - Date.now() > 20 * 3600_000 ? ' tomorrow' : ''}`;
}
export function useMute(): MuteState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, read, read);
}
