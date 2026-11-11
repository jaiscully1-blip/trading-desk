import type { DataMode } from '../data/live';
import type { NewsItem } from '../../shared/news';
import { EarnIpoPanel } from './EarnIpo';
import type { CalendarState } from '../data/news';
import { nextFomc } from '../data/news';
import { FOMC } from '../../shared/calendar';
import { etToUtc, hms } from '../lib/clock';
import { Fresh } from './common';

const dow = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function Calendars({ cal, now, onSelect, mySyms, mode, news }: { cal: CalendarState | null; now: number; onSelect: (s: string) => void; mySyms: Set<string>; mode: DataMode; news: NewsItem[] }) {
  const f = nextFomc(now);
  const fomcAt = f ? etToUtc(+f.date.slice(0, 4), +f.date.slice(5, 7), +f.date.slice(8, 10), 14, 0) : null;
  const fr = cal?.freshness ?? 'pending';
  const errs = cal?.errors ?? {};
  return (
    <div className="cal-tab">
      <section className="cal-sec">
        <h4>Fed <span className="muted small">statement 2:00 PM ET</span></h4>
        {f && fomcAt ? (
          <div className="fomc">
            <div><b>{dow(f.date)}</b>{f.sep && <span className="tag" title="Summary of Economic Projections (dot plot)">SEP</span>}{f.tentative && <span className="tag">tentative</span>}</div>
            <div className="num fomc-cd">{fomcAt > now ? hms(Math.round((fomcAt - now) / 1000)) : 'today'}</div>
          </div>
        ) : <p className="muted small">No upcoming meeting in the schedule.</p>}
        <div className="odds">
          <div className="odds-h"><span className="small muted">Rate odds{cal?.odds ? ` · ${cal.odds.meeting}` : ''}</span>
            <Fresh kind={cal?.odds ? (fr === 'demo' ? 'demo' : 'live') : errs.odds ? 'nodata' : fr === 'demo' ? 'demo' : 'pending'} src="Kalshi prediction market (last trade). Not CME FedWatch, which has no free API." />
          </div>
          {cal?.odds?.outcomes.map((o) => (
            <div key={o.label} className="odds-row"><span>{o.label}</span><span className="odds-bar"><span style={{ width: `${Math.min(100, o.prob * 100)}%` }} /></span><b className="num">{(o.prob * 100).toFixed(0)}%</b></div>
          ))}
          {!cal?.odds && <p className="muted small">{errs.odds ? `Kalshi unavailable: ${errs.odds}` : 'Loading…'}</p>}
        </div>
        <details className="small muted"><summary>All FOMC dates</summary>{FOMC.filter((m) => m.date >= new Date(now).toISOString().slice(0, 10)).map((m) => <div key={m.date}>{dow(m.date)}{m.sep ? ' · SEP' : ''}{m.tentative ? ' · tentative' : ''}</div>)}</details>
      </section>

      <section className="cal-sec">
        <h4>Economic calendar <Fresh kind={cal?.econ ? fr : errs.econ ? 'nodata' : fr === 'demo' ? 'demo' : 'pending'} src="FRED release calendar; SPY reaction from Twelve Data daily bars" /></h4>
        {cal?.econ?.slice(0, 14).map((e, i) => (
          <div key={i} className="econ" title={e.note}>
            <span className="num small">{dow(e.date)} {e.time}</span>
            <span className={`imp imp-${e.impact}`} title={['', 'Low', 'Medium', 'High'][e.impact] + ' impact'}>{'●'.repeat(e.impact)}{'○'.repeat(3 - e.impact)}</span>
            <b>{e.label}</b>
            <span className="small muted econ-u">
              {e.usual ? `SPY moved ${e.usual.avgAbsMove.toFixed(2)}% avg on the last ${e.usual.n} (vs ${e.usual.baseline.toFixed(2)}% typical), up ${e.usual.upPct.toFixed(0)}%` : 'no history'}
            </span>
          </div>
        ))}
        {cal?.econ && !cal.econ.length && <p className="muted small">Nothing scheduled in the next 60 days.</p>}
        {!cal?.econ && <p className="muted small">{errs.econ ?? (fr === 'pending' ? 'Loading…' : 'Set FRED_API_KEY for the economic calendar.')}</p>}
      </section>

      <section className="cal-sec">
        <h4>Earnings and IPOs</h4>
        <EarnIpoPanel mode={mode} mySyms={mySyms} news={news} onSelect={onSelect} />
      </section>
    </div>
  );
}
