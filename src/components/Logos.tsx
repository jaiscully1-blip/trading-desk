// Company logos on ticker chips: a small logo inside the chip and the chip lightly tinted with the brand's main color,
// read from the logo itself. Logos are the free public images from Financial Modeling Prep (no key). Nothing to wire
// per component: it decorates ticker chips as they appear. Missing logos just leave the chip plain.
import { useEffect } from 'react';
import { load, save } from '../lib/store';

const SEL = '.sym-chip, .wl-sym, .peer-sym, .pk-sym, .ql-chips .chip, .ql-cos .chip, [data-sym].chip, .hc-h b';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const url = (s: string) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`;
type Brand = { c: string | null; ok: boolean };
const brands = new Map<string, Brand>(Object.entries(load<Record<string, Brand>>('logoBrands', {})));
const pending = new Map<string, Promise<Brand>>();
let saveT: ReturnType<typeof setTimeout> | undefined;
const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => save('logoBrands', Object.fromEntries([...brands].slice(-800))), 2000); };

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
        try { const cv = document.createElement('canvas'); cv.width = cv.height = 24; const x = cv.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, 24, 24); c = dominant(x.getImageData(0, 0, 24, 24).data); } catch { /* tainted: logo only */ }
        res({ c, ok: true });
      };
      img.onerror = () => res({ c: null, ok: false });
      img.src = url(sym);
    }).then((b) => { brands.set(sym, b); pending.delete(sym); persist(); return b; });
    pending.set(sym, p);
  }
  return p;
}

function decorate(el: HTMLElement) {
  const sym = (el.dataset.sym || el.textContent || '').trim().toUpperCase().replace(/^[☆★]\s*/, '');
  if (el.dataset.logo && el.dataset.logoSym === sym) return; // already done (a reused chip with a new ticker is redone)
  if (!SYM.test(sym)) { if (el.dataset.logo) { delete el.dataset.logo; el.style.removeProperty('--logo'); el.style.removeProperty('--brand'); } return; }
  el.dataset.logo = 'loading'; el.dataset.logoSym = sym;
  void brand(sym).then((b) => {
    if (!el.isConnected || el.dataset.logoSym !== sym) return;
    if (!b.ok) { el.dataset.logo = 'none'; return; }
    el.style.setProperty('--logo', `url("${url(sym)}")`);
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
