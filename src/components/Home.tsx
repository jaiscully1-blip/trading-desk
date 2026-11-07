// Home (H): starts blank. Search a ticker to drop in a stock widget, or add widgets from the menu.
// Drag a widget by its title bar, resize from the bottom-right corner. The side bar is a narrow, scrollable
// "second screen" column: send any widget there (⇥) and back (⇤).
import { useEffect, useRef, useState, type FormEvent, type PointerEvent as RPE } from 'react';
import { COLS, DEFAULT_SIZE, addTop, settle, type Widget, type WidgetType } from '../lib/grid';
import { WIDGETS, type HomeData } from './HomeWidgets';
import { useDesk } from '../lib/deskctx';

export interface HomeLayout { main: Widget[]; side: Widget[] }
export const EMPTY_HOME: HomeLayout = { main: [], side: [] };
const ROW = 36, GAP = 8;
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const uid = () => Math.random().toString(36).slice(2, 9);

type Drag = { id: string; kind: 'move' | 'size'; x0: number; y0: number; start: Widget; area: 'main' | 'side' };

export default function Home({ layout, setLayout, d, tickers }: { layout: HomeLayout; setLayout: (f: (l: HomeLayout) => HomeLayout) => void; d: HomeData; tickers: { sym: string; name: string }[] }) {
  const { names } = useDesk();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, []);
  const colW = (width - GAP * (COLS - 1)) / COLS;

  const add = (type: WidgetType, cfg: Record<string, any> = {}, to: 'main' | 'side' = 'main') => {
    const s = DEFAULT_SIZE[type];
    const w: Widget = { id: uid(), type, x: 0, y: 0, w: s.w, h: to === 'side' ? s.side : s.h, cfg };
    setLayout((l) => (to === 'side' ? { ...l, side: [w, ...l.side] } : { ...l, main: addTop(l.main, w) }));
    setMenu(false);
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const raw = q.trim().toUpperCase();
    // a known ticker first, then a company-name match ("tesla" -> TSLA), then any ticker-shaped text
    const hit = tickers.find((t) => t.sym === raw)?.sym ?? (raw.length >= 3 ? tickers.find((t) => t.name.toUpperCase().includes(raw))?.sym : undefined) ?? (SYM_RE.test(raw) ? raw : undefined);
    if (hit) { add('stock', { sym: hit, tf: 'D' }); setQ(''); }
  };
  const remove = (id: string) => setLayout((l) => ({ main: settle(l.main.filter((w) => w.id !== id)), side: l.side.filter((w) => w.id !== id) }));
  const setCfg = (id: string, cfg: Record<string, any>) => setLayout((l) => ({ main: l.main.map((w) => (w.id === id ? { ...w, cfg } : w)), side: l.side.map((w) => (w.id === id ? { ...w, cfg } : w)) }));
  const toSide = (id: string) => setLayout((l) => { const w = l.main.find((x) => x.id === id)!; return { main: settle(l.main.filter((x) => x.id !== id)), side: [...l.side, { ...w, h: DEFAULT_SIZE[w.type].side }] }; });
  const toMain = (id: string) => setLayout((l) => { const w = l.side.find((x) => x.id === id)!; return { main: addTop(l.main, { ...w, w: DEFAULT_SIZE[w.type].w, h: DEFAULT_SIZE[w.type].h }), side: l.side.filter((x) => x.id !== id) }; });
  const moveSide = (id: string, dir: -1 | 1) => setLayout((l) => { const i = l.side.findIndex((x) => x.id === id), j = i + dir; if (j < 0 || j >= l.side.length) return l; const s = [...l.side]; [s[i], s[j]] = [s[j], s[i]]; return { ...l, side: s }; });

  // drag / resize with pointer capture; layout settles live so you see where it will land
  const down = (e: RPE, w: Widget, kind: Drag['kind'], where: 'main' | 'side') => {
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a') && kind === 'move') return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: w.id, kind, x0: e.clientX, y0: e.clientY, start: { ...w }, area: where });
  };
  const move = (e: RPE) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0, s = drag.start;
    if (drag.area === 'side') {
      if (drag.kind === 'size') setLayout((l) => ({ ...l, side: l.side.map((w) => (w.id === s.id ? { ...w, h: Math.max(3, Math.round(s.h + dy / (ROW + GAP))) } : w)) }));
      return;
    }
    const cx = Math.round(dx / (colW + GAP)), cy = Math.round(dy / (ROW + GAP));
    const next = drag.kind === 'move' ? { ...s, x: s.x + cx, y: Math.max(0, s.y + cy) } : { ...s, w: Math.max(2, Math.min(COLS - s.x, s.w + cx)), h: Math.max(3, s.h + cy) };
    setLayout((l) => {
      const cur = l.main.find((w) => w.id === s.id);
      if (cur && cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h) return l;
      return { ...l, main: settle(l.main.map((w) => (w.id === s.id ? next : w)), s.id) };
    });
  };
  const up = () => { if (drag) { setLayout((l) => ({ ...l, main: settle(l.main) })); setDrag(null); } };

  const chrome = (w: Widget, where: 'main' | 'side') => {
    const W = WIDGETS[w.type];
    const Body = W.make;
    const title = w.type === 'stock' || w.type === 'options' ? `${W.title}${w.cfg.sym ? ` · ${w.cfg.sym}` : ''}${w.cfg.sym && names[w.cfg.sym] ? ` · ${names[w.cfg.sym]}` : ''}` : W.title;
    return (
      <>
      <div className={`hw-head ${where}`} onPointerDown={(e) => down(e, w, 'move', where)} onPointerMove={move} onPointerUp={up} title={where === 'main' ? 'Drag to move' : undefined}>
        <span className="hw-title">{title}</span>
        {where === 'side' && <><button className="hw-btn" onClick={() => moveSide(w.id, -1)} title="Move up" aria-label="Move up">↑</button><button className="hw-btn" onClick={() => moveSide(w.id, 1)} title="Move down" aria-label="Move down">↓</button></>}
        <button className="hw-btn" onClick={() => (where === 'main' ? toSide(w.id) : toMain(w.id))} title={where === 'main' ? 'Send to the side bar' : 'Back to the main area'} aria-label={where === 'main' ? 'Send to side bar' : 'Back to main area'}>{where === 'main' ? '⇥' : '⇤'}</button>
        <button className="hw-btn" onClick={() => remove(w.id)} title="Remove widget" aria-label="Remove widget">×</button>
      </div>
      <div className="hw-body"><Body d={d} cfg={w.cfg} set={(c) => setCfg(w.id, c)} /></div>
      </>
    );
  };
  const height = Math.max(0, ...layout.main.map((w) => w.y + w.h)) * (ROW + GAP) + 120;

  return (
    <div className="page home">
      <div className="home-main">
        <div className="home-bar">
          <form onSubmit={search} className="home-search">
            <label className="sr-only" htmlFor="home-q">Search a ticker</label>
            <input id="home-q" list="home-tickers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a ticker or company → adds a stock widget" autoComplete="off" spellCheck={false} />
            <datalist id="home-tickers">{tickers.slice(0, 300).map((t) => <option key={t.sym} value={t.sym}>{t.name}</option>)}</datalist>
            <button className="btn primary" type="submit">Add</button>
          </form>
          <div className="home-add">
            <button className="btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>+ Add widget</button>
            {menu && (
              <div className="home-menu" role="menu">
                {(Object.keys(WIDGETS) as WidgetType[]).map((t) => (
                  <div key={t} className="home-menu-row" role="none">
                    <button role="menuitem" onClick={() => add(t, t === 'stock' || t === 'options' ? { sym: d.sel } : {})}>{WIDGETS[t].title}</button>
                    <button role="menuitem" className="muted small" onClick={() => add(t, t === 'stock' || t === 'options' ? { sym: d.sel } : {}, 'side')} title="Add to the side bar">→ side</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {(layout.main.length > 0 || layout.side.length > 0) && <button className="btn" onClick={() => { if (confirm('Clear the Home page?')) setLayout(() => ({ main: [], side: [] })); }} title="Remove every widget">Clear</button>}
        </div>
        <div className="home-grid" ref={area} style={{ height }} onPointerMove={move} onPointerUp={up}>
          {!layout.main.length && (
            <div className="home-empty">
              <p><b>Blank page.</b> Make it yours.</p>
              <p className="muted">Search a ticker above to drop in a stock widget, or use <b>+ Add widget</b> (options calculator, clock, live news, notes, ★ starred, movers, calendar). Drag a widget by its title bar, resize from its corner, and send it to the side bar with ⇥.</p>
            </div>
          )}
          {layout.main.map((w) => (
            <section key={w.id} className={`hw panel ${drag?.id === w.id ? 'dragging' : ''}`} style={{ left: w.x * (colW + GAP), top: w.y * (ROW + GAP), width: w.w * colW + (w.w - 1) * GAP, height: w.h * ROW + (w.h - 1) * GAP }}>
              {chrome(w, 'main')}
              <div className="hw-size" onPointerDown={(e) => down(e, w, 'size', 'main')} onPointerMove={move} onPointerUp={up} title="Drag to resize" aria-hidden="true" />
            </section>
          ))}
        </div>
      </div>
      <aside className="home-side" aria-label="Side bar">
        <div className="home-side-h"><b>SIDE BAR</b><span className="muted small">scroll · ⇤ to move back</span></div>
        {!layout.side.length && <p className="small muted home-side-empty">Your second screen. Send widgets here with ⇥ (or “→ side” in the add menu) and scroll through them.</p>}
        {layout.side.map((w) => (
          <section key={w.id} className="hw panel side" style={{ height: w.h * ROW + (w.h - 1) * GAP }}>
            {chrome(w, 'side')}
            <div className="hw-size" onPointerDown={(e) => down(e, w, 'size', 'side')} onPointerMove={move} onPointerUp={up} title="Drag to change height" aria-hidden="true" />
          </section>
        ))}
      </aside>
    </div>
  );
}
