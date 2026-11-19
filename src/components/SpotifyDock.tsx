// One Spotify player for the whole app, so music keeps playing when you switch workspace or page.
// The Spotify widget only reserves a spot (a "slot"); this player floats over that spot while it is on screen and
// shrinks to a mini player in the corner when it isn't. The iframe is never moved in the page (moving an iframe
// reloads it and stops the music), only repositioned with CSS.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { load, save } from '../lib/store';

type St = { src: string | null; slot: HTMLElement | null; label: string };
let st: St = { src: null, slot: null, label: '' };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const store = { get: () => st, sub: (f: () => void) => { subs.add(f); return () => subs.delete(f); } };

export const playSpotify = (src: string, label: string) => { st = { ...st, src, label }; emit(); };
export const useSpotifyNow = () => useSyncExternalStore(store.sub, store.get).src;

/** Called by the Spotify widget: plays `src` and reserves `el` as where the player should sit. */
export function useSpotifySlot(src: string | null, label: string) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (src && src !== st.src) { st = { ...st, src, label }; emit(); } }, [src, label]);
  useEffect(() => {
    const el = ref.current; st = { ...st, slot: el }; emit();
    return () => { if (st.slot === el) { st = { ...st, slot: null }; emit(); } };
  }, []);
  return ref;
}

/** Nearest scrolling ancestor, so the player can be clipped to it when the widget is partly scrolled away. */
function clipBox(el: HTMLElement): DOMRect {
  let p = el.parentElement;
  while (p && p !== document.body) { const o = getComputedStyle(p).overflowY; if (o === 'auto' || o === 'scroll' || o === 'hidden') return p.getBoundingClientRect(); p = p.parentElement; }
  return new DOMRect(0, 0, innerWidth, innerHeight);
}

export function SpotifyDock() {
  const s = useSyncExternalStore(store.sub, store.get);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number; clip: string } | null>(null);
  useEffect(() => {
    if (!s.slot) { setBox(null); return; }
    let last = '', queued = 0;
    const measure = () => {
      queued = 0;
      const el = s.slot!;
      if (!el.isConnected) { setBox(null); return; }
      const r = el.getBoundingClientRect(), c = clipBox(el);
      const vis = r.width > 20 && r.height > 20 && r.bottom > c.top && r.top < c.bottom && r.right > c.left && r.left < c.right;
      const clip = `inset(${Math.max(0, c.top - r.top)}px ${Math.max(0, r.right - c.right)}px ${Math.max(0, r.bottom - c.bottom)}px ${Math.max(0, c.left - r.left)}px round 10px)`;
      const key = vis ? `${r.x}|${r.y}|${r.width}|${r.height}|${clip}` : 'hidden';
      if (key !== last) { last = key; setBox(vis ? { x: r.x, y: r.y, w: r.width, h: r.height, clip } : null); }
    };
    // measure only when something could have moved it (scroll, resize, drag), at most once a frame, plus a slow check
    const kick = () => { if (!queued) queued = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(kick); ro.observe(s.slot);
    addEventListener('scroll', kick, true); addEventListener('resize', kick); addEventListener('pointermove', kick, { passive: true });
    const iv = setInterval(() => { if (!document.hidden) kick(); }, 400);
    return () => { cancelAnimationFrame(queued); ro.disconnect(); removeEventListener('scroll', kick, true); removeEventListener('resize', kick); removeEventListener('pointermove', kick); clearInterval(iv); };
  }, [s.slot]);
  // where you dragged the mini player (offset from the bottom-right corner), kept between visits
  const [pos, setPos] = useState<{ r: number; b: number }>(() => load('spdPos', { r: 14, b: 44 }));
  const drag = useRef<{ x: number; y: number; r: number; b: number } | null>(null);
  const clampPos = (p: { r: number; b: number }) => ({ r: Math.min(Math.max(4, p.r), innerWidth - 250), b: Math.min(Math.max(4, p.b), innerHeight - 74) });
  useEffect(() => { const f = () => setPos((p) => clampPos(p)); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  if (!s.src) return null;
  const docked = !box;
  const grip = {
    onPointerDown: (e: React.PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, ...pos }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); },
    onPointerMove: (e: React.PointerEvent) => { const d = drag.current; if (d) setPos(clampPos({ r: d.r - (e.clientX - d.x), b: d.b - (e.clientY - d.y) })); },
    onPointerUp: () => { if (drag.current) { drag.current = null; save('spdPos', pos); } },
    onDoubleClick: () => { const p = { r: 14, b: 44 }; setPos(p); save('spdPos', p); },
  };
  return (
    <div className={`spd ${docked ? 'docked' : 'inslot'}`} style={box ? { left: box.x, top: box.y, width: box.w, height: box.h, clipPath: box.clip } : { right: pos.r, bottom: pos.b }} aria-label="Spotify player">
      {docked && <div className="spd-grip" title="Drag to move the player · double-click to put it back in the corner" {...grip}>⠿</div>}
      {docked && <button className="spd-x" title={`${s.label || 'Spotify'}: stop and close the player`} aria-label="Stop Spotify" onClick={() => { st = { src: null, slot: st.slot, label: '' }; emit(); }}>×</button>}
      <iframe className="spd-frame" src={s.src} title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
    </div>
  );
}
