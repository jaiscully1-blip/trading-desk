// One hover system for every hand-drawn chart on the desk (installed once by the app).
//  - Any <svg data-hover>: a crosshair follows the cursor and a dot rides along each line. Lines are the paths with
//    data-name (or, if none, every stroked path with no fill). If the svg says how its axes map to values
//    (data-x="px0,px1,v0,v1,fmt" and data-y="py0,py1,v0,v1,decimals,unit"), the tooltip shows the numbers.
//    fmt: num | date (ms) | day (days) | pct.
//  - Any element with data-tip: an instant tooltip with that text (bars, cells, dots).
// Imperative and delegated so charts stay simple and nothing re-renders on mouse moves.

type Samp = { x: number; y: number }[];
const cache = new WeakMap<SVGPathElement, { d: string; pts: Samp }>();
function samples(p: SVGPathElement): Samp {
  const d = p.getAttribute('d') ?? '', c = cache.get(p);
  if (c && c.d === d) return c.pts;
  let pts: Samp = [];
  try { const L = p.getTotalLength(), n = Math.min(600, Math.max(60, Math.round(L / 2))); for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((i / n) * L); pts.push({ x: q.x, y: q.y }); } } catch { pts = []; }
  cache.set(p, { d, pts });
  return pts;
}
function yAt(pts: Samp, x: number): number | null {
  if (pts.length < 2) return null;
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const q of pts) { const dd = Math.abs(q.x - x); if (dd < bd) { bd = dd; best = q; } }
  const span = Math.abs(pts[pts.length - 1].x - pts[0].x) / pts.length * 6;
  return best && bd <= Math.max(span, 6) ? best.y : null;
}
const lin = (v: number, a0: number, a1: number, b0: number, b1: number) => b0 + ((v - a0) / (a1 - a0 || 1)) * (b1 - b0);
function fmtX(v: number, f: string) {
  if (f === 'date') return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  if (f === 'time') return new Date(v).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
  if (f === 'day') return `${Math.round(v)} days`;
  if (f === 'pct') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}
const nums = (s: string | null) => (s ?? '').split(',').map((x) => x.trim());

let tip: HTMLDivElement | null = null;
function tipEl() {
  if (!tip) { tip = document.createElement('div'); tip.className = 'ch-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
  return tip;
}
function showTip(html: string, cx: number, cy: number) {
  const t = tipEl(); t.innerHTML = html; t.style.display = 'block';
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = `${Math.min(window.innerWidth - w - 8, cx + 14)}px`;
  t.style.top = `${Math.max(8, cy - h - 12 < 8 ? cy + 16 : cy - h - 12)}px`;
}
const hideTip = () => { if (tip) tip.style.display = 'none'; };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function layer(svg: SVGSVGElement): SVGGElement {
  let g = svg.querySelector<SVGGElement>(':scope > g.ch-layer');
  if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('class', 'ch-layer'); svg.appendChild(g); }
  return g;
}
function clear(svg: SVGSVGElement) { svg.querySelector(':scope > g.ch-layer')?.replaceChildren(); }

let lastSvg: SVGSVGElement | null = null;
function onMove(e: PointerEvent) {
  const el = e.target as Element | null;
  // instant tooltip: data-tip, or the <title> of a chart element (shown at once instead of the browser's slow one)
  let tipHost: Element | null = el?.closest?.('[data-tip]') ?? null;
  let tipText = tipHost?.getAttribute('data-tip') ?? '';
  if (!tipHost && el && el.closest('svg') && el.tagName.toLowerCase() !== 'svg') {
    for (let n: Element | null = el; n && n.tagName.toLowerCase() !== 'svg'; n = n.parentElement) { const t = n.querySelector(':scope > title'); if (t?.textContent) { tipHost = n; tipText = t.textContent; break; } }
  }
  const svg = el?.closest?.('svg[data-hover]') as SVGSVGElement | null;
  if (lastSvg && lastSvg !== svg) { clear(lastSvg); lastSvg = null; }
  if (!svg) { if (tipHost) showTip(esc(tipText), e.clientX, e.clientY); else hideTip(); return; }
  lastSvg = svg;
  const m = svg.getScreenCTM(); if (!m) return;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  const vb = svg.viewBox.baseVal;
  let paths = [...svg.querySelectorAll<SVGPathElement>('path[data-name], polyline[data-name]')];
  if (!paths.length) paths = [...svg.querySelectorAll<SVGPathElement>('path, polyline')].filter((p) => !p.closest('.ch-layer') && getComputedStyle(p).fill === 'none' && getComputedStyle(p).stroke !== 'none');
  const g = layer(svg); g.replaceChildren();
  const NS = 'http://www.w3.org/2000/svg';
  const vline = document.createElementNS(NS, 'line');
  vline.setAttribute('x1', String(pt.x)); vline.setAttribute('x2', String(pt.x)); vline.setAttribute('y1', String(vb.y)); vline.setAttribute('y2', String(vb.y + vb.height)); vline.setAttribute('class', 'ch-cross');
  g.appendChild(vline);
  const [px0, px1, xv0, xv1, xf] = nums(svg.getAttribute('data-x')), [py0, py1, yv0, yv1, dec, unit] = nums(svg.getAttribute('data-y'));
  const rows: string[] = [];
  if (svg.hasAttribute('data-x') && px1) rows.push(`<b>${esc(fmtX(lin(pt.x, +px0, +px1, +xv0, +xv1), xf || 'num'))}</b>`);
  for (const p of paths) {
    const y = yAt(samples(p), pt.x); if (y == null) continue;
    const c = document.createElementNS(NS, 'circle'), stroke = getComputedStyle(p).stroke;
    c.setAttribute('cx', String(pt.x)); c.setAttribute('cy', String(y)); c.setAttribute('r', '3.5'); c.setAttribute('class', 'ch-dot'); c.style.stroke = stroke;
    g.appendChild(c);
    const name = p.getAttribute('data-name');
    if (svg.hasAttribute('data-y') && py1) { const v = lin(y, +py0, +py1, +yv0, +yv1); rows.push(`<span class="ch-sw" style="background:${stroke}"></span>${name ? esc(name) + ' ' : ''}<b>${v.toFixed(dec ? +dec : 2)}${esc(unit ?? '')}</b>`); }
    else if (name) rows.push(`<span class="ch-sw" style="background:${stroke}"></span>${esc(name)}`);
  }
  if (tipHost && svg.contains(tipHost)) rows.push(esc(tipText));
  if (rows.length) showTip(rows.join('<br>'), e.clientX, e.clientY); else hideTip();
}
function onLeave() { if (lastSvg) { clear(lastSvg); lastSvg = null; } hideTip(); }

let installed = false;
export function installChartHover() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  document.addEventListener('scroll', hideTip, { passive: true, capture: true });
}
