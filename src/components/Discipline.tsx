// Journal -> Discipline: three of your rules, kept in front of you.
//  #2 Waiting is a position (log the setups you passed on), #9 If a loss hurts, the size is too big, #10 Track how far price ran after you exit.
// Real daily prices; the "keep 10% running" figure is an ESTIMATE, not a promise. Reminders for your own discipline, not advice.
import { useEffect, useMemo, useState } from 'react';
import { usePersisted } from '../lib/store';
import { etDay, type AccountSettings, type TradeView } from '../lib/journal';
import { ymd } from '../../shared/essay';
import { PASS_REASONS, leftSummary, painCheck, passCounts, postExit, sizeAdvice, type DBar, type ExitRow, type Feel, type Pass } from '../../shared/discipline';

const usd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const pct = (n: number | null, d = 1) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const WINDOW = 10;

function useBars(syms: string[]) {
  const key = syms.join(',');
  const [m, setM] = useState<Record<string, DBar[] | 'error'>>({});
  useEffect(() => {
    let stop = false;
    syms.forEach((s) => fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(s)}&tf=1d`).then(async (r) => {
      const j = await r.json(); if (stop) return;
      setM((x) => ({ ...x, [s]: r.ok ? (j.bars as { time: number; high: number; low: number; close: number }[]).map((b) => ({ day: ymd(b.time), high: b.high, low: b.low, close: b.close })) : 'error' }));
    }).catch(() => { if (!stop) setM((x) => ({ ...x, [s]: 'error' })); }));
    return () => { stop = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

export default function Discipline({ views, settings, equity }: { views: TradeView[]; settings: AccountSettings; equity: number | null }) {
  const [passes, setPasses] = usePersisted<Pass[]>('discPasses', []);
  const [feel, setFeel] = usePersisted<Record<string, Feel>>('discFeel', {});
  const [pain, setPain] = usePersisted<string>('discPain', '');
  const [why, setWhy] = useState(PASS_REASONS[0]);
  const now = Date.now();

  const closed = useMemo(() => views.filter((v) => v.status === 'closed' && !v.t.deleted && v.closedAt != null && v.avgExit != null).sort((a, b) => b.closedAt! - a.closedAt!), [views]);
  const stocks = useMemo(() => closed.filter((v) => (v.t.mult ?? 1) === 1).slice(0, 20), [closed]);
  const syms = useMemo(() => [...new Set(stocks.map((v) => v.t.sym))].filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)).slice(0, 12), [stocks]);
  const bars = useBars(syms);
  const rows: (ExitRow & { v: TradeView })[] = useMemo(() => stocks.map((v) => {
    const b = bars[v.t.sym];
    return { v, id: v.t.id, sym: v.t.sym, side: v.t.side, exitPx: v.avgExit!, qty: v.maxQty, realized: v.realized, win: v.realized > 0, res: Array.isArray(b) ? postExit(v.t.side, v.avgExit!, etDay(v.closedAt!), b, WINDOW) : null };
  }), [stocks, bars]);
  const sum = useMemo(() => leftSummary(rows), [rows]);
  const wins = rows.filter((r) => r.win && r.res), winRun = wins.length ? wins.reduce((a, r) => a + r.res!.runPct, 0) / wins.length : null;

  const losses = closed.filter((v) => v.realized < 0);
  const feels = losses.map((v) => feel[v.t.id]).filter(Boolean) as Feel[];
  const advice = sizeAdvice(feels, settings.riskPct);
  const painN = parseFloat(pain);
  const pc = painCheck(equity, settings.riskPct, Number.isFinite(painN) ? painN : null);
  const tradeTimes = views.filter((v) => !v.t.deleted && v.openedAt != null).map((v) => v.openedAt!);
  const pn = passCounts(passes, tradeTimes, now, etDay);

  return (
    <div className="dsc">
      <section className="dsc-sec">
        <h3>Waiting is a position</h3>
        <p className="small muted">If price isn’t at your zone, you don’t buy or sell: you wait. Most accounts are lost to itchy fingers, not to bad setups. Log every setup you passed on, so patience counts as a decision too.</p>
        <div className="dsc-row">
          <select value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Why I passed">{PASS_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          <button className="btn primary" onClick={() => setPasses([{ t: Date.now(), why }, ...passes].slice(0, 300))}>I waited: passed on a setup</button>
        </div>
        <div className="sm-stats">
          <div><span className="muted small">Passed today</span><b>{pn.passToday}</b></div><div><span className="muted small">Trades today</span><b>{pn.tradesToday}</b></div>
          <div><span className="muted small">Passed, 7 days</span><b>{pn.passWeek}</b></div><div><span className="muted small">Trades, 7 days</span><b>{pn.tradesWeek}</b></div>
        </div>
        {passes.slice(0, 5).map((p) => <div key={p.t} className="small dsc-pass">{new Date(p.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {p.why}<button className="link small" onClick={() => setPasses(passes.filter((x) => x.t !== p.t))}>remove</button></div>)}
      </section>

      <section className="dsc-sec">
        <h3>If a loss hurts, the size is too big</h3>
        <p className="small muted">If losing the same amount still bothers you on the next trade, cut the risk in half. Smaller losses let you keep thinking clearly, and smaller wins can keep up with the bigger ones you give back.</p>
        <div className="dsc-row"><label className="small">A loss of this much would bother me ($)<input inputMode="decimal" value={pain} onChange={(e) => setPain(e.target.value)} placeholder="e.g. 250" /></label>
          <span className="small">{pc.riskUsd == null ? 'Set a starting balance in Account to compare.' : <>Your risk per trade is {settings.riskPct}% ≈ <b>{usd(pc.riskUsd)}</b>{pc.over == null ? '' : pc.over ? <> — <b className="lv-warn">above what would bother you</b>. Lower the risk % in Account.</> : <> — under your pain point.</>}</>}</span></div>
        <p className={`small ${advice.cut ? 'lv-warn' : 'muted'}`} role="status">{advice.cut ? '⚠ ' : ''}{advice.text}</p>
      </section>

      <section className="dsc-sec">
        <h3>What happened after I exited</h3>
        <p className="small muted">My weakness may be cutting winners early. For each closed stock trade: the best move in my direction in the next {WINDOW} sessions, and where price stood on the last one. If there is a gap, the idea is to leave about 10% of the position to run.</p>
        {syms.length > 0 && Object.keys(bars).length < syms.length && <p className="small muted">Loading prices…</p>}
        {sum.withData > 0 && (
          <div className="sm-stats">
            <div><span className="muted small">Avg best run after exit</span><b>{pct(sum.avgRun)}</b></div>
            <div><span className="muted small">Avg after {WINDOW} sessions</span><b>{pct(sum.avgEnd)}</b></div>
            <div><span className="muted small">Winners: avg best run</span><b>{pct(winRun)}</b></div>
            <div><span className="muted small">Ran 5%+ after I sold</span><b>{sum.ranPast5} of {sum.withData}</b></div>
            <div title="Hypothetical: 10% of each position held to the end of the window instead of sold at your exit. Ignores fees and whether you would have held."><span className="muted small">ESTIMATE: keeping 10% running</span><b>{sum.keptRunning == null ? '—' : usd(sum.keptRunning)}</b></div>
          </div>
        )}
        <div className="sm-tblwrap"><table className="sm-tbl">
          <thead><tr><th>Closed</th><th>Ticker</th><th className="r">Exit</th><th className="r">Result</th><th className="r">Best run after</th><th className="r">After {WINDOW} sessions</th><th>If a loss: how did it feel?</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td className="small">{new Date(r.v.closedAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td><td><b>{r.sym}</b> <span className="small muted">{r.side}</span></td>
              <td className="r num">${r.exitPx.toFixed(2)}</td><td className="r num">{usd(r.realized)}</td>
              <td className="r num">{r.res ? pct(r.res.runPct) : <span className="muted">{bars[r.sym] === 'error' ? 'no data' : bars[r.sym] ? 'too recent' : '…'}</span>}</td>
              <td className="r num">{r.res ? `${pct(r.res.endPct)}${r.res.sessions < WINDOW ? ` (${r.res.sessions}d)` : ''}` : ''}</td>
              <td>{r.realized < 0 ? (['fine', 'annoyed', 'hurt'] as Feel[]).map((f) => <button key={f} className={`chip sm ${feel[r.id] === f ? 'on' : ''}`} onClick={() => setFeel({ ...feel, [r.id]: feel[r.id] === f ? undefined as unknown as Feel : f })}>{f === 'fine' ? 'Fine' : f === 'annoyed' ? 'Annoyed' : 'It hurt'}</button>) : <span className="muted small">—</span>}</td></tr>
          ))}</tbody></table></div>
        {!rows.length && <p className="muted small">No closed stock trades yet. Options are left out: their underlying prices don’t line up with the premium you sold at.</p>}
        <p className="note">Prices: Yahoo Finance daily bars (unofficial, end of day, about the last year). A run after you sold doesn’t mean the exit was wrong: a plan, a stop or a risk limit may have been the reason to sell.</p>
      </section>
    </div>
  );
}
