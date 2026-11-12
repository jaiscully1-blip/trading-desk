// Drawing tools for the Patterns chart: an SVG layer over the chart plus a small toolbar. Drawings are saved per ticker and
// timeframe in this browser, follow zoom and scroll, and are included in "Save image".
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as RPE, type ReactNode } from 'react';
import type { IChartApi, ISeriesApi, Logical } from 'lightweight-charts';
import { NEEDS, geom, uid, type Ink, type Pt, type Prim, type Shape, type Tool } from '../../shared/drawings';
import { usePersisted } from '../lib/store';
import { px as fmtPx } from '../lib/format';
import type { Bar } from '../types';

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const INKS: { id: Ink; v: string; label: string }[] = [{ id: 'accent', v: '--accent', label: 'Yellow' }, { id: 'up', v: '--up', label: 'Green' }, { id: 'down', v: '--down', label: 'Red' }, { id: 'text', v: '--text', label: 'White' }, { id: 'demo', v: '--demo', label: 'Violet' }];
const inkColor = (i: Ink) => cssVar(INKS.find((x) => x.id === i)!.v) || '#ffd24a';
const TOOLS: { id: Tool; icon: string; label: string; hint: string }[] = [
  { id: 'cursor', icon: '↖', label: 'Select', hint: 'Select / move the chart. Click a drawing to select it, Delete removes it.' },
  { id: 'trend', icon: '╱', label: 'Trendline', hint: 'Trendline: drag, or click two points' },
  { id: 'ray', icon: '⟶', label: 'Ray', hint: 'Horizontal ray: click a price' },
  { id: 'fib', icon: '𝔽', label: 'Fib', hint: 'Fibonacci retracement: drag from the start to the end of a move' },
  { id: 'rect', icon: '▭', label: 'Box', hint: 'Rectangle: drag, or click two corners' },
  { id: 'tri', icon: '△', label: 'Triangle', hint: 'Triangle: click three points' },
  { id: 'text', icon: 'T', label: 'Note', hint: 'Text note: click where it goes, type, press Enter' },
  { id: 'free', icon: '✎', label: 'Draw', hint: 'Free draw: hold and drag' },
];

export type Painter = (g: CanvasRenderingContext2D, dpr: number, yOff: number) => void;

