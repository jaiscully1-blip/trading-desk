// Weekly review (Journal): your week's check-ins next to results, which rules cost money, and plain comparisons.
// Built from what the desk already logs (journal, check-ins, end-of-day answers). Reflection, not a score.
import { useMemo, useState } from 'react';
import type { CheckIn, TradeView, Violation } from '../lib/journal';
import { useDayReviews } from '../lib/dayReview';
import { mondayOf, weekReview } from '../lib/weekly';
import { Q } from './common';

const money = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
const d5 = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function WeeklyReview({ views, violations, checkins, today, onDay, onCheckIn }: {
  views: TradeView[]; violations: Violation[]; checkins: CheckIn[]; today: string; onDay: (day: string) => void; onCheckIn: () => void;
}) {
  // on the weekend, "this week" is the week that just ended
  const wd = new Date(`${today}T12:00:00Z`).getUTCDay();
  const [back, setBack] = useState(0);
  const monday = mondayOf(today, back);
  const reviews = useDayReviews();
  const w = useMemo(() => weekReview(monday, views, violations, checkins, Object.fromEntries(Object.entries(reviews).map(([d, r]) => [d, { grade: r.grade, answers: r.answers }]))), [monday, views, violations, checkins, reviews]);
  const checked = w.days.filter((d) => d.checkin).length;
  return (
    <div className="page wk">
      <section className="panel">
        <div className="phead">
          <div className="phead-title">Weekly review · {d5(w.start)} to {d5(w.end)}</div>
          <div className="phead-ctl">
            <button className="btn" onClick={() => setBack(back + 1)}>‹ Earlier</button>
            <button className="btn" onClick={() => setBack(Math.max(0, back - 1))} disabled={back === 0}>Later ›</button>
            <Q k="mine" src="your journal, check-ins and end-of-day answers (this browser)" />
          </div>
        </div>
        <div className="wk-sum">
          <div><span>Net P&amp;L</span><b className={`num ${w.pnl >= 0 ? 'up' : 'down'}`}>{money(w.pnl)}</b></div>
          <div><span>Closed trades</span><b className="num">{w.trades}</b>{w.winRate != null && <em>{w.winRate.toFixed(0)}% winners</em>}</div>
          <div><span>Check-ins</span><b className="num">{checked}/5</b>{back === 0 && wd >= 1 && wd <= 5 && !w.days.find((d) => d.day === today)?.checkin && <em><button className="link" onClick={onCheckIn}>do today's</button></em>}</div>
          <div><span>Rule breaks</span><b className={`num ${w.breaks ? 'down' : ''}`}>{w.breaks}</b>{w.breakCost > 0 && <em>cost {money(-w.breakCost)}</em>}</div>
        </div>
      </section>
      <section className="panel">
        <div className="gx-h"><b>Day by day</b><span className="small muted">click a day to open its recap</span></div>
        <table className="cs-t wk-t"><thead><tr><th>Day</th><th>Morning check-in</th><th>P&amp;L</th><th>Trades</th><th>Rule breaks</th><th>Your end-of-day answers</th></tr></thead><tbody>
          {w.days.map((d) => (
            <tr key={d.day} onClick={() => onDay(d.day)} className={d.day === today ? 'on' : ''}>
              <td><b>{d.wd}</b> <span className="muted small">{d5(d.day)}</span></td>
              <td className="small">{d.checkin ? <>sleep {d.checkin.sleep} · mood {d.checkin.mood} · stress {d.checkin.stress} · tilt <b className={d.checkin.tilt >= 60 ? 'down' : ''}>{d.checkin.tilt}</b>{d.checkin.note && <span className="muted"> · “{d.checkin.note}”</span>}</> : <span className="muted">—</span>}</td>
              <td className={`num ${d.pnl > 0 ? 'up' : d.pnl < 0 ? 'down' : ''}`}>{d.trades ? money(d.pnl) : '—'}</td>
              <td className="num">{d.trades || '—'}{d.trades > 0 && <span className="muted small"> ({d.wins} won)</span>}</td>
              <td className="num">{d.breaks ? <span className="down">{d.breaks} · {money(-d.breakCost)}</span> : '—'}</td>
              <td className="small">{d.review ? Object.values(d.review).filter(Boolean).join(' · ') : <span className="muted">not answered</span>}{d.grade && <b> · {d.grade}</b>}</td>
            </tr>
          ))}
        </tbody></table>
      </section>
      <div className="cs-grid">
        <section className="panel">
          <div className="gx-h"><b>Rules that cost money</b></div>
          {w.rules.length ? <table className="cs-t"><thead><tr><th>Rule</th><th>Times</th><th>Cost</th></tr></thead><tbody>{w.rules.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{r.n}</td><td className="num down">{money(-r.cost)}</td></tr>)}</tbody></table>
            : <p className="small gx-pad">No rule breaks this week.</p>}
        </section>
        <section className="panel">
          <div className="gx-h"><b>What your week says</b><span className="small muted">average P&amp;L per trading day</span></div>
          {w.compare.length ? <ul className="wk-cmp small">{w.compare.map((c) => <li key={c.label}><b>{c.label}:</b> days you {c.a} <b className={c.aAvg >= 0 ? 'up' : 'down'}>{money(c.aAvg)}</b> <span className="muted">({c.aN})</span> vs days you {c.b} <b className={c.bAvg >= 0 ? 'up' : 'down'}>{money(c.bAvg)}</b> <span className="muted">({c.bN})</span></li>)}</ul>
            : <p className="small muted gx-pad">Comparisons show once there are at least 2 trading days on each side (for example 2 days with a check-in and 2 without).</p>}
          <p className="small muted gx-pad">A week is a small sample. Look for the same pattern showing up week after week.</p>
        </section>
      </div>
    </div>
  );
}
