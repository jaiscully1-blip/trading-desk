// Money flow globe (G): sector and asset-class rotation. Nodes sit on an abstract sphere (positions carry no meaning);
// arcs carry capital from the biggest outflows to the biggest inflows. PROXY from ETF relative performance x volume.
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoDistance, geoGraticule10, geoInterpolate, geoOrthographic, geoPath } from 'd3-geo';
import type { FlowsState } from '../data/world';
import type { FlowRow, FlowWindow } from '../../shared/flows';
import { usePersisted } from '../lib/store';
import { pct } from '../lib/format';
import { Fresh, Seg } from './common';

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
/** Groups get their own latitude band; sectors spread around the equator. */
function layout(rows: FlowRow[]): Record<string, [number, number]> {
  const pos: Record<string, [number, number]> = {};
  const sectors = rows.filter((r) => r.group === 'sector');
  sectors.forEach((r, i) => (pos[r.sym] = [(i / sectors.length) * 360 - 180, (i % 2 ? 12 : -12)]));
  const others = rows.filter((r) => r.group !== 'sector');
  others.forEach((r, i) => (pos[r.sym] = [(i / Math.max(1, others.length)) * 360 - 150, i % 2 ? 48 : -48]));
  return pos;
}

export default function MoneyGlobe({ data, onSelect, onClose, theme }: { data: FlowsState | null; onSelect: (s: string) => void; onClose: () => void; theme: string }) {
  const [win, setWin] = usePersisted<FlowWindow>('flowWindow', '5D');
  const [hover, setHover] = useState<FlowRow | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const rot = useRef<[number, number]>([20, -15]);
  const drag = useRef<{ x: number; y: number; r: [number, number] } | null>(null);
  const view = data?.windows[win];
  const pos = useMemo(() => (view ? layout(view.rows) : {}), [view]);
  const maxFlow = Math.max(1e-9, ...(view?.rows ?? []).map((r) => Math.abs(r.flow)));
  const maxDv = Math.max(1, ...(view?.rows ?? []).map((r) => r.dollarVol));

  useEffect(() => {
    const c = cv.current;
    if (!c || !view) return;
    const g = c.getContext('2d')!;
    let raf = 0, t0 = performance.now();
    const col = { up: css('--up'), down: css('--down'), line: css('--line'), text: css('--text'), muted: css('--muted'), panel: css('--panel-2'), accent: css('--accent') };
    const draw = (now: number) => {
      const dt = now - t0; t0 = now;
      const w = c.clientWidth, h = c.clientHeight, dpr = window.devicePixelRatio || 1;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!drag.current && !matchMedia('(prefers-reduced-motion: reduce)').matches) rot.current = [rot.current[0] + dt * 0.006, rot.current[1]];
      const R = Math.min(w, h) * 0.42;
      const proj = geoOrthographic().scale(R).translate([w / 2, h / 2]).rotate(rot.current).clipAngle(90);
      const path = geoPath(proj, g);
      g.beginPath(); path({ type: 'Sphere' }); g.fillStyle = col.panel; g.fill(); g.strokeStyle = col.line; g.stroke();
      g.beginPath(); path(geoGraticule10()); g.strokeStyle = col.line; g.lineWidth = 0.6; g.stroke();
      const center: [number, number] = [-rot.current[0], -rot.current[1]];
      // arcs with moving particles
      for (const a of view.arcs) {
        const p0 = pos[a.from], p1 = pos[a.to];
        if (!p0 || !p1) continue;
        const ip = geoInterpolate(p0, p1);
        g.beginPath(); path({ type: 'LineString', coordinates: [p0, p1] });
        g.strokeStyle = col.accent; g.globalAlpha = 0.25 + 0.5 * a.weight; g.lineWidth = 1 + 3 * a.weight; g.stroke(); g.globalAlpha = 1;
        for (let k = 0; k < 3; k++) {
          const t = ((now / 2500 + k / 3) % 1);
          const pt = ip(t);
          if (geoDistance(pt, center) > Math.PI / 2) continue;
          const xy = proj(pt); if (!xy) continue;
          g.beginPath(); g.arc(xy[0], xy[1], 2 + 2 * a.weight, 0, Math.PI * 2); g.fillStyle = col.accent; g.fill();
        }
      }
      // nodes
      for (const r of view.rows) {
        const p = pos[r.sym];
        if (!p || geoDistance(p, center) > Math.PI / 2) continue;
        const xy = proj(p); if (!xy) continue;
        const rad = 5 + 16 * Math.sqrt(r.dollarVol / maxDv);
        g.beginPath(); g.arc(xy[0], xy[1], rad, 0, Math.PI * 2);
        g.fillStyle = r.flow >= 0 ? col.up : col.down; g.globalAlpha = 0.25 + 0.6 * Math.min(1, Math.abs(r.flow) / maxFlow); g.fill(); g.globalAlpha = 1;
        g.lineWidth = hover?.sym === r.sym ? 2.5 : 1; g.strokeStyle = r.flow >= 0 ? col.up : col.down; g.stroke();
        g.fillStyle = col.text; g.font = '600 11px "IBM Plex Mono", monospace'; g.textAlign = 'center';
        g.fillText(r.sym, xy[0], xy[1] - rad - 4);
        g.fillStyle = col.muted; g.font = '10px "IBM Plex Sans", sans-serif'; g.fillText(r.label, xy[0], xy[1] + rad + 11);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [view, pos, hover, maxDv, maxFlow, theme]);

  // drag to rotate, click a node to chart it
  const hit = (e: React.MouseEvent) => {
    const c = cv.current!, rect = c.getBoundingClientRect();
    const w = c.clientWidth, h = c.clientHeight, R = Math.min(w, h) * 0.42;
    const proj = geoOrthographic().scale(R).translate([w / 2, h / 2]).rotate(rot.current).clipAngle(90);
    const center: [number, number] = [-rot.current[0], -rot.current[1]];
    let best: FlowRow | null = null, bd = 400;
    for (const r of view?.rows ?? []) {
      const p = pos[r.sym]; if (!p || geoDistance(p, center) > Math.PI / 2) continue;
      const xy = proj(p); if (!xy) continue;
      const d = (xy[0] - (e.clientX - rect.left)) ** 2 + (xy[1] - (e.clientY - rect.top)) ** 2;
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  const ins = view?.rows.filter((r) => r.flow > 0) ?? [];
  const outs = [...(view?.rows ?? [])].filter((r) => r.flow < 0).sort((a, b) => a.flow - b.flow);
  const Row = ({ r }: { r: FlowRow }) => (
    <li onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}>
      <button className="wl-sym" onClick={() => r.group !== 'crypto' && onSelect(r.sym)}>{r.sym}</button>
      <span className="small muted">{r.label}</span>
      <span className={`num small ${r.rel >= 0 ? 'up' : 'down'}`}>{pct(r.rel, 1)}</span>
      <span className="num small muted" title="Dollar volume vs 20-day average">{r.volRatio.toFixed(2)}x</span>
    </li>
  );

  return (
    <div className="overlay" role="dialog" aria-label="Money flow globe">
      <div className="overlay-in wm">
        <div className="phead">
          <div className="phead-title">Money flow globe <span className="tag">PROXY</span></div>
          <div className="phead-ctl">
            <Seg value={win} onChange={setWin} options={[{ id: '1D', label: '1D' }, { id: '5D', label: '5D' }, { id: '20D', label: '20D' }]} />
            {data && <Fresh kind={data.freshness} at={data.asOf} src={`Daily bars: ${data.sources.join(', ')}`} />}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="wm-body">
          <canvas
            ref={cv}
            className="globe"
            onMouseDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, r: [...rot.current] as [number, number] }; }}
            onMouseMove={(e) => {
              if (drag.current) { const d = drag.current; rot.current = [d.r[0] + (e.clientX - d.x) * 0.4, Math.max(-60, Math.min(60, d.r[1] - (e.clientY - d.y) * 0.4))]; }
              else setHover(hit(e));
            }}
            onMouseUp={(e) => { const d = drag.current; drag.current = null; if (d && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 4) { const r = hit(e); if (r && r.group !== 'crypto') onSelect(r.sym); } }}
            onMouseLeave={() => { drag.current = null; setHover(null); }}
          />
          <aside className="wm-side">
            {hover && <div className="banner">{hover.sym} · {hover.label}: {pct(hover.ret, 2)} ({pct(hover.rel, 2)} vs SPY), volume {hover.volRatio.toFixed(2)}x average</div>}
            <h4>Money moving in ({win})</h4>
            <ul className="flows">{ins.map((r) => <Row key={r.sym} r={r} />)}</ul>
            <h4>Money moving out ({win})</h4>
            <ul className="flows">{outs.map((r) => <Row key={r.sym} r={r} />)}</ul>
            {data?.pending.length ? <p className="small warn-txt">Still loading {data.pending.join(', ')} (free-tier credits).</p> : null}
            <p className="note">Proxy, not fund-flow data: flow = return vs SPY × dollar volume vs its 20-day average (floored at 0.5×). Arcs run from the 3 biggest outflows to the 3 biggest inflows. Crypto uses its own return (it trades 7 days a week). Node size = dollar volume; positions on the globe have no meaning. Drag to rotate, click to chart.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
