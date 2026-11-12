// Morning page: everything needed to plan the day before 11:00 ET on one screen. Premarket movers and sectors (delayed),
// SPY/QQQ premarket levels, today's events, the best setups with a buy / sell / wait bias and why, and the rule lights.
import type { MorningState } from '../data/morning';
import type { CalendarState } from '../data/news';
import type { PmRow, Setup } from '../../shared/morning';
import { RulesStatus, type RulesData } from './RulesW';
import { et } from '../lib/clock';
import { pct } from '../lib/format';
import { DayCasesPanel } from './DayCases';
import { Fresh, Skel, Q, qOf } from './common';
import { useDesk } from '../lib/deskctx';
import { tick } from '../../shared/orders';
import { FOMC } from '../../shared/calendar';
import { DAY_END, DAY_START, PHASES, clockMin, frac, phaseAt } from '../../shared/dayplan';

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

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
/** Heat colour for a % move: stronger move, stronger tint (full tint at 2%). */
const heat = (v: number | null) => v == null ? 'transparent' : `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${Math.round(Math.min(1, Math.abs(v) / 2) * 38 + 4)}%, var(--panel))`;

/** 4:00-20:00 ET strip: sessions, the 11:00 cut-off, a "now" needle and today's releases as ticks. */
function DayStrip({ nowMin, isToday, events }: { nowMin: number; isToday: boolean; events: { t: number; label: string }[] }) {
  const cur = isToday ? phaseAt(nowMin) : null;
  return (
    <div className="am-day" aria-label="Trading day timeline">
      <div className="am-day-bar">
        {PHASES.map((p) => <div key={p.id} className={`am-ph ${p.focus ? 'focus' : ''} ${cur?.id === p.id ? 'now' : ''}`} style={{ left: `${frac(p.from) * 100}%`, width: `${(frac(p.to) - frac(p.from)) * 100}%` }} title={`${p.label} ${hm(p.from)}–${hm(p.to)} ET`}><span>{p.label}</span></div>)}
        {events.map((e, i) => <i key={i} className="am-evt" style={{ left: `${frac(e.t) * 100}%` }} title={`${hm(e.t)} ${e.label}`} />)}
        {isToday && nowMin >= DAY_START && nowMin <= DAY_END && <b className="am-needle" style={{ left: `${frac(nowMin) * 100}%` }} title="Now"><u>now</u></b>}
      </div>
      <div className="am-day-ax">{[4, 9.5, 11, 15, 16, 20].map((h) => <span key={h} style={{ left: `${frac(h * 60) * 100}%` }}>{hm(h * 60)}</span>)}</div>
    </div>
  );
}

/** Hover / focus card that explains the setup score: what it is, and the pieces that add up to it. */
function ScoreCard({ s, tone }: { s: Setup; tone: string }) {
  const boost = s.pmVolPct != null ? Math.min(3, 1 + s.pmVolPct / 10) : 1;
  const gap = Math.abs(s.move) * boost, trend = Math.abs(s.quant?.score ?? 0), news = s.catalyst ? 1 : 0;
  const level = s.score >= 8 ? 'Strong' : s.score >= 4 ? 'Worth a look' : 'Quiet';
  return (
    <span className="sc-wrap" tabIndex={0} aria-label={`Setup strength ${s.score.toFixed(1)}: ${level}. Hover for how it's worked out.`}>
      <Ring v={s.score} tone={tone} />
      <span className="sc-card" role="tooltip">
        <span className="sc-h"><b>Setup strength {s.score.toFixed(1)}</b><span className={`sc-lvl ${s.score >= 8 ? 'hi' : s.score >= 4 ? 'mid' : 'lo'}`}>{level}</span></span>
        <span className="sc-p">How loud today's signals are for {s.sym}. It ranks this list: it is not a chance of winning.</span>
        <span className="sc-rows">
          <span className="sc-r"><span>Gap {Math.abs(s.move).toFixed(1)}%{boost > 1 ? <> × {boost.toFixed(1)} volume boost <em>({s.pmVolPct!.toFixed(0)}% of a normal day already traded)</em></> : ''}</span><b>{gap.toFixed(1)}</b></span>
          <span className="sc-r"><span>Trend read{s.quant ? <em> ({s.quant.label})</em> : <em> (none)</em>}</span><b>+{trend.toFixed(1)}</b></span>
          <span className="sc-r"><span>News catalyst{s.catalyst ? '' : <em> (none)</em>}</span><b>+{news}</b></span>
          <span className="sc-r tot"><span>Total</span><b>{s.score.toFixed(1)}</b></span>
        </span>
        <span className="sc-scale"><i className="lo">under 4 quiet</i><i className="mid">4 to 8 worth a look</i><i className="hi">8+ strong (ring full)</i></span>
      </span>
    </span>
  );
}

