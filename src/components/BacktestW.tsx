// Backtest a playbook on ~3 years of daily bars for a list of tickers. Nothing loads until you press Run,
// because each ticker costs one Twelve Data call (free tier: 8 a minute, so 15 tickers take about 2 minutes).
import { useMemo, useState } from 'react';
import type { HomeData } from './HomeWidgets';
import { backtest, type BtResult } from '../../shared/backtest';
import { useDailyMany } from './Poker';
import { Fresh } from './common';
import { tone } from '../lib/format';

type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }
const SKIP = new Set(['SPY', 'QQQ', 'USO', 'UUP', 'IWM', 'DIA']);
const fr = (x: number, dp = 2) => `${x >= 0 ? '+' : ''}${x.toFixed(dp)}R`;

function Curve({ pts }: { pts: { day: string; r: number }[] }) {
  if (pts.length < 2) return null;
  const W = 320, H = 90, lo = Math.min(0, ...pts.map((p) => p.r)), hi = Math.max(0, ...pts.map((p) => p.r));
  const x = (i: number) => (i / (pts.length - 1)) * W, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mc-fan" role="img" aria-label="Cumulative R by trade">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="mc-zero" />
      <path d={`M${pts.map((p, i) => `${x(i)},${y(p.r)}`).join(' L')}`} className="mc-mid" />
      <text x={2} y={10} className="mc-lab">{pts[0].day}</text><text x={W - 2} y={10} className="mc-lab" textAnchor="end">{pts.at(-1)!.day}</text>
    </svg>
  );
}

