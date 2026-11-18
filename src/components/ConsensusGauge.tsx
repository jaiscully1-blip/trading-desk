// Analyst consensus on the Company page: where the ratings mix sits from strong sell to strong buy, how many analysts,
// the split, the average price target vs the last close, and whether the mix moved over the last months.
// A summary of what analysts publish (Finnhub, Alpha Vantage), not a recommendation from the desk.
import { useEffect, useState } from 'react';
import { Fresh } from './common';

const SEG = [['strongSell', 'Strong sell', 'var(--down)'], ['sell', 'Sell', 'color-mix(in srgb, var(--down) 60%, var(--muted))'], ['hold', 'Hold', 'var(--muted)'], ['buy', 'Buy', 'color-mix(in srgb, var(--up) 60%, var(--muted))'], ['strongBuy', 'Strong buy', 'var(--up)']] as const;

export function ConsensusGauge({ sym, live }: { sym: string; live: boolean }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { setD(null); if (live) fetch(`/api/research?fn=consensus&symbol=${sym}`).then((r) => r.json()).then(setD).catch((e) => setD({ error: String(e) })); }, [sym, live]);
  if (!live) return null;
  if (!d) return <p className="small muted">Loading analyst consensus…</p>;
  if (d.error) return <p className="small down">{d.error}</p>;
  if (!d.counts) return <p className="small muted">No analyst ratings found{d.keys && !d.keys.finnhub && !d.keys.alphavantage ? ' (needs the Finnhub or Alpha Vantage key)' : ''}.</p>;
  const s = d.score, c = d.counts, n = s.n;
  const prev = d.trend?.[d.trend.length - 1];
  const bulls = (x: any) => (x.strongBuy + x.buy) / Math.max(1, x.strongBuy + x.buy + x.hold + x.sell + x.strongSell);
  const shift = prev && d.trend.length > 1 ? (bulls(d.trend[0]) - bulls(prev)) * 100 : null;
  return (
    <div className="cg">
      <div className="cg-top">
        <div>
          <span className="cg-k">Analyst consensus</span>
          <b className={`cg-label ${s.score >= 3.5 ? 'up' : s.score < 2.5 ? 'down' : ''}`}>{s.label}</b>
          <span className="small muted"> · {s.score.toFixed(2)} of 5 · {n} analyst{n === 1 ? '' : 's'}</span>
        </div>
        <Fresh kind="eod" src={`${d.countsFrom}${d.period ? ` (${d.period.slice(0, 7)})` : ''}${d.target ? '; target from Alpha Vantage company overview' : ''}`} />
      </div>
      <div className="cg-gauge" role="img" aria-label={`Consensus ${s.label}, ${s.score.toFixed(2)} on a 1 to 5 scale`}><span className="cg-bar" /><i style={{ left: `${Math.min(99, Math.max(1, s.pos))}%` }} /></div>
      <div className="cg-ends small muted"><span>Strong sell</span><span>Hold</span><span>Strong buy</span></div>
      <div className="cg-split" aria-label="Ratings split">{SEG.map(([k, , col]) => (c[k] ? <span key={k} style={{ flex: c[k], background: col }} title={`${c[k]} ${k}`} /> : null))}</div>
      <div className="cg-legend small">{SEG.map(([k, label]) => <span key={k}><b className="num">{c[k]}</b> {label}</span>)}</div>
      <div className="cg-nums">
        <div><span className="cg-k">Average target</span><b className="num">{d.target ? `$${d.target.toFixed(2)}` : '—'}</b></div>
        <div><span className="cg-k">Last close</span><b className="num">{d.last ? `$${d.last.toFixed(2)}` : '—'}</b></div>
        <div><span className="cg-k">Target vs last</span><b className={`num ${d.upside == null ? '' : d.upside >= 0 ? 'up' : 'down'}`}>{d.upside == null ? '—' : `${d.upside >= 0 ? '+' : ''}${d.upside.toFixed(1)}%`}</b></div>
        {shift != null && <div><span className="cg-k">Buy share vs {prev.period.slice(0, 7)}</span><b className={`num ${shift > 0 ? 'up' : shift < 0 ? 'down' : ''}`}>{shift >= 0 ? '+' : ''}{shift.toFixed(0)} pts</b></div>}
      </div>
      {d.upside != null && Math.abs(d.upside) > 100 && <p className="small muted">A target this far from the price usually means few analysts, old targets or a stock that moved a lot since they were set.</p>}
      <p className="note">What analysts publish, summarised. Not a recommendation from the desk, and targets are often revised after the price moves.</p>
    </div>
  );
}
