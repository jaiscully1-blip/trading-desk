// Header market zone: SPY, QQQ, IWM and DIA as matching chips (price, change, today's line) plus an advance / decline chip.
// Prices come from the desk's live quotes when it has them, else from the pulse feed (Yahoo, ~15 min delayed); the lines
// and breadth only show with live data (breadth from the TradingView screener). Nothing made up in demo mode.
import { useEffect, useState } from 'react';
import type { Quote } from '../types';
import { FlashNum } from './common';
import { px, pct, tone } from '../lib/format';

interface Row { sym: string; last: number; chgPct: number; spark: number[] }
interface Pulse { rows: Row[]; breadth: { up: number; down: number; flat: number; total: number } | null; asOf: number; source: string }
const SYMS = ['SPY', 'QQQ', 'IWM', 'DIA'];

function Spark({ v, up }: { v: number[]; up: boolean }) {
  if (v.length < 3) return <span className="mc-spark-empty" />;
  const lo = Math.min(...v), hi = Math.max(...v), w = 46, h = 16, span = hi - lo || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 1 - ((y - lo) / span) * (h - 2)).toFixed(1)}`).join(' ');
  return <svg className="mc-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline points={pts} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth="1.4" strokeLinejoin="round" /></svg>;
}

export function MarketChips({ live, quotes, onSelect }: { live: boolean; quotes: Record<string, Quote>; onSelect: (s: string) => void }) {
  const [d, setD] = useState<Pulse | null>(null);
  useEffect(() => {
    if (!live) { setD(null); return; }
    let stop = false;
    const go = () => fetch('/api/research?fn=pulse').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop && j) setD(j); }).catch(() => {});
    go();
    const t = setInterval(go, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [live]);
  const b = d?.breadth;
  return (
    <div className="mc" title={d ? `Lines: today so far. ${d.source}.` : undefined}>
      {SYMS.map((s) => {
        const q = quotes[s], p = d?.rows.find((r) => r.sym === s);
        const last = q && Number.isFinite(q.last) ? q.last : p?.last, chg = q && Number.isFinite(q.chgPct) ? q.chgPct : p?.chgPct;
        if (last == null || chg == null) return null;
        return (
          <button key={s} className="mc-chip" onClick={() => onSelect(s)} title={`${s}: open on the desk`}>
            <span className="mc-sym">{s}</span>
            <FlashNum v={last}>{px(last)}</FlashNum>
            <span className={`num ${tone(chg)}`}>{pct(chg)}</span>
            {p && <Spark v={p.spark} up={chg >= 0} />}
          </button>
        );
      })}
      {b && b.total > 0 && (
        <span className="mc-chip mc-breadth" title={`Breadth: ${b.up} of ${b.total} big US stocks up, ${b.down} down, ${b.flat} flat`}>
          <span className="mc-sym">A/D</span>
          <span className="mp-bar" aria-hidden="true"><i className="u" style={{ width: `${(b.up / b.total) * 100}%` }} /><i className="f" style={{ width: `${(b.flat / b.total) * 100}%` }} /><i className="d" style={{ width: `${(b.down / b.total) * 100}%` }} /></span>
          <span className="num small"><span className="up">{b.up}</span>/<span className="down">{b.down}</span></span>
        </span>
      )}
    </div>
  );
}
