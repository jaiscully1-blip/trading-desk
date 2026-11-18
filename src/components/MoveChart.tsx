// One chart behavior for the whole desk: move along the line to read the exact value and date, click and drag to
// scroll back in time, pick a range (1M ... All), double-click to reset, click a point to pin its details, and use
// the arrow keys when the chart has focus. No wheel zoom, so trackpad scrolling still scrolls the page.
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPE, type ReactNode } from 'react';

export interface MPoint { t: number; v: number; note?: string }
export interface MSeries { pts: MPoint[]; label: string; color?: string; fmt?: (v: number) => string }
const fd = (t: number, daily: boolean) => new Date(t).toLocaleDateString('en-US', daily ? { month: 'short', day: 'numeric', year: 'numeric' } : { month: 'short', year: 'numeric' });
const RANGES: [string, number][] = [['1M', 31], ['3M', 92], ['6M', 183], ['1Y', 366], ['5Y', 1830], ['All', 0]];

export function MoveChart({ series, height = 160, ranges = true, defaultRange = 'All', onPick, extra, compare = false, bars = false }: {
  series: MSeries[]; height?: number; ranges?: boolean; defaultRange?: string; onPick?: (t: number, values: (number | null)[]) => ReactNode; extra?: ReactNode; compare?: boolean; bars?: boolean;
}) {
  const main = series[0]?.pts ?? [];
  const daily = main.length > 2 && main[1].t - main[0].t < 5 * 86400000;
  const [range, setRange] = useState(defaultRange);
  const [win, setWin] = useState<[number, number] | null>(null); // index window into main
  const [hov, setHov] = useState<number | null>(null), [pin, setPin] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null), drag = useRef<{ x: number; a: number; b: number; moved: boolean } | null>(null);
  const span = useMemo(() => { const days = RANGES.find((r) => r[0] === range)?.[1] ?? 0; if (!days || !main.length) return main.length; const from = main[main.length - 1].t - days * 86400000; return Math.max(3, main.length - main.findIndex((p) => p.t >= from)); }, [range, main]);
  useEffect(() => { setWin(null); setPin(null); }, [range, main.length]);
  const [a, b] = win ?? [Math.max(0, main.length - span), main.length - 1];
  const W = 600, H = height, L = 4, R = 54, T = 8, B = 18;
  const view = main.slice(a, b + 1), t0 = view[0]?.t ?? 0, t1 = view[view.length - 1]?.t ?? 1;
  const inView = (s: MSeries) => s.pts.filter((p) => p.t >= t0 && p.t <= t1);
  const norm = compare && series.length > 1; // several series: each scaled to % change from the window start
  const val = (s: MSeries, p: MPoint) => { if (!norm) return p.v; const f = inView(s)[0]?.v; return f ? (p.v / f - 1) * 100 : 0; };
  const all = series.flatMap((s) => inView(s).map((p) => val(s, p)));
  const lo = Math.min(...all, bars ? 0 : Infinity), hi = Math.max(...all, bars ? 0 : -Infinity), pad = (hi - lo) * 0.06 || 1;
  const X = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), Y = (v: number) => T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - T - B);
  const fmt = (s: MSeries, v: number) => (norm ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : (s.fmt ?? ((x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 2 })))(v));
  const nearest = (s: MSeries, t: number) => { let best: MPoint | null = null; for (const p of inView(s)) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; return best; };
  const idxAt = (clientX: number) => { const r = svg.current!.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * W, t = t0 + ((x - L) / (W - L - R)) * (t1 - t0); let i = a; for (let k = a; k <= b; k++) if (Math.abs(main[k].t - t) < Math.abs(main[i].t - t)) i = k; return i; };
  const per = () => (svg.current ? svg.current.getBoundingClientRect().width / Math.max(1, b - a) : 1);
  const h: Record<string, (e: RPE<SVGSVGElement>) => void> = {
    onPointerDown: (e) => { drag.current = { x: e.clientX, a, b, moved: false }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e) => {
      const d = drag.current;
      if (d) { const shift = Math.round((d.x - e.clientX) / per()); if (Math.abs(e.clientX - d.x) > 4) d.moved = true; if (d.moved) { const len = d.b - d.a, na = Math.min(Math.max(0, d.a + shift), main.length - 1 - len); setWin([na, na + len]); } }
      setHov(idxAt(e.clientX));
    },
    onPointerUp: (e) => { const d = drag.current; drag.current = null; if (d && !d.moved) setPin(idxAt(e.clientX)); },
    onPointerLeave: () => { if (!drag.current) setHov(null); },
  };
  if (main.length < 2) return <p className="small muted">Not enough data to draw.</p>;
  const cur = hov ?? pin, curT = cur != null ? main[cur]?.t : null;
  const path = (s: MSeries) => inView(s).map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(val(s, p)).toFixed(1)}`).join('');
  const first = view[0]?.v ?? 0, lastV = view[view.length - 1]?.v ?? 0, chg = first ? (lastV / first - 1) * 100 : 0;
  const pinVals = pin != null ? series.map((s) => nearest(s, main[pin].t)?.v ?? null) : [];
  const ticks = [0, 0.5, 1].map((f) => lo - pad + f * (hi - lo + 2 * pad));
  return (
    <div className="mv">
      {ranges && <div className="mv-bar">{RANGES.filter(([, d]) => !d || !main.length || main[main.length - 1].t - main[0].t > d * 0.6 * 86400000).map(([k]) => <button key={k} className={`chip sm ${range === k && !win ? 'on' : ''}`} onClick={() => setRange(k)}>{k}</button>)}
        {!norm && <span className={`small num ${chg >= 0 ? 'up' : 'down'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(1)}% over view</span>}{win && <button className="chip sm" onClick={() => setWin(null)}>Reset</button>}</div>}
      <svg ref={svg} className="mv-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} tabIndex={0} role="img" aria-label={`${series.map((s) => s.label).join(', ')} chart. Arrow keys move along it.`}
        {...h} onDoubleClick={() => { setWin(null); setPin(null); }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const i = Math.min(b, Math.max(a, (cur ?? b) + (e.key === 'ArrowLeft' ? -1 : 1))); setHov(i); setPin(i); } }}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="mv-grid" /><text x={W - R + 4} y={Y(v) + 3} className="mv-tl">{norm ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}%` : fmt(series[0], v)}</text></g>)}
        {bars ? inView(series[0]).map((p) => { const v = val(series[0], p), w = Math.max(1, ((W - L - R) / Math.max(1, view.length)) * 0.7); return <rect key={p.t} x={X(p.t) - w / 2} width={w} y={Math.min(Y(v), Y(0))} height={Math.abs(Y(v) - Y(0))} className={v >= 0 ? 'mv-bu' : 'mv-bd'} />; })
          : series.map((s, i) => <path key={s.label} d={path(s)} fill="none" stroke={s.color ?? (i ? 'var(--warn)' : 'var(--accent)')} strokeWidth={i ? 1.4 : 1.8} vectorEffect="non-scaling-stroke" />)}
        {curT != null && <><line x1={X(curT)} x2={X(curT)} y1={T} y2={H - B} className="mv-x" />{series.map((s, i) => { const p = nearest(s, curT); return p ? <circle key={i} cx={X(p.t)} cy={Y(val(s, p))} r={3.5} fill={s.color ?? (i ? 'var(--warn)' : 'var(--accent)')} /> : null; })}</>}
        <text x={L} y={H - 4} className="mv-tl">{fd(t0, daily)}</text><text x={W - R} y={H - 4} textAnchor="end" className="mv-tl">{fd(t1, daily)}</text>
      </svg>
      <div className="mv-read small">
        {curT != null ? <><b>{fd(curT, daily)}</b>{series.map((s, i) => { const p = nearest(s, curT); return p ? <span key={i}><i className="mv-dot" style={{ background: s.color ?? (i ? 'var(--warn)' : 'var(--accent)') }} />{s.label} <b className="num">{fmt(s, val(s, p))}</b>{p.note ? ` · ${p.note}` : ''}</span> : null; })}</> : <span className="muted">Move along the chart to read values · drag to scroll back · click a point to pin it · double-click to reset</span>}
      </div>
      {pin != null && onPick && <div className="mv-pin">{onPick(main[pin].t, pinVals)}<button className="hw-btn" onClick={() => setPin(null)} aria-label="Unpin">×</button></div>}
      {extra}
    </div>
  );
}
