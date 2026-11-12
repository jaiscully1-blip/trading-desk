// Countdowns to the next market-moving releases: CPI, jobs report, PCE, PPI, GDP, retail sales, jobless claims and the
// next Fed decision. Release dates come from FRED's release calendar (the Economic calendar), Fed dates from the Fed's schedule.
import { useMemo } from 'react';
import { FOMC } from '../../shared/calendar';
import { nextMacro } from '../../shared/catalysts';
import { etToUtc } from '../../shared/clock';
import type { CalendarState } from '../data/news';
import { useTick } from '../lib/useTick';
import { Fresh } from './common';

const left = (ms: number) => {
  if (ms <= 0) return 'out now';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d >= 1) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};
const when = (at: number) => new Date(at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export function MacroClock({ cal, max = 8, compact = false }: { cal: CalendarState | null; max?: number; compact?: boolean }) {
  const now = useTick(1000);
  const list = useMemo(() => nextMacro(cal?.econ ?? [], FOMC, now, etToUtc), [cal?.econ, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const fr = cal?.freshness ?? 'pending';
  return (
    <div className={`mc ${compact ? 'compact' : ''}`}>
      {!compact && <div className="mc-h small muted">Next releases <Fresh kind={!cal ? 'pending' : fr === 'demo' ? 'demo' : cal.econ ? 'live' : 'nodata'} src="Release dates: FRED release calendar (official agency schedules). Fed decision dates: the Fed's published FOMC calendar. Times are the usual ET release times." /></div>}
      <div className="mc-row">
        {list.slice(0, max).map((x) => {
          const ms = x.at - now;
          return (
            <div key={x.key} className={`mc-item imp-${x.impact} ${ms <= 0 ? 'out' : ms < 3600_000 ? 'soon' : ''}`} title={`${x.label} · ${when(x.at)} ET${x.tentative ? ' (tentative)' : ''}\n${x.note}`}>
              <span className="mc-l">{x.label}</span>
              <b className="num mc-t">{left(ms)}</b>
              <span className="mc-w small muted">{when(x.at)}</span>
            </div>
          );
        })}
        {cal && !cal.econ && fr !== 'demo' && <span className="small muted mc-miss">CPI, jobs and PCE dates come from FRED's release calendar, which isn't loading{cal.errors?.econ ? `: ${cal.errors.econ}` : ' (FRED_API_KEY not set)'}.</span>}
        {!list.length && <span className="small muted">{cal?.econ ? 'Nothing scheduled in the next 60 days.' : cal ? '' : 'Loading…'}</span>}
      </div>
    </div>
  );
}
