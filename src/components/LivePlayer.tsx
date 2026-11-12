// The live video on the Messages page. One player that can sit in the page (small / medium / large), take the right half
// of the screen, float anywhere you drag it (resize from its corner), or shrink to a mini bar while the audio keeps going.
// The iframe lives in one place in the document the whole time, so switching layouts never restarts the stream.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { usePersisted } from '../lib/store';

export type VMode = 'off' | 'mini' | 's' | 'm' | 'l' | 'split' | 'float';
interface Box { left: number; top: number; width: number; height: number }
const HEAD = 26;

export function LivePlayer({ vid, title, mode, setMode, slot }: { vid: string; title: string; mode: Exclude<VMode, 'off'>; setMode: (m: VMode) => void; slot: RefObject<HTMLDivElement | null> }) {
  const [fl, setFl] = usePersisted<{ x: number; y: number; w: number }>('liveFloat', { x: -1, y: -1, w: 420 });
  const [last, setLast] = usePersisted<VMode>('liveLastMode', 'm');
  const [slotBox, setSlotBox] = useState<Box | null>(null);
  const [moving, setMoving] = useState(false);
  const drag = useRef<{ kind: 'move' | 'size'; x0: number; y0: number; f: typeof fl } | null>(null);
  const docked = mode === 's' || mode === 'm' || mode === 'l' || mode === 'split';

  useEffect(() => { if (mode !== 'mini') setLast(mode); }, [mode, setLast]);

  // docked: sit exactly over the placeholder in the page (re-measured on resize, scroll and a light poll for layout shifts)
  useEffect(() => {
    if (!docked) return;
    const measure = () => {
      const r = slot.current?.getBoundingClientRect();
      setSlotBox((b) => (!r || !r.width ? null : b && Math.abs(b.left - r.left) < 0.5 && Math.abs(b.top - r.top) < 0.5 && Math.abs(b.width - r.width) < 0.5 && Math.abs(b.height - r.height) < 0.5 ? b : { left: r.left, top: r.top, width: r.width, height: r.height }));
    };
    measure();
    const t = setInterval(measure, 200);
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true);
    return () => { clearInterval(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [docked, mode, slot]);

  // floating: keep it on screen
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth, vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const fw = Math.max(240, Math.min(fl.w, vw - 16)), fh = Math.round(fw * 9 / 16) + HEAD;
  const fx = fl.x < 0 ? vw - fw - 24 : Math.max(0, Math.min(fl.x, vw - fw)), fy = fl.y < 0 ? vh - fh - 56 : Math.max(0, Math.min(fl.y, vh - fh));

  const down = (e: React.PointerEvent, kind: 'move' | 'size') => {
    if (e.button !== 0 || (kind === 'move' && (e.target as HTMLElement).closest('button'))) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* window listeners end it anyway */ }
    drag.current = { kind, x0: e.clientX, y0: e.clientY, f: { x: fx, y: fy, w: fw } };
    setMoving(true);
  };
  useEffect(() => {
    if (!moving) return;
    const mv = (e: PointerEvent) => {
      const d = drag.current; if (!d) return;
      if (e.buttons === 0) { drag.current = null; setMoving(false); return; }
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      setFl(d.kind === 'move' ? { ...d.f, x: d.f.x + dx, y: d.f.y + dy } : { ...d.f, w: Math.max(240, Math.min(window.innerWidth - d.f.x - 8, d.f.w + Math.max(dx, dy * 16 / 9))) });
    };
    const up = () => { drag.current = null; setMoving(false); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up); window.addEventListener('blur', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up); };
  }, [moving, setFl]);

  let style: React.CSSProperties;
  if (docked) style = slotBox ? { left: slotBox.left, top: slotBox.top, width: slotBox.width, height: slotBox.height } : { left: -9999, top: 0, width: 320, height: 180, visibility: 'hidden' };
  else if (mode === 'float') style = { left: fx, top: fy, width: fw, height: fh };
  else style = { right: 16, bottom: 48, width: 280, height: HEAD };

  const restore = last === 'mini' || last === 'off' ? 'm' : last;
  return createPortal(
    <div className={`vp vp-${mode} ${moving ? 'vp-moving' : ''}`} style={style} role="region" aria-label={`Live video: ${title}`}>
      {!docked && (
        <div className="vp-head" onPointerDown={mode === 'float' ? (e) => down(e, 'move') : undefined} title={mode === 'float' ? 'Drag to move' : undefined}>
          <span className="vp-dot" aria-hidden="true">●</span><span className="vp-t">{title}</span>
          {mode === 'mini'
            ? <button onClick={() => setMode(restore)} title="Show the video again" aria-label="Restore video">▢</button>
            : <><button onClick={() => setMode('mini')} title="Minimize (keeps playing)" aria-label="Minimize video">–</button><button onClick={() => setMode('split')} title="Right half of the screen" aria-label="Dock to half screen">◧</button><button onClick={() => setMode('m')} title="Back into the page" aria-label="Dock in the page">▭</button></>}
          <button onClick={() => setMode('off')} title="Close the video" aria-label="Close video">×</button>
        </div>
      )}
      <iframe src={`https://www.youtube-nocookie.com/embed/${vid}?autoplay=0`} title="Live stream" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      {mode === 'float' && <div className="vp-grip" onPointerDown={(e) => down(e, 'size')} title="Drag to resize" aria-hidden="true" />}
    </div>,
    document.body,
  );
}
