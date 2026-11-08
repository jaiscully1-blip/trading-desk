// Quant read for one ticker: the bull/bear lean with every reason, then the numbers behind it.
import { useEffect, useState } from 'react';
import type { QuantRead as Q } from '../../shared/quant';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import { Fresh } from './common';

const sg = (v: number | null | undefined, dp = 1, suf = '%') => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}${suf}`);
const TIP: Record<string, string> = {
  beta: 'How much it moves when SPY moves 1%. 1.5 = 50% more swing than the market.',
  alpha: 'Yearly return beyond what its beta explains (CAPM). Positive = it earned more than its market risk alone would.',
  r2: 'How much of its daily movement the market explains. Low = it trades on its own story.',
  garch: 'GARCH(1,1) forecast of volatility: today’s shocks raise tomorrow’s expected swing, then fade at a fitted rate.',
  hurst: 'Memory of moves: 0.5 = random walk, above 0.55 = moves tend to continue, below 0.45 = moves tend to reverse.',
  entropy: 'How random the day-to-day up/down ordering is (1.00 = pure noise). Lower = more structure for patterns to work.',
  var: 'Historical 1-day Value at Risk: on the worst 5% of days it fell at least this much; CVaR is the average of those days.',
  sharpe: 'Return per unit of total risk (Sharpe) and per unit of downside risk (Sortino), annualized, no risk-free rate.',
};

export function QuantPanel({ sym, mode, compact }: { sym: string; mode: DataMode; compact?: boolean }) {
  const live = mode.kind === 'live';
  const r = useApi<Q & { sym: string; asOf: number; asOfDay: string; source: string }>(live ? `/api/research?fn=quant&symbol=${encodeURIComponent(sym)}` : null, 0, 3600_000);
  const [open, setOpen] = useState(!compact);
  useEffect(() => setOpen(!compact), [compact, sym]);
  if (!live) return <p className="small muted"><Fresh kind="demo" /> The quant read uses real daily closes, so it needs the live desk.</p>;
  const q = r.data?.sym === sym ? r.data : null;
  if (!q) return <p className="small muted">{r.error ? <span className="down">{r.error}</span> : 'Crunching a year of daily closes…'}</p>;
  const v = q.verdict;
  const tone = v.score >= 1 ? 'up' : v.score <= -1 ? 'down' : 'muted';
  return (
    <div className="qr">
      <div className="qr-top">
        <span className={`qr-verdict ${tone}`}>{v.label.toUpperCase()}</span>
        <span className="small muted">score {v.score > 0 ? '+' : ''}{v.score} · regime: <b>{q.regime.label}</b></span>
        <Fresh kind="eod" at={q.asOf} src={`Daily closes to ${q.asOfDay}: ${q.source}`} />
      </div>
      <ul className="qr-why">
        {v.reasons.map((x, i) => <li key={i}><span className={`qr-pt ${x.pts > 0 ? 'up' : x.pts < 0 ? 'down' : 'muted'}`}>{x.pts > 0 ? '▲' : x.pts < 0 ? '▼' : '•'}</span><b>{x.factor}:</b> {x.text}</li>)}
      </ul>
      <p className="small muted">{q.regime.text}</p>
      {compact && <button className="link small" onClick={() => setOpen((o) => !o)}>{open ? 'Hide the numbers' : 'Show the numbers'}</button>}
      {open && (
        <div className="qr-grid">
          <div><span>1M / 3M / 6M</span><b>{sg(q.ret.m1)} / {sg(q.ret.m3)} / {sg(q.ret.m6)}</b></div>
          <div><span>1 year</span><b>{sg(q.ret.y1)}</b></div>
          <div title={TIP.beta}><span>Beta vs SPY</span><b>{q.capm ? q.capm.beta.toFixed(2) : '—'}</b></div>
          <div title={TIP.alpha}><span>Alpha (CAPM)</span><b className={(q.capm?.alpha ?? 0) >= 0 ? 'up' : 'down'}>{sg(q.capm?.alpha)}/yr</b></div>
          <div title={TIP.r2}><span>R² with SPY</span><b>{q.capm ? `${Math.round(q.capm.r2 * 100)}%` : '—'}</b></div>
          <div><span>Volatility (1y)</span><b>{q.vol.toFixed(0)}%/yr</b></div>
          <div title={TIP.garch}><span>GARCH vol next day / 20d</span><b className={q.garch && q.garch.ratio >= 1.3 ? 'down' : ''}>{q.garch ? `${q.garch.volNow.toFixed(0)}% / ${q.garch.vol20.toFixed(0)}%` : '—'}</b></div>
          <div title={TIP.garch}><span>Shock half-life</span><b>{q.garch?.halfLife ? `${q.garch.halfLife.toFixed(0)} days` : '—'}</b></div>
          <div title={TIP.hurst}><span>Hurst (memory)</span><b>{q.hurst?.toFixed(2) ?? '—'}</b></div>
          <div title={TIP.entropy}><span>Entropy (randomness)</span><b>{q.entropy?.toFixed(3) ?? '—'}</b></div>
          <div title={TIP.var}><span>1-day VaR / CVaR 95%</span><b className="down">{q.var95.toFixed(1)}% / {q.cvar95.toFixed(1)}%</b></div>
          <div title={TIP.sharpe}><span>Sharpe / Sortino</span><b>{q.sharpe.toFixed(2)} / {q.sortino.toFixed(2)}</b></div>
          <div><span>Max drawdown (1y)</span><b className="down">{q.maxDD.toFixed(0)}%</b></div>
          <div><span>Off 1-year high</span><b>{q.curDD.toFixed(1)}%</b></div>
        </div>
      )}
      <p className="note qr-note">Statistics about the past year, not a forecast or advice. Each ▲/▼ adds or subtracts a point; ±3 or more = Bullish / Bearish.</p>
    </div>
  );
}
