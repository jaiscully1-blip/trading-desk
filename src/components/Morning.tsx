// Morning page: everything needed to plan the day before 11:00 ET on one screen. Premarket movers and sectors (delayed),
// SPY/QQQ premarket levels, today's events, the best setups with a buy / sell / wait bias and why, and the rule lights.
import type { MorningState } from '../data/morning';
import type { CalendarState } from '../data/news';
import type { PmRow, Setup } from '../../shared/morning';
import { RulesStatus, type RulesData } from './RulesW';
import { et } from '../lib/clock';
import { pct } from '../lib/format';
import { Fresh } from './common';
import { useDesk } from '../lib/deskctx';
import { tick } from '../../shared/orders';
import { FOMC } from '../../shared/calendar';

const ymd = (e: { y: number; mo: number; d: number }) => `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
/** The trading day being planned: today on a weekday before the close, else the next weekday. */
export function planDay(now: number): string {
  let t = now, e = et(t);
  if (e.wd >= 1 && e.wd <= 5 && e.sod < 16 * 3600) return ymd(e);
  do { t += 86400_000; e = et(t); } while (e.wd < 1 || e.wd > 5);
  return ymd(e);
}

function Move({ v }: { v: number | null }) {
  return v == null ? <span className="muted">—</span> : <b className={`num ${v >= 0 ? 'up' : 'down'}`}>{pct(v, 2)}</b>;
}

function MoverTable({ rows, phase, onChart, title }: { rows: PmRow[]; phase: 'premarket' | 'day'; onChart: (s: string) => void; title: string }) {
  if (!rows.length) return null;
  return (
    <section className="am-card">
      <h4>{title}</h4>
      <table className="am-tbl"><tbody>
        {rows.map((r) => (
          <tr key={r.sym}>
            <td><button className="sym-chip" onClick={() => onChart(r.sym)}>{r.sym}</button></td>
            <td className="am-name">{r.name}</td>
            <td><Move v={phase === 'premarket' ? r.pmChg : r.chg} /></td>
            <td className="num small muted">{phase === 'premarket' && r.pmVol ? `${(r.pmVol / 1e6).toFixed(2)}M` : ''}</td>
          </tr>
        ))}
      </tbody></table>
    </section>
  );
}

function SetupCard({ s, onChart, mine }: { s: Setup; onChart: (x: string) => void; mine: boolean }) {
  const cls = s.bias === 'Buy bias' ? 'buy' : s.bias === 'Sell bias' ? 'sell' : 'wait';
  const { openOrder } = useDesk();
  const entry = s.pmPx ?? s.prevClose;
  return (
    <article className={`am-setup ${cls}`}>
      <header>
        <button className="sym-chip" onClick={() => onChart(s.sym)}>{s.sym}</button>
        {mine && <span className="am-mine" title="On your watchlist">★</span>}
        <span className={`am-bias ${cls}`}>{s.bias}</span>
        <Move v={s.move} />
        <span className="small muted">{s.moveKind === 'premarket' ? 'premarket' : 'last session'}</span>
        {openOrder && s.bias === 'Buy bias' && <button className="link small am-order" onClick={() => openOrder({ sym: s.sym, side: 'BUY', type: 'LIMIT', limit: tick(entry), stopLoss: s.prevClose < entry ? tick(s.prevClose) : null }, entry)} title="Opens the Webull ticket prefilled; nothing is sent until you preview, type your PIN and confirm">Order…</button>}
      </header>
      <div className="am-sname">{s.name}</div>
      <p className="am-plan">{s.plan}</p>
      <ul className="am-why">{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {s.catalyst && <a className="small" href={s.catalyst.url} target="_blank" rel="noreferrer noopener">{s.catalyst.src}: {s.catalyst.title}</a>}
    </article>
  );
}

export default function Morning({ data, cal, pm, rules, now, watch, onChart, onCheckIn }: {
  data: MorningState | null; cal: CalendarState | null; pm: Record<string, { high: number; low: number } | null>; rules: RulesData; now: number; watch: string[];
  onChart: (s: string) => void; onCheckIn: () => void;
}) {
  const day = planDay(now);
  const e = et(now);
  const today = ymd(e);
  const isToday = day === today;
  const minsTo11 = isToday ? Math.round((11 * 3600 - e.sod) / 60) : null;
  const dayLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const econ = (cal?.econ ?? []).filter((x) => x.date === day);
  const earn = (cal?.earnings?.week ?? []).filter((x) => x.date === day);
  const myEarn = earn.filter((x) => watch.includes(x.sym));
  const fomc = FOMC.find((f) => f.date === day);
  const ws = new Set(watch);
  const phase = data?.phase ?? 'premarket';
  const sectors = [...(data?.sectors ?? [])].sort((a, b) => ((phase === 'premarket' ? b.pmChg : b.chg) ?? -99) - ((phase === 'premarket' ? a.pmChg : a.chg) ?? -99));
  const maxAbs = Math.max(0.5, ...sectors.map((s) => Math.abs((phase === 'premarket' ? s.pmChg : s.chg) ?? 0)));

  return (
    <div className="page am">
      <section className="panel am-head">
        <div className="phead">
          <div className="phead-title">Morning plan · {dayLabel}</div>
          <div className="phead-ctl">
            {minsTo11 != null && minsTo11 > 0 && <span className="small muted">{minsTo11 >= 60 ? `${Math.floor(minsTo11 / 60)}h ${minsTo11 % 60}m` : `${minsTo11}m`} to the 11:00 cut-off</span>}
            {minsTo11 != null && minsTo11 <= 0 && <span className="small warn-txt">Past 11:00 ET: the morning window is closed</span>}
            {data && <Fresh kind={data.freshness} at={data.asOf} src={data.source} />}
          </div>
        </div>
        <div className="am-top">
          <RulesStatus r={rules} now={now} />
          {!rules.checkedIn && <button className="hw-btn" onClick={onCheckIn}>Check in</button>}
        </div>
        {data && phase === 'day' && <p className="small muted am-pad">Market closed: showing the last session’s moves. Premarket numbers fill in from 4:00 ET on {dayLabel}.</p>}
        {data?.summary && <p className="am-sum am-pad">{data.summary} <span className="small muted">({data.summarySrc === 'gemini' ? 'AI summary of the numbers below' : 'rule-based summary'})</span></p>}
        <div className="am-idx">
          {(data?.indexes ?? []).map((r) => (
            <button key={r.sym} className="am-ix" onClick={() => onChart(r.sym)}>
              <span>{r.sym}</span><Move v={phase === 'premarket' ? r.pmChg : r.chg} />
              {pm[r.sym] && <em className="small muted">PM H {pm[r.sym]!.high.toFixed(2)} · L {pm[r.sym]!.low.toFixed(2)}</em>}
            </button>
          ))}
        </div>
      </section>

      <div className="am-grid">
        <section className="am-col am-setups">
          <h3>Best setups {phase === 'premarket' ? 'this morning' : 'from the last session'}</h3>
          {!data && <p className="muted small">Loading…</p>}
          {data && !data.setups.length && <p className="muted small">No liquid movers yet. Premarket activity shows up after 4:00 ET.</p>}
          {data?.setups.map((s) => <SetupCard key={s.sym} s={s} onChart={onChart} mine={ws.has(s.sym)} />)}
          {data && data.setups.length > 0 && <p className="note">Bias = premarket gap direction + the stock’s own trend (quant read from a year of daily closes) + premarket volume. Buy bias: gap up into an uptrend. Sell bias: gap down into a downtrend. Wait: the gap fights the trend or nothing lines up. A starting point for your own plan, not advice.</p>}
        </section>

        <section className="am-col">
          <section className="am-card">
            <h4>Today’s events</h4>
            {fomc && <p className="small down">FOMC decision day{fomc.sep ? ' (with projections)' : ''}: 2:00 pm ET statement, 2:30 pm press conference.</p>}
            {econ.length > 0 ? <ul className="am-ev">{econ.map((x) => <li key={x.key + x.date}><b>{x.time}</b> {x.label} <span className="am-imp">{'●'.repeat(x.impact)}</span>{x.note && <em className="small muted"> · {x.note}</em>}</li>)}</ul>
              : <p className="small muted">{cal?.econ ? 'No major economic releases.' : 'Economic calendar needs a FRED key.'}</p>}
            {cal?.odds && <p className="small">Next Fed meeting odds ({cal.odds.meeting}): {cal.odds.outcomes.slice(0, 3).map((o) => `${o.label} ${Math.round(o.prob * 100)}%`).join(' · ')}</p>}
            {myEarn.length > 0 && <p className="small"><b>Your tickers reporting:</b> {myEarn.map((x) => `${x.sym} (${x.when})`).join(', ')}</p>}
            {earn.length > 0 && <p className="small muted">{earn.length} companies report: {earn.slice(0, 14).map((x) => x.sym).join(', ')}{earn.length > 14 ? '…' : ''}</p>}
          </section>

          {sectors.length > 0 && (
            <section className="am-card">
              <h4>Sectors {phase === 'premarket' ? 'premarket' : 'last session'}</h4>
              <ul className="am-sec">
                {sectors.map((s) => { const v = (phase === 'premarket' ? s.pmChg : s.chg) ?? 0; return (
                  <li key={s.sym}>
                    <button className="link" onClick={() => onChart(s.sym)}>{s.sym}</button><span className="small muted">{s.label}</span>
                    <span className="am-bar"><i className={v >= 0 ? 'up' : 'down'} style={{ width: `${(Math.abs(v) / maxAbs) * 50}%`, [v >= 0 ? 'left' : 'right']: '50%' }} /></span>
                    <Move v={phase === 'premarket' ? s.pmChg : s.chg} />
                  </li>); })}
              </ul>
            </section>
          )}

          <MoverTable rows={data?.watch ?? []} phase={phase} onChart={onChart} title="Your watchlist" />
          <MoverTable rows={(data?.gainers ?? []).slice(0, 10)} phase={phase} onChart={onChart} title={phase === 'premarket' ? 'Premarket gainers' : 'Top gainers'} />
          <MoverTable rows={(data?.losers ?? []).slice(0, 10)} phase={phase} onChart={onChart} title={phase === 'premarket' ? 'Premarket losers' : 'Top losers'} />
          {data && Object.keys(data.errors).length > 0 && <p className="small muted">Not available right now: {Object.entries(data.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}</p>}
        </section>
      </div>
    </div>
  );
}
