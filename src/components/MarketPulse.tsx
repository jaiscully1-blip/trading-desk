// Top bar "market pulse": today's line for SPY, QQQ and IWM and a breadth bar (how many big US stocks are up vs down).
// Live data only (Yahoo, ~15 min delayed; breadth from the TradingView screener). Nothing shows in demo mode or without data.
import { useEffect, useState } from 'react';

interface Row { sym: string; last: number; chgPct: number; spark: number[] }
interface Pulse { rows: Row[]; breadth: { up: number; down: number; flat: number; total: number } | null; asOf: number; source: string }

function Spark({ v, up }: { v: number[]; up: boolean }) {
  if (v.length < 3) return null;
  const lo = Math.min(...v), hi = Math.max(...v), w = 58, h = 18, span = hi - lo || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 1 - ((y - lo) / span) * (h - 2)).toFixed(1)}`).join(' ');
  return <svg className="mp-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

export function MarketPulse({ live, onSelect }: { live: boolean; onSelect: (s: string) => void }) {
  const [d, setD] = useState<Pulse | null>(null);
  useEffect(() => {
    if (!live) { setD(null); return; }
    let stop = false;
    const go = () => fetch('/api/research?fn=pulse').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop && j) setD(j); }).catch(() => {});
    go();
    const t = setInterval(go, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [live]);
  if (!d) return null;
  const b = d.breadth;
  return (
    <div className="mp" title={`Today so far. ${d.source}. Updated ${new Date(d.asOf).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.`}>
      {d.rows.filter((r) => r.sym === 'IWM').map((r) => (
        <button key={r.sym} className="mp-row" onClick={() => onSelect(r.sym)}>
          <span className="tick-l">{r.sym}</span><span className={`num ${r.chgPct >= 0 ? 'up' : 'down'}`}>{r.chgPct >= 0 ? '+' : ''}{r.chgPct.toFixed(2)}%</span>
        </button>
      ))}
      {d.rows.map((r) => <button key={`s${r.sym}`} className="mp-sp" onClick={() => onSelect(r.sym)} aria-label={`${r.sym} today`}><span className="mp-sym">{r.sym}</span><Spark v={r.spark} up={r.chgPct >= 0} /></button>)}
      {b && b.total > 0 && (
        <div className="mp-breadth" title={`Breadth: ${b.up} of ${b.total} big US stocks up, ${b.down} down, ${b.flat} flat`}>
          <span className="tick-l">A/D</span>
          <span className="mp-bar" aria-hidden="true"><i className="u" style={{ width: `${(b.up / b.total) * 100}%` }} /><i className="f" style={{ width: `${(b.flat / b.total) * 100}%` }} /><i className="d" style={{ width: `${(b.down / b.total) * 100}%` }} /></span>
          <span className="num small"><span className="up">{b.up}</span>/<span className="down">{b.down}</span></span>
        </div>
      )}
    </div>
  );
}
