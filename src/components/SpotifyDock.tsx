// One Spotify player for the whole app, so music keeps playing when you switch workspace or page.
// The Spotify widget only reserves a spot (a "slot"); this player floats over that spot while it is on screen and
// shrinks to a mini player in the corner when it isn't. The iframe is never moved in the page (moving an iframe
// reloads it and stops the music), only repositioned with CSS.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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
    let raf = 0, last = '';
    const tick = () => {
      const el = s.slot!;
      if (!el.isConnected) { setBox(null); return; }
      const r = el.getBoundingClientRect(), c = clipBox(el);
      const vis = r.width > 20 && r.height > 20 && r.bottom > c.top && r.top < c.bottom && r.right > c.left && r.left < c.right && getComputedStyle(el).visibility !== 'hidden';
      const clip = `inset(${Math.max(0, c.top - r.top)}px ${Math.max(0, r.right - c.right)}px ${Math.max(0, r.bottom - c.bottom)}px ${Math.max(0, c.left - r.left)}px round 10px)`;
      const key = vis ? `${r.x}|${r.y}|${r.width}|${r.height}|${clip}` : 'hidden';
      if (key !== last) { last = key; setBox(vis ? { x: r.x, y: r.y, w: r.width, h: r.height, clip } : null); }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [s.slot]);
  if (!s.src) return null;
  const docked = !box;
  return (
    <div className={`spd ${docked ? 'docked' : 'inslot'}`} style={box ? { left: box.x, top: box.y, width: box.w, height: box.h, clipPath: box.clip } : undefined} aria-label="Spotify player">
      {docked && <button className="spd-x" title={`${s.label || 'Spotify'}: stop and close the player`} aria-label="Stop Spotify" onClick={() => { st = { src: null, slot: st.slot, label: '' }; emit(); }}>×</button>}
      <iframe className="spd-frame" src={s.src} title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
    </div>
  );
}