export default function DrawLayer({ chart, series, bars, storeKey, painter, children, compact = false, toolbar = true }: {
  chart: MutableRefObject<IChartApi | null>; series: MutableRefObject<ISeriesApi<'Candlestick'> | null>; bars: Bar[]; storeKey: string;
  painter: MutableRefObject<Painter | null>; children: ReactNode;
  /** icon-only toolbar for small charts (multi-timeframe) */ compact?: boolean;
  /** hide the toolbar; drawings still show */ toolbar?: boolean;
}) {
  const [all, setAll] = usePersisted<Record<string, Shape[]>>('patDrawings', {});
  const shapes = all[storeKey] ?? [];
  const setShapes = (f: (s: Shape[]) => Shape[]) => setAll((a) => ({ ...a, [storeKey]: f(a[storeKey] ?? []) }));
  const [tool, setTool] = useState<Tool>('cursor');
  const [ink, setInk] = usePersisted<Ink>('patInk', 'accent');
  const [draft, setDraft] = useState<Shape | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [textAt, setTextAt] = useState<{ pt: Pt; x: number; y: number } | null>(null);
  const [, tick] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const st = useRef<{ placed: number; x0: number; y0: number; dragged: boolean } | null>(null);
  const times = bars.map((b) => b.time);

  // redraw whenever the chart's scroll, zoom or price scale changes
  useEffect(() => {
    let raf = 0, last = '';
    const loop = () => {
      const c = chart.current, s = series.current;
      if (c && s) {
        const r = c.timeScale().getVisibleLogicalRange();
        const sig = `${r?.from}|${r?.to}|${s.priceToCoordinate(1)}|${s.priceToCoordinate(1000)}|${c.timeScale().width()}|${svg.current?.clientHeight}`;
        if (sig !== last) { last = sig; tick((x) => x + 1); }
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [chart, series]);
  useEffect(() => { setDraft(null); setSel(null); setTextAt(null); st.current = null; }, [storeKey]);

  const idxOf = (t: number) => { let lo = 0, hi = times.length - 1, ans = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  const toPx = (p: Pt) => {
    const c = chart.current, s = series.current;
    if (!c || !s || !times.length) return null;
    const x = c.timeScale().logicalToCoordinate((idxOf(p.t) + p.d) as Logical), y = s.priceToCoordinate(p.p);
    return x == null || y == null ? null : { x, y };
  };
  const fromPx = (x: number, y: number): Pt | null => {
    const c = chart.current, s = series.current;
    if (!c || !s || !times.length) return null;
    const L = c.timeScale().coordinateToLogical(x), price = s.coordinateToPrice(y);
    if (L == null || price == null) return null;
    const i = Math.max(0, Math.min(times.length - 1, Math.round(L)));
    return { t: times[i], d: L - i, p: price };
  };
  const plot = () => { const c = chart.current; const w = c?.timeScale().width() ?? 0; const h = Math.max(0, (svg.current?.clientHeight ?? 0) - (c?.timeScale().height() ?? 0)); return { w, h }; };
  const local = (e: RPE) => { const r = svg.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const commit = (s: Shape) => { setShapes((a) => [...a, s]); setDraft(null); st.current = null; setSel(s.id); if (s.kind === 'free') return; setTool('cursor'); };
  const down = (e: RPE) => {
    if (tool === 'cursor') return;
    const { x, y } = local(e), { w, h } = plot();
    if (x < 0 || x > w || y < 0 || y > h) return;
    const p = fromPx(x, y);
    if (!p) return;
    e.preventDefault();
    const kind = tool;
    if (kind === 'text') { setTextAt({ pt: p, x, y }); return; }
    if (kind === 'ray') { commit({ id: uid(), kind, pts: [p], ink }); return; }
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* synthetic pointers can't be captured */ }
    if (!draft) { setDraft({ id: uid(), kind, pts: kind === 'free' ? [p] : [p, p], ink }); st.current = { placed: 1, x0: x, y0: y, dragged: false }; return; }
    // click mode: this click fixes the point being previewed
    const pts = [...draft.pts.slice(0, -1), p];
    const placed = (st.current?.placed ?? 1) + 1;
    if (placed >= NEEDS[kind]) commit({ ...draft, pts }); else { setDraft({ ...draft, pts: [...pts, p] }); st.current = { placed, x0: x, y0: y, dragged: false }; }
  };
  const move = (e: RPE) => {
    if (!draft || !st.current) return;
    const { x, y } = local(e), p = fromPx(Math.max(0, Math.min(plot().w, x)), Math.max(0, Math.min(plot().h, y)));
    if (!p) return;
    if (Math.hypot(x - st.current.x0, y - st.current.y0) > 5) st.current.dragged = true;
    if (draft.kind === 'free') { setDraft({ ...draft, pts: [...draft.pts, p] }); return; }
    setDraft({ ...draft, pts: [...draft.pts.slice(0, -1), p] });
  };
  const up = () => {
    if (!draft || !st.current) return;
    if (draft.kind === 'free') { if (draft.pts.length >= 3) commit(draft); else { setDraft(null); st.current = null; } return; }
    if (st.current.dragged && NEEDS[draft.kind] === 2) commit(draft); // press-drag-release for two-point tools
    st.current.dragged = false;
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') { setDraft(null); st.current = null; setTextAt(null); setTool('cursor'); setSel(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); setShapes((a) => a.filter((s) => s.id !== sel)); setSel(null); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // everything below the toolbar paints from the same geometry; the PNG export uses the painter
  const { w: W } = plot();
  const prims = (s: Shape) => geom(s, toPx, W, fmtPx);
  painter.current = (g, dpr, yOff) => {
    for (const s of shapes) paint(g, prims(s), inkColor(s.ink), dpr, yOff);
  };

  const textRef = useRef(textAt); textRef.current = textAt;
  const addText = (v: string) => { const t = v.trim(); const at = textRef.current; textRef.current = null; if (t && at) { const s: Shape = { id: uid(), kind: 'text', pts: [at.pt], ink, text: t.slice(0, 80) }; setShapes((a) => [...a, s]); setSel(s.id); } setTextAt(null); setTool('cursor'); };
  const shown = [...shapes, ...(draft ? [draft] : [])];
  return (
    <>
      {toolbar && <div className={`pat-tools ${compact ? 'compact' : ''}`} role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => <button key={t.id} className={`pt-b ${tool === t.id ? 'on' : ''}`} onClick={() => { setTool(t.id); setDraft(null); st.current = null; setTextAt(null); }} title={t.hint} aria-label={t.label} aria-pressed={tool === t.id}><span aria-hidden="true">{t.icon}</span>{!compact && ` ${t.label}`}</button>)}
        <span className="pt-sep" />
        {INKS.map((c) => <button key={c.id} className={`pt-ink ${ink === c.id ? 'on' : ''}`} style={{ background: `var(${c.v})` }} onClick={() => { setInk(c.id); if (sel) setShapes((a) => a.map((s) => (s.id === sel ? { ...s, ink: c.id } : s))); }} title={`${c.label}${sel ? ' (also recolors the selected drawing)' : ''}`} aria-label={`${c.label} ink`} />)}
        <span className="pt-sep" />
        <button className="pt-b" disabled={!shapes.length} onClick={() => { setShapes((a) => a.slice(0, -1)); setSel(null); }} title="Undo the last drawing" aria-label="Undo">{compact ? '↶' : '↶ Undo'}</button>
        <button className="pt-b" disabled={!sel} onClick={() => { setShapes((a) => a.filter((s) => s.id !== sel)); setSel(null); }} title="Delete the selected drawing (Delete key)" aria-label="Delete">{compact ? '⌫' : 'Delete'}</button>
        <button className="pt-b" disabled={!shapes.length} onClick={() => { if (confirm(`Clear all ${shapes.length} drawings on this chart?`)) { setShapes(() => []); setSel(null); } }} title="Remove every drawing on this ticker and timeframe" aria-label="Clear">{compact ? '✕' : 'Clear'}</button>
      </div>}
      <div className={`pat-stage ${compact ? 'compact' : ''}`}>
        {children}
        <svg ref={svg} className={`pat-draw ${tool !== 'cursor' ? 'active' : ''}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <defs><clipPath id="pat-clip"><rect x="0" y="0" width={Math.max(0, W)} height={plot().h} /></clipPath></defs>
          <g clipPath="url(#pat-clip)">
            {shown.map((s) => {
              const col = inkColor(s.ink), on = s.id === sel, ps = prims(s);
              return (
                <g key={s.id} className={s.id === draft?.id ? 'pd-draft' : ''}>
                  {ps.map((p, i) => <PrimEl key={i} p={p} col={col} on={on} />)}
                  {tool === 'cursor' && s.id !== draft?.id && ps.map((p, i) => <PrimEl key={`h${i}`} p={p} col="transparent" hit on={false} onPick={() => setSel(s.id)} />)}
                  {on && s.pts.map((q, i) => { const c = toPx(q); return c ? <circle key={i} cx={c.x} cy={c.y} r={4} className="pd-handle" /> : null; })}
                </g>
              );
            })}
          </g>
        </svg>
        {textAt && <input className="pat-text-in" autoFocus style={{ left: textAt.x, top: textAt.y }} maxLength={80} placeholder="Note, then Enter" aria-label="Note text"
          onKeyDown={(e) => { if (e.key === 'Enter') addText((e.target as HTMLInputElement).value); if (e.key === 'Escape') { setTextAt(null); setTool('cursor'); } }} onBlur={(e) => addText(e.target.value)} />}
      </div>
    </>
  );
}

function PrimEl({ p, col, on, hit, onPick }: { p: Prim; col: string; on: boolean; hit?: boolean; onPick?: () => void }) {
  const common = hit ? { stroke: 'transparent', strokeWidth: 12, fill: 'none', pointerEvents: 'stroke' as const, onPointerDown: (e: RPE) => { e.stopPropagation(); onPick?.(); }, style: { cursor: 'pointer' } } : { stroke: col, strokeWidth: on ? 2.5 : 1.5, fill: 'none', pointerEvents: 'none' as const };
  switch (p.k) {
    case 'line': return <line x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} {...common} strokeDasharray={p.dash ? '5 4' : undefined} opacity={p.faint && !hit ? 0.55 : 1} />;
    case 'rect': return <rect x={p.x} y={p.y} width={p.w} height={p.h} {...common} fill={hit ? 'transparent' : col} fillOpacity={hit ? 1 : 0.1} pointerEvents={hit ? 'all' : 'none'} />;
    case 'poly': return <polyline points={p.pts.map((q) => q.join(',')).join(' ') + (p.closed ? ` ${p.pts[0].join(',')}` : '')} {...common} fill={p.fill && !hit ? col : hit && p.fill ? 'transparent' : 'none'} fillOpacity={hit ? 1 : 0.1} strokeLinejoin="round" strokeLinecap="round" pointerEvents={hit ? (p.fill ? 'all' : 'stroke') : 'none'} />;
    case 'text': return hit ? <text x={p.x} y={p.y} fontSize={12} fill="transparent" stroke="transparent" strokeWidth={8} pointerEvents="all" textAnchor={p.right ? 'end' : 'start'} onPointerDown={(e) => { e.stopPropagation(); onPick?.(); }} style={{ cursor: 'pointer' }}>{p.text}</text> : <text x={p.x} y={p.y} fontSize={12} fill={col} textAnchor={p.right ? 'end' : 'start'} className="pd-text" fontWeight={on ? 700 : 500}>{p.text}</text>;
  }
}

function paint(g: CanvasRenderingContext2D, ps: Prim[], col: string, dpr: number, yOff: number) {
  g.save(); g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.5 * dpr; g.lineJoin = 'round'; g.lineCap = 'round';
  const X = (v: number) => v * dpr, Y = (v: number) => v * dpr + yOff;
  for (const p of ps) {
    g.globalAlpha = 1; g.setLineDash([]);
    if (p.k === 'line') { g.globalAlpha = p.faint ? 0.55 : 1; if (p.dash) g.setLineDash([5 * dpr, 4 * dpr]); g.beginPath(); g.moveTo(X(p.x1), Y(p.y1)); g.lineTo(X(p.x2), Y(p.y2)); g.stroke(); }
    else if (p.k === 'rect') { g.globalAlpha = 0.1; g.fillRect(X(p.x), Y(p.y), p.w * dpr, p.h * dpr); g.globalAlpha = 1; g.strokeRect(X(p.x), Y(p.y), p.w * dpr, p.h * dpr); }
    else if (p.k === 'poly') { g.beginPath(); p.pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); if (p.closed) g.closePath(); if (p.fill) { g.globalAlpha = 0.1; g.fill(); g.globalAlpha = 1; } g.stroke(); }
    else { g.font = `500 ${12 * dpr}px "IBM Plex Mono", monospace`; g.textAlign = p.right ? 'right' : 'left'; g.fillText(p.text, X(p.x), Y(p.y)); }
  }
  g.restore();
}
