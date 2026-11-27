// All floating live-TV windows (src/lib/tv.ts), drawn once at the app level so they keep playing on every page. Each one:
// drag by its bar, resize from the corner, switch channel, minimize to a bar (sound keeps going), close. Sound is per window
// (YouTube's own mute button). Market data and news video only; nothing here can trade.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Stream } from '../../shared/livestreams';
import { closeTv, raiseTv, updateTv, useTvWins, type TvWin } from '../lib/tv';

const HEAD = 28;
const withParams = (src: string) => `${src}${src.includes('?') ? '&' : '?'}autoplay=1`;

/** Channel dropdown grouped like the Messages picker; `value` is the stream src. */
export function ChannelSelect({ streams, value, onPick, label = 'Live channel' }: { streams: Stream[]; value: string; onPick: (s: Stream) => void; label?: string }) {
  const known = streams.some((s) => s.src === value);
  return (
    <select className="tv-sel" value={known ? value : ''} onChange={(e) => { const s = streams.find((x) => x.src === e.target.value); if (s) onPick(s); }} aria-label={label} onPointerDown={(e) => e.stopPropagation()}>
      {!known && <option value="">Channel…</option>}
      {(['Markets', 'World news', 'Government'] as const).map((g) => { const xs = streams.filter((x) => x.group === g); return xs.length ? <optgroup key={g} label={g}>{xs.map((x) => <option key={x.key} value={x.src}>{x.name}{x.confirmed ? ' · live now' : ''}</option>)}</optgroup> : null; })}
    </select>
  );
}

function TvWindow({ w, streams }: { w: TvWin; streams: Stream[] }) {
  // live position while dragging, saved when the drag ends
  const [box, setBox] = useState({ x: w.x, y: w.y, w: w.w });
  useEffect(() => { setBox({ x: w.x, y: w.y, w: w.w }); }, [w.x, w.y, w.w]);
  const [moving, setMoving] = useState(false);
  const drag = useRef<{ kind: 'move' | 'size'; x0: number; y0: number; b: typeof box } | null>(null);
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = Math.max(240, Math.min(box.w, vw - 16)), height = w.min ? HEAD : Math.round(width * 9 / 16) + HEAD;
  const left = Math.max(0, Math.min(box.x, vw - width)), top = Math.max(0, Math.min(box.y, vh - height));

  const down = (e: React.PointerEvent, kind: 'move' | 'size') => {
    raiseTv(w.id);
    if (e.button !== 0 || (kind === 'move' && (e.target as HTMLElement).closest('button, select'))) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* window listeners end it anyway */ }
    drag.current = { kind, x0: e.clientX, y0: e.clientY, b: { x: left, y: top, w: width } };
    setMoving(true);
  };
  useEffect(() => {
    if (!moving) return;
    let last = box;
    const mv = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      last = d.kind === 'move' ? { ...d.b, x: d.b.x + dx, y: d.b.y + dy } : { ...d.b, w: Math.max(240, Math.min(window.innerWidth - d.b.x - 8, d.b.w + Math.max(dx, dy * 16 / 9))) };
      setBox(last);
    };
    const up = () => { drag.current = null; setMoving(false); updateTv(w.id, last); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up); };
  }, [moving]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`vp vp-float tvw ${w.min ? 'tvw-min' : ''} ${moving ? 'vp-moving' : ''}`} style={{ left, top, width, height, zIndex: 46 + (w.z ?? 0) }} role="region" aria-label={`Live TV: ${w.name}`} onPointerDown={() => raiseTv(w.id)}>
      <div className="vp-head" onPointerDown={(e) => down(e, 'move')} title="Drag to move">
        <span className="vp-dot" aria-hidden="true">●</span>
        <ChannelSelect streams={streams} value={w.src} onPick={(s) => updateTv(w.id, { name: s.name, src: s.src })} />
        <span className="tv-sp" />
        <button onClick={() => updateTv(w.id, { min: !w.min })} title={w.min ? 'Show the video' : 'Minimize to a bar (keeps playing)'} aria-label={w.min ? 'Restore video' : 'Minimize video'}>{w.min ? '▢' : '–'}</button>
        <button onClick={() => closeTv(w.id)} title="Close this window" aria-label={`Close ${w.name}`}>×</button>
      </div>
      <iframe src={withParams(w.src)} title={`Live TV: ${w.name}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      {!w.min && <div className="vp-grip" onPointerDown={(e) => down(e, 'size')} title="Drag to resize" aria-hidden="true" />}
    </div>
  );
}

export function TvWindows({ streams }: { streams: Stream[] }) {
  const wins = useTvWins();
  if (!wins.length) return null;
  return createPortal(<>{wins.map((w) => <TvWindow key={w.id} w={w} streams={streams} />)}</>, document.body);
}
