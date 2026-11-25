// Today strip: one line under the top bar with what matters for today, each part clickable.
// Check-in · loss room left · next market event · your earnings · open positions. Nothing here scores or rewards you.
import { useMemo } from 'react';
import { FOMC } from '../../shared/calendar';
import { nextMacro } from '../../shared/catalysts';
import { etToUtc } from '../../shared/clock';
import type { CalendarState } from '../data/news';
import type { CheckIn, Guard, AccountSettings, TradeView } from '../lib/journal';

const left = (ms: number) => { const m = Math.round(ms / 60_000); return m < 60 ? `${m}m` : m < 48 * 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.round(m / 1440)}d`; };
const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

export function TodayStrip({ checkin, onCheckIn, guard, settings, cal, views, today, now, onPage, onChart }: {
  checkin?: CheckIn; onCheckIn: () => void; guard: Guard; settings: AccountSettings; cal: CalendarState | null; views: TradeView[];
  today: string; now: number; onPage: (p: 'calendar' | 'journal' | 'desk') => void; onChart: (s: string) => void;
}) {
  const next = useMemo(() => nextMacro(cal?.econ ?? [], FOMC, now, etToUtc).find((x) => x.at > now) ?? null, [cal?.econ, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = (cal?.earnings?.mine ?? []).filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const open = views.filter((v) => v.status === 'open');
  const maxLoss = (settings.maxDailyLossPct / 100) * guard.startOfDay;
  const used = Math.max(0, -(guard.todayRealized + guard.todayUnrealized));
  const room = maxLoss - used, frac = maxLoss > 0 ? Math.max(0, Math.min(1, room / maxLoss)) : null;
  return (
    <div className="today-strip" role="region" aria-label="Today">
      <span className="ts-k">TODAY</span>
      {checkin
        ? <button className="ts-i" onClick={onCheckIn} title={`Sleep ${checkin.sleep}/5 · mood ${checkin.mood}/5 · stress ${checkin.stress}/5${checkin.note ? ` · ${checkin.note}` : ''} (click to edit)`}><span className="ts-ok">✓</span> Check-in · tilt {checkin.tilt}</button>
        : <button className="ts-i warn" onClick={onCheckIn} title="20 seconds: sleep, mood, stress. Sets your size for the day.">● Check-in not done</button>}
      <button className={`ts-i ${guard.lockout !== 'Clear' ? 'bad' : frac != null && frac < 0.34 ? 'warn' : ''}`} onClick={() => onPage('journal')} title={maxLoss > 0 ? `Daily loss limit ${settings.maxDailyLossPct}% of ${money(guard.startOfDay)} = ${money(maxLoss)}; used ${money(used)} (realized + open)` : 'Set a starting balance and a daily loss limit in the account panel'}>
        {guard.lockout === 'Locked' ? 'Locked: max loss hit' : guard.lockout === 'Cooldown' ? 'Cooldown' : maxLoss > 0 ? <>Loss room <b className="num">{money(room)}</b><i className="ts-bar"><i style={{ width: `${(frac ?? 0) * 100}%` }} /></i></> : 'No loss limit set'}
      </button>
      {next && <button className={`ts-i ${next.at - now < 3600_000 ? 'warn' : ''}`} onClick={() => onPage('calendar')} title={next.note}>{next.label} in <b className="num">{left(next.at - now)}</b></button>}
      {mine.length > 0 && <span className="ts-i plain">Earnings: {mine.map((e) => <button key={e.sym} className="link" onClick={() => onChart(e.sym)} title={`${e.name} · ${e.date} ${e.when}`}>{e.sym} {e.date === today ? (e.when || 'today') : e.date.slice(5)}</button>)}</span>}
      <button className="ts-i" onClick={() => onPage('desk')} title={open.map((v) => v.t.sym).join(', ') || 'No open positions'}>{open.length ? <>{open.length} open · <b className={`num ${guard.todayUnrealized >= 0 ? 'up' : 'down'}`}>{guard.todayUnrealized >= 0 ? '+' : '−'}{money(guard.todayUnrealized)}</b></> : 'Flat'}</button>
    </div>
  );
}