/** Score as a ring (the arc is full at 8; the number is the raw score). Sized so "16.2" or "104" can never spill over the stroke. */
function Ring({ v, tone }: { v: number; tone: string }) {
  const r = 15, c = 2 * Math.PI * r, f = Math.max(0.04, Math.min(1, v / 8));
  const label = v >= 100 ? '99+' : v >= 10 ? v.toFixed(0) : v.toFixed(1);
  return (
    <svg className={`am-ring ${tone}`} width="44" height="44" viewBox="0 0 40 40" role="img" aria-label={`Setup score ${v.toFixed(1)}`}>
      <circle cx="20" cy="20" r={r} className="bg" /><circle cx="20" cy="20" r={r} className="fg" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 20 20)" />
      <text x="20" y="24" textAnchor="middle">{label}</text>
    </svg>
  );
}

function MoverTable({ rows, phase, onChart, title, q }: { rows: PmRow[]; phase: 'premarket' | 'day'; onChart: (s: string) => void; title: string; q?: { k: import('./common').QKind; src?: string; at?: number } }) {
  if (!rows.length) return null;
  return (
    <section className="am-card">
      <h4>{q && <Q {...q} />}{title}</h4>
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
  const { openOrder, openArticle } = useDesk();
  const entry = s.pmPx ?? s.prevClose;
  return (
    <article className={`am-setup ${cls}`}>
      <header>
        <button className="sym-chip" onClick={() => onChart(s.sym)}>{s.sym}</button>
        {mine && <span className="am-mine" title="On your watchlist">★</span>}
        <span className={`am-bias ${cls}`}>{s.bias}</span>
        <Move v={s.move} />
        <span className="small muted">{s.moveKind === 'premarket' ? 'premarket' : 'last session'}</span>
        <span className="am-sp" /><ScoreCard s={s} tone={cls} />
        {openOrder && s.bias === 'Buy bias' && <button className="link small am-order" onClick={() => openOrder({ sym: s.sym, side: 'BUY', type: 'LIMIT', limit: tick(entry), stopLoss: s.prevClose < entry ? tick(s.prevClose) : null }, entry)} title="Opens the Webull ticket prefilled; nothing is sent until you preview, type your PIN and confirm">Order…</button>}
      </header>
      <div className="am-sname">{s.name}</div>
      <div className="am-meters">
        <div title={`Gap ${pct(s.move, 2)} (bar is full at 5%)`}><span className="small muted">Gap</span><span className="am-bar"><i className={s.move >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(50, (Math.abs(s.move) / 5) * 50)}%`, [s.move >= 0 ? 'left' : 'right']: '50%' }} /></span></div>
        {s.pmVolPct != null && <div title={`Premarket volume is ${s.pmVolPct.toFixed(1)}% of a normal day (bar is full at 20%)`}><span className="small muted">Volume</span><span className="am-bar vol"><i style={{ width: `${Math.min(100, (s.pmVolPct / 20) * 100)}%`, left: 0 }} /></span></div>}
      </div>
      <p className="am-plan">{s.plan}</p>
      <ul className="am-why">{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      {s.catalyst && <button className="link-plain small news-hl" onClick={() => openArticle({ title: s.catalyst!.title, url: s.catalyst!.url, src: s.catalyst!.src, t: Date.now(), syms: [s.sym] })} title="Open the article reader">{s.catalyst.src}: {s.catalyst.title}</button>}
    </article>
  );
}

export default function Morning({ data, cal, pm, rules, now, watch, onChart, onCheckIn, mode }: {
  data: MorningState | null; cal: CalendarState | null; pm: Record<string, { high: number; low: number } | null>; rules: RulesData; now: number; watch: string[];
  onChart: (s: string) => void; onCheckIn: () => void; mode?: import('../data/live').DataMode;
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
  const nowMin = Math.floor(e.sod / 60);
  const dayEvents = [...econ.map((x) => ({ t: clockMin(x.time), label: x.label })), ...(fomc ? [{ t: 14 * 60, label: 'FOMC statement' }] : [])].filter((x): x is { t: number; label: string } => x.t != null);

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
        <DayStrip nowMin={nowMin} isToday={isToday} events={dayEvents} />
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
          <h3><Q k="calc" src="bias = gap direction + the stock's own trend + volume, scored on the desk" />Best setups {phase === 'premarket' ? 'this morning' : 'from the last session'}</h3>
          {!data && <div aria-label="Loading setups"><Skel h={96} n={3} /></div>}
          {data && !data.setups.length && <p className="muted small">No liquid movers yet. Premarket activity shows up after 4:00 ET.</p>}
          {data?.setups.map((s) => <SetupCard key={s.sym} s={s} onChart={onChart} mine={ws.has(s.sym)} />)}
          {data && data.setups.length > 0 && <p className="note">Bias = premarket gap direction + the stock’s own trend (quant read from a year of daily closes) + premarket volume. Buy bias: gap up into an uptrend. Sell bias: gap down into a downtrend. Wait: the gap fights the trend or nothing lines up. A starting point for your own plan, not advice.</p>}
        </section>

        <section className="am-col">
          {mode && <section className="am-card"><h4><Q k="calc" src="historical base rates for SPY, QQQ, IWM" />Today’s cases: bull, stagnant, bear</h4><DayCasesPanel mode={mode} compact /></section>}
          <section className="am-card">
            <h4><Q k="eod" src="FRED release calendar (scheduled times); Fed odds from Kalshi, last trade" />Today’s events</h4>
            {fomc && <p className="small down">FOMC decision day{fomc.sep ? ' (with projections)' : ''}: 2:00 pm ET statement, 2:30 pm press conference.</p>}
            {econ.length > 0 ? <ul className="am-ev">{econ.map((x) => <li key={x.key + x.date}><b>{x.time}</b> {x.label} <span className="am-imp">{'●'.repeat(x.impact)}</span>{x.note && <em className="small muted"> · {x.note}</em>}</li>)}</ul>
              : <p className="small muted">{cal?.econ ? 'No major economic releases.' : 'Economic calendar needs a FRED key.'}</p>}
            {cal?.odds && <p className="small">Next Fed meeting odds ({cal.odds.meeting}): {cal.odds.outcomes.slice(0, 3).map((o) => `${o.label} ${Math.round(o.prob * 100)}%`).join(' · ')}</p>}
            {myEarn.length > 0 && <p className="small"><b>Your tickers reporting:</b> {myEarn.map((x) => `${x.sym} (${x.when})`).join(', ')}</p>}
            {earn.length > 0 && <p className="small muted">{earn.length} companies report: {earn.slice(0, 14).map((x) => x.sym).join(', ')}{earn.length > 14 ? '…' : ''}</p>}
          </section>

          {sectors.length > 0 && (
            <section className="am-card">
              <h4><Q k={qOf(data?.freshness)} src={data?.source} at={data?.asOf} />Sectors {phase === 'premarket' ? 'premarket' : 'last session'}</h4>
              <div className="am-tiles">
                {sectors.map((x) => { const v = phase === 'premarket' ? x.pmChg : x.chg; return (
                  <button key={x.sym} className="am-tile" style={{ background: heat(v) }} onClick={() => onChart(x.sym)} title={`${x.label} (${x.sym})`}>
                    <b>{x.sym}</b><Move v={v} /><em>{x.label}</em>
                  </button>); })}
              </div>
            </section>
          )}

          <MoverTable q={{ k: qOf(data?.freshness), src: data?.source, at: data?.asOf }} rows={data?.watch ?? []} phase={phase} onChart={onChart} title="Your watchlist" />
          <MoverTable q={{ k: qOf(data?.freshness), src: data?.source, at: data?.asOf }} rows={(data?.gainers ?? []).slice(0, 10)} phase={phase} onChart={onChart} title={phase === 'premarket' ? 'Premarket gainers' : 'Top gainers'} />
          <MoverTable q={{ k: qOf(data?.freshness), src: data?.source, at: data?.asOf }} rows={(data?.losers ?? []).slice(0, 10)} phase={phase} onChart={onChart} title={phase === 'premarket' ? 'Premarket losers' : 'Top losers'} />
          {data && Object.keys(data.errors).length > 0 && <p className="small muted">Not available right now: {Object.entries(data.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}</p>}
        </section>
      </div>
    </div>
  );
}