export function BacktestW({ d, cfg, set }: P) {
  const pbId: string = cfg.pb ?? d.playbooks[0]?.id;
  const pb = d.playbooks.find((p) => p.id === pbId) ?? d.playbooks[0];
  const minScore: number = cfg.min ?? 80, stopAtr: number = cfg.stop ?? 1.5, targetR: number = cfg.tgt ?? 2, maxDays: number = cfg.days ?? 10;
  const defSyms = useMemo(() => Object.keys(d.quotes).filter((s) => !SKIP.has(s)).slice(0, 15).join(' '), [d.quotes]);
  const [symsTxt, setSymsTxt] = useState<string>(cfg.syms ?? defSyms);
  const [runSyms, setRunSyms] = useState<string[]>([]);
  const want = runSyms.length ? ['SPY', ...runSyms] : [];
  const bars = useDailyMany(want, d.mode);
  const loaded = want.filter((s) => bars[s]?.length);
  const ready = runSyms.length > 0 && loaded.length === want.length;
  const res: BtResult | null = useMemo(() => {
    if (!ready || !pb) return null;
    const data = Object.fromEntries(runSyms.map((s) => [s, bars[s]]));
    return backtest(data, bars.SPY, pb.criteria, { minScore, stopAtr, targetR, maxDays });
  }, [ready, pb, minScore, stopAtr, targetR, maxDays, runSyms.join(','), Object.keys(bars).length]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = () => {
    const list = [...new Set(symsTxt.toUpperCase().split(/[\s,]+/).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s) && s !== 'SPY'))].slice(0, 25);
    set({ ...cfg, syms: list.join(' ') });
    setRunSyms(list);
  };
  const num = (k: string, v: number, step: number, min: number, max: number, label: string, unit = '') => (
    <label className="mc-in">{label}<input type="number" value={v} step={step} min={min} max={max} onChange={(e) => set({ ...cfg, [k]: Math.max(min, Math.min(max, +e.target.value || min)) })} />{unit}</label>
  );
  const s = res?.stats;
  const unchecked = pb ? pb.criteria.filter((c) => c.enabled && (c.type === 'catalyst' || c.type === 'aboveVwap')).map((c) => (c.type === 'catalyst' ? 'catalyst' : 'VWAP')) : [];
  return (
    <div className="hw-col">
      <div className="hw-bar">
        <select value={pb?.id} onChange={(e) => set({ ...cfg, pb: e.target.value })} aria-label="Playbook">{d.playbooks.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className="btn primary" onClick={run} disabled={d.mode.kind === 'checking'}>Run</button>
        {d.mode.kind === 'demo' ? <Fresh kind="demo" /> : <Fresh kind={res ? 'eod' : 'nodata'} src="Twelve Data daily bars, about 3 years" />}
      </div>
      <div className="mc-ins">
        <input className="bt-syms" value={symsTxt} onChange={(e) => setSymsTxt(e.target.value)} placeholder="Tickers, e.g. NVDA AMD MU" aria-label="Tickers to test" />
        {num('min', minScore, 5, 50, 100, 'Grade ≥', '%')}{num('stop', stopAtr, 0.25, 0.5, 5, 'Stop', '×ATR')}{num('tgt', targetR, 0.5, 0.5, 10, 'Target', 'R')}{num('days', maxDays, 1, 1, 60, 'Max hold', 'd')}
      </div>
      {runSyms.length > 0 && !ready && <p className="hw-pad small muted">Loading daily bars {loaded.length}/{want.length}… (free tier: about 8 tickers a minute)</p>}
      {s && s.n > 0 && (
        <>
          <div className="mc-kpis">
            <span>Trades <b className="num">{s.n}</b><small>{res!.from} → {res!.to}</small></span>
            <span>Win rate <b className="num">{Math.round(s.winRate * 100)}%</b><small>{s.wins} winners</small></span>
            <span>Edge <b className={`num ${tone(s.avgR)}`}>{fr(s.avgR)}</b><small>per trade</small></span>
            <span>Total <b className={`num ${tone(s.totalR)}`}>{fr(s.totalR, 1)}</b><small>worst dip {s.maxDdR.toFixed(1)}R</small></span>
          </div>
          <Curve pts={res!.curve} />
          <div className="small bt-line">Avg win {fr(s.avgWinR)} · avg loss {fr(s.avgLossR)} · profit factor {s.profitFactor != null ? s.profitFactor.toFixed(2) : '—'} · avg hold {s.avgDays.toFixed(1)} days{res!.signalsBlocked ? ` · ${res!.signalsBlocked} repeat signals skipped while holding` : ''}</div>
          {s.n < 30 && <p className="hw-pad small warn-txt">Only {s.n} trades: too few to trust. Add tickers or loosen the grade.</p>}
          <div className="wb-tbl">
            <div className="bt-r bt-h"><span>Ticker</span><span>Trades</span><span>Win</span><span>Edge</span><span>Total</span></div>
            {res!.bySym.map((x) => (
              <button key={x.sym} className="bt-r" onClick={() => d.onChart(x.sym)} title="Open the chart">
                <b>{x.sym}</b><span className="num">{x.stats.n}</span><span className="num">{Math.round(x.stats.winRate * 100)}%</span><span className={`num ${tone(x.stats.avgR)}`}>{fr(x.stats.avgR)}</span><span className={`num ${tone(x.stats.totalR)}`}>{fr(x.stats.totalR, 1)}</span>
              </button>
            ))}
          </div>
          <details className="hw-pad bt-trades"><summary className="small">All {s.n} trades</summary>
            {[...res!.trades].reverse().slice(0, 300).map((t, i) => <div key={i} className="bt-t small"><b>{t.sym}</b> {t.entryDay} → {t.exitDay} <span className={tone(t.r)}>{fr(t.r)}</span> <span className="muted">{t.why} · score {t.score}</span></div>)}
          </details>
        </>
      )}
      {res && !s?.n && <p className="hw-pad small muted">No signals: nothing graded {minScore}%+ in this window. Try a lower grade.</p>}
      <p className="note hw-pad">Each day after the close, every ticker is graded on that day’s data only; {minScore}%+ buys the next open. Exit at the stop ({stopAtr}× ATR), the target ({targetR}R) or after {maxDays} days; if a day hits both, the stop counts. {unchecked.length ? `Rules with no history (${unchecked.join(', ')}) are skipped. ` : ''}No fees or slippage, long only, and today’s list of tickers (so past losers that got delisted aren’t in it).</p>
    </div>
  );
}
