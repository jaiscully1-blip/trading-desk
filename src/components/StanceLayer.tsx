// Mounted once. (1) Puts your stance tag next to every ticker chip on the desk, automatically, including ones typed in later.
// (2) Opens a choose-only picker when you right-click any ticker (or press a "stance" button). Nothing to type, nothing to wire per page.
import { useEffect, useRef, useState } from 'react';
import { DIRS, SHAPES, badge, describe, openStance, setStance, tone, useStances, type Dir } from '../lib/stance';

const TAG_SEL = '.sym-chip, .wl-sym, .msg-sym, .dx-sym';
const PICK_SEL = '[data-sym], .sym-chip, .wl-row, .wl-sym, .msg-sym, .dx-row, .dx-wrow';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
function symOf(el: HTMLElement): string | null {
  const s = (el.dataset.sym || el.querySelector<HTMLElement>('.wl-sym, .dx-sym, b')?.textContent || el.textContent || '').trim().split(/\s/)[0].toUpperCase();
  return SYM.test(s) ? s : null;
}

export default function StanceLayer() {
  const st = useStances();
  const stRef = useRef(st); stRef.current = st;
  const [pick, setPick] = useState<{ sym: string; x: number; y: number } | null>(null);

  // tag tickers
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const m = stRef.current;
      document.querySelectorAll<HTMLElement>(TAG_SEL).forEach((el) => {
        if (el.closest('.stance-pop')) return;
        const s = symOf(el); const b = s ? badge(m[s]) : '';
        if (b) { if (el.dataset.stance !== b) el.dataset.stance = b; const d = tone(m[s!]); if (el.dataset.st !== d) el.dataset.st = d; el.title = describe(m[s!]) || el.title; }
        else if (el.dataset.stance) { delete el.dataset.stance; delete el.dataset.st; }
      });
    };
    const later = () => { clearTimeout(t); t = setTimeout(run, 250); };
    run();
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    (window as unknown as { __stanceRun?: () => void }).__stanceRun = run;
    return () => { mo.disconnect(); clearTimeout(t); };
  }, []);
  useEffect(() => { (window as unknown as { __stanceRun?: () => void }).__stanceRun?.(); }, [st]);

  // open the picker: right-click any ticker, or a button that fires the same event
  useEffect(() => {
    const ctx = (e: MouseEvent) => {
      if (e.defaultPrevented) return; // a component with its own right-click action keeps it
      const el = (e.target as HTMLElement | null)?.closest?.(PICK_SEL) as HTMLElement | null;
      if (!el || el.closest('.stance-pop, .cmd, .scrim')) return;
      const sym = symOf(el); if (!sym) return;
      e.preventDefault(); openStance(sym, e.clientX, e.clientY);
    };
    const ev = (e: Event) => { const d = (e as CustomEvent).detail as { sym: string; x: number; y: number }; setPick({ sym: d.sym, x: d.x, y: d.y }); };
    document.addEventListener('contextmenu', ctx);
    window.addEventListener('td-stance', ev);
    return () => { document.removeEventListener('contextmenu', ctx); window.removeEventListener('td-stance', ev); };
  }, []);
  useEffect(() => {
    if (!pick) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPick(null); };
    const away = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.stance-pop')) setPick(null); };
    document.addEventListener('keydown', esc); document.addEventListener('mousedown', away);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', away); };
  }, [pick]);

  if (!pick) return null;
  const cur = st[pick.sym] ?? {};
  const x = Math.min(window.innerWidth - 270, Math.max(8, pick.x)), y = Math.min(window.innerHeight - 330, Math.max(8, pick.y));
  const dirRow = (label: string, key: 'long' | 'short') => (
    <div className="sp-row"><span className="small muted">{label}</span>
      <div className="sp-opts">{DIRS.map((d) => <button key={d.id} className={`chip sm sp-${d.id} ${cur[key] === d.id ? 'on' : ''}`} onClick={() => setStance(pick.sym, { [key]: cur[key] === d.id ? undefined : (d.id as Dir) })}>{d.glyph} {d.label}</button>)}</div>
    </div>
  );
  return (
    <div className="stance-pop" style={{ left: x, top: y }} role="dialog" aria-label={`Your view on ${pick.sym}`}>
      <div className="sp-h"><b>{pick.sym}</b><span className="small muted">your view (just for you)</span><span className="es-sp" /><button className="icon-btn" onClick={() => setPick(null)} aria-label="Close">×</button></div>
      {dirRow('Long term', 'long')}
      {dirRow('Short term', 'short')}
      <div className="sp-row"><span className="small muted">Chart shape</span>
        <div className="sp-opts">{SHAPES.map((s) => <button key={s.id} className={`chip sm ${cur.shape === s.id ? 'on' : ''}`} onClick={() => setStance(pick.sym, { shape: cur.shape === s.id ? undefined : s.id })}>{s.glyph} {s.label}</button>)}</div>
      </div>
      <div className="sp-f"><button className="chip sm" onClick={() => setStance(pick.sym, null)} disabled={!Object.keys(cur).length}>Clear</button><span className="small muted">Click a choice again to unset it.</span></div>
    </div>
  );
}

/** A visible button for places that need one (essay bar, company page): shows the current tag, opens the picker. */
export function StanceButton({ sym }: { sym: string }) {
  const st = useStances()[sym];
  if (!sym) return null;
  return <button className="chip sm" data-st={tone(st)} title={describe(st) || 'Set your view on this ticker (or right-click any ticker)'} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); openStance(sym, r.left, r.bottom + 4); }}>{badge(st) || '+ Stance'}</button>;
}
