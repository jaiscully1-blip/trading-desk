// Draws a teaching diagram from shared/diagrams: example candles, optional volume or indicator pane, and labelled
// levels, zones, lines and markers. Clearly marked as an illustration, not market data.
import { DIAGRAMS, DIAGRAM_FOR } from '../../shared/diagrams';

const W = 480, H = 190, VP = 46, PP = 60;

export function Diagram({ id, small = false }: { id: string; small?: boolean }) {
  const d = DIAGRAMS[DIAGRAM_FOR[id] ?? id];
  if (!d) return null;
  const n = d.candles.length, cw = (W - 120) / n, x = (i: number) => 10 + i * cw + cw / 2;
  const ys = d.candles.flatMap((c) => [c.h, c.l]).concat(d.overlays.flatMap((o) => (o.t === 'h' ? [o.y] : o.t === 'zone' ? [o.y0, o.y1] : o.t === 'mark' ? [o.y] : o.pts.filter((p): p is number => p != null))));
  const hi = Math.max(...ys) + 0.3, lo = Math.min(...ys) - 0.3, y = (v: number) => 12 + ((hi - v) / (hi - lo)) * (H - 24);
  const vmax = Math.max(...d.candles.map((c) => c.v ?? 0)) || 1;
  const total = H + (d.volume ? VP : 0) + (d.pane ? PP : 0);
  return (
    <figure className={`dg ${small ? 'sm' : ''}`}>
      <svg viewBox={`0 0 ${W} ${total}`} role="img" aria-label={d.caption}>
        {d.overlays.filter((o) => o.t === 'zone').map((o, k) => o.t === 'zone' && <g key={`z${k}`} className={`dg-zone ${o.tone ?? 'mid'}`}><rect x={x(o.x0) - cw / 2} width={(o.x1 - o.x0 + 1) * cw} y={y(o.y1)} height={y(o.y0) - y(o.y1)} /><text x={x(o.x1) + cw / 2 - 4} y={y(o.y0) - 4} textAnchor="end">{o.label}</text></g>)}
        {d.overlays.filter((o) => o.t === 'h').map((o, k) => o.t === 'h' && <g key={`h${k}`} className={`dg-h ${o.tone ?? 'mid'}`}><line x1={o.from != null ? x(o.from) - cw / 2 : 4} x2={W - 116} y1={y(o.y)} y2={y(o.y)} /><text x={W - 112} y={y(o.y) + 4}>{o.label}</text></g>)}
        {d.candles.map((c, i) => { const up = c.c >= c.o; return <g key={i} className={up ? 'dg-up' : 'dg-dn'}><line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} /><rect x={x(i) - cw * 0.32} width={cw * 0.64} y={y(Math.max(c.o, c.c))} height={Math.max(1.5, Math.abs(y(c.o) - y(c.c)))} /></g>; })}
        {d.overlays.filter((o) => o.t === 'line').map((o, k) => { if (o.t !== 'line') return null; let p = ''; o.pts.forEach((v, i) => { if (v != null) p += `${p ? 'L' : 'M'}${x(i)},${y(v)}`; }); const last = o.pts.length - 1; return <g key={`l${k}`} className={`dg-line ${o.tone ?? 'mid'}`}><path d={p} /><text x={x(last) + 8} y={y(o.pts[last] ?? 0) + 4}>{o.label}</text></g>; })}
        {d.overlays.filter((o) => o.t === 'mark').map((o, k) => { if (o.t !== 'mark') return null; const down = o.dir === 'down', yy = y(o.y), ty = down ? yy - 16 : yy + 22; return <g key={`m${k}`} className={`dg-mark ${o.tone ?? 'mid'}`}><path d={down ? `M${x(o.x)},${yy - 3} l-5,-8 h10 z` : `M${x(o.x)},${yy + 3} l-5,8 h10 z`} /><text x={Math.min(x(o.x), W - 230)} y={ty} textAnchor="start">{o.label}</text></g>; })}
        {d.volume && <g className="dg-vol">{d.candles.map((c, i) => { const h = ((c.v ?? 0) / vmax) * (VP - 10); return <rect key={i} x={x(i) - cw * 0.32} width={cw * 0.64} y={H + VP - 4 - h} height={h} className={(c.v ?? 0) >= vmax * 0.7 ? 'hot' : ''} />; })}<text x={W - 112} y={H + VP - 8}>Volume</text></g>}
        {d.pane && (() => { const top = H + (d.volume ? VP : 0), py = (v: number) => top + 6 + ((100 - v) / 100) * (PP - 12); let p = ''; d.pane.vals.forEach((v, i) => { if (v != null) p += `${p ? 'L' : 'M'}${x(i)},${py(v)}`; }); return <g className="dg-pane">{d.pane.lines.map((l) => <line key={l} x1={4} x2={W - 116} y1={py(l)} y2={py(l)} />)}<path d={p} /><text x={W - 112} y={top + 20}>{d.pane.label}</text></g>; })()}
      </svg>
      <figcaption className="small muted">{d.caption} <span className="dg-note">Illustration, not market data.</span></figcaption>
    </figure>
  );
}
