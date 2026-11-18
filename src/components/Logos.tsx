// Company logos on ticker chips: a small logo inside the chip and the chip lightly tinted with the brand's main color,
// read from the logo itself. Logos are the free public images from Financial Modeling Prep (no key). Nothing to wire
// per component: it decorates ticker chips as they appear. Missing logos just leave the chip plain.
import { useEffect } from 'react';
import { load, save } from '../lib/store';

const SEL = '.sym-chip, .wl-sym, .peer-sym, .pk-sym, .ql-chips .chip, .ql-cos .chip, [data-sym].chip, .hc-h b';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const url = (s: string) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`;
type Brand = { c: string | null; ok: boolean };
const clean = new Map<string, string>(); // sym -> logo with its white backdrop removed (this session only)
const brands = new Map<string, Brand>(Object.entries(load<Record<string, Brand>>('logoBrands', {})));
const pending = new Map<string, Promise<Brand>>();
let saveT: ReturnType<typeof setTimeout> | undefined;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => save('logoBrands', Object.fromEntries([...brands].slice(-800))), 2000); };

/** Clears a solid white/near-white backdrop that touches the edges (flood fill from the border), so the logo sits on
 *  the desk's own background. White inside the logo (text, details) is not connected to the edge and stays. */
export function knockout(px: Uint8ClampedArray, w: number, h: number): boolean {
  const white = (i: number) => px[i + 3] > 200 && px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232;
  const seen = new Uint8Array(w * h), stack: number[] = [];
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  let cleared = 0;
  while (stack.length) {
    const k = stack.pop()!; if (seen[k]) continue; seen[k] = 1;
    if (!white(k * 4)) continue;
    px[k * 4 + 3] = 0; cleared++;
    const x = k % w, y = (k / w) | 0;
    if (x > 0) stack.push(k - 1); if (x < w - 1) stack.push(k + 1); if (y > 0) stack.push(k - w); if (y < h - 1) stack.push(k + w);
  }
  return cleared > w * h * 0.04;
}

/** A mostly dark logo vanishes on the dark desk: redraw its shapes in a soft light gray (keeping their edges). */
export function lighten(px: Uint8ClampedArray): boolean {
  let n = 0, lum = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 120) { n++; lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; }
  // a logo drawn on its own filled square (a badge) keeps its colors: lightening it would just make a blank tile
  if (!n || lum / n > 0.42 || n > (px.length / 4) * 0.7) return false;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) { px[i] = 226; px[i + 1] = 234; px[i + 2] = 238; }
  return true;
}

/** The logo's main color: the most common saturated, not-too-dark, not-too-light pixel color. */
export function dominant(px: Uint8ClampedArray): string | null {
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    if (a < 160) continue;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 240 && mn > 225) continue; // white background
    if (mx < 28) continue; // near black outlines
    const sat = mx ? (mx - mn) / mx : 0;
    const k = `${r >> 5},${g >> 5},${b >> 5}`, w = sat > 0.25 ? 3 : 1;
    const o = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; o.n += w; o.r += r * w; o.g += g * w; o.b += b * w; bins.set(k, o);
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const o of bins.values()) if (!best || o.n > best.n) best = o;
  if (!best || best.n < 6) return null;
  return `rgb(${Math.round(best.r / best.n)}, ${Math.round(best.g / best.n)}, ${Math.round(best.b / best.n)})`;
}

function brand(sym: string): Promise<Brand> {
  const hit = brands.get(sym); if (hit) return Promise.resolve(hit);
  let p = pending.get(sym);
  if (!p) {
    p = new Promise<Brand>((res) => {
      const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
      img.onload = () => {
        let c: string | null = null;
        try {
          const cv = document.createElement('canvas'); cv.width = cv.height = 24; const x = cv.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, 24, 24); c = dominant(x.getImageData(0, 0, 24, 24).data);
          const big = document.createElement('canvas'), S = 64; big.width = big.height = S; const g = big.getContext('2d', { willReadFrequently: true })!;
          const r = Math.min(S / img.naturalWidth, S / img.naturalHeight), w = img.naturalWidth * r, hh = img.naturalHeight * r;
          g.drawImage(img, (S - w) / 2, (S - hh) / 2, w, hh);
          const d = g.getImageData(0, 0, S, S);
          const a = knockout(d.data, S, S), b2 = lighten(d.data);
          if (a || b2) { g.putImageData(d, 0, 0); clean.set(sym, big.toDataURL('image/png')); }
        } catch { /* tainted: logo only */ }
        res({ c, ok: true });
      };
      img.onerror = () => res({ c: null, ok: false });
      img.src = url(sym);
    }).then((b) => { brands.set(sym, b); pending.delete(sym); persist(); return b; });
    pending.set(sym, p);
  }
  return p;
}

/** Re-draws a logo whose color came from the cache, just to clear its white backdrop, then updates its chips. */
const cleaning = new Set<string>();
function brandClean(sym: string) {
  if (cleaning.has(sym)) return; cleaning.add(sym);
  const img = new Image(); img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const big = document.createElement('canvas'), S = 64; big.width = big.height = S; const g = big.getContext('2d', { willReadFrequently: true })!;
      const r = Math.min(S / img.naturalWidth, S / img.naturalHeight), w = img.naturalWidth * r, h = img.naturalHeight * r;
      g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      const d = g.getImageData(0, 0, S, S);
      const a = knockout(d.data, S, S), b2 = lighten(d.data);
      if (!a && !b2) return;
      g.putImageData(d, 0, 0); const u = big.toDataURL('image/png'); clean.set(sym, u);
      document.querySelectorAll<HTMLElement>(`[data-logo-sym="${CSS.escape(sym)}"]`).forEach((el) => el.style.setProperty('--logo', `url("${u}")`));
    } catch { /* keep the original */ }
  };
  img.src = url(sym);
}

function decorate(el: HTMLElement) {
  const sym = (el.dataset.sym || el.textContent || '').trim().toUpperCase().replace(/^[☆★]\s*/, '');
  if (el.dataset.logo && el.dataset.logoSym === sym) return; // already done (a reused chip with a new ticker is redone)
  if (!SYM.test(sym)) { if (el.dataset.logo) { delete el.dataset.logo; el.style.removeProperty('--logo'); el.style.removeProperty('--brand'); } return; }
  el.dataset.logo = 'loading'; el.dataset.logoSym = sym;
  void brand(sym).then((b) => {
    if (!el.isConnected || el.dataset.logoSym !== sym) return;
    if (!b.ok) { el.dataset.logo = 'none'; return; }
    if (!clean.has(sym) && b.ok) void brandClean(sym); // after a reload the color is cached but the cleaned image isn't
    el.style.setProperty('--logo', `url("${clean.get(sym) ?? url(sym)}")`);
    if (b.c) el.style.setProperty('--brand', b.c);
    el.dataset.logo = b.c ? 'tint' : 'plain';
  });
}

export function LogoDecorator() {
  useEffect(() => {
    // batched: at most one pass every 300 ms however busy the page is
    let t: ReturnType<typeof setTimeout> | undefined;
    const scan = () => { t = undefined; document.querySelectorAll<HTMLElement>(SEL).forEach(decorate); };
    const mo = new MutationObserver(() => { t ??= setTimeout(scan, 300); });
    scan(); mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);
  return null;
}
