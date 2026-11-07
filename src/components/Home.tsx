// Home (H): workspaces of widgets. Each workspace starts blank. A widget library on the left (search, groups, pinned
// favorites), workspace tabs along the bottom (add, rename, close), and Undo / Redo / Save point / Restore / Clear.
// Drag a widget by its title bar, resize from its corner, pin it in place, or send it to the scrollable side bar (⇥).
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as RPE } from 'react';
import { CANVAS_COLS, COLS, DEFAULT_SIZE, addTop, settle, type Widget, type WidgetType } from '../lib/grid';
import { WIDGETS, type HomeData } from './HomeWidgets';
import { useDesk } from '../lib/deskctx';
import { usePersisted } from '../lib/store';

export interface HomeLayout { main: Widget[]; side: Widget[] }
export interface Workspace { id: string; name: string; layout: HomeLayout; saved?: HomeLayout; savedAt?: number }
export interface Workspaces { active: string; list: Workspace[] }
export const EMPTY_HOME: HomeLayout = { main: [], side: [] };
const ROW = 36, GAP = 8;
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const uid = () => Math.random().toString(36).slice(2, 9);

const GROUPS: { name: string; items: { type: WidgetType; blurb: string }[] }[] = [
  { name: 'Market', items: [{ type: 'stock', blurb: 'price, chart, its news' }, { type: 'crypto', blurb: 'BTC, ETH… 24/7 + crypto news' }, { type: 'commodities', blurb: 'oil, gas, gold, copper, grains' }, { type: 'movers', blurb: 'top gainers / losers' }, { type: 'calendar', blurb: 'economy + earnings' }, { type: 'congress', blurb: 'what members of Congress bought / sold' }, { type: 'insider', blurb: 'CEO / director buys and sells (SEC Form 4)' }, { type: 'polymarket', blurb: 'crowd odds: Fed, economy, geopolitics' }] },
  { name: 'News', items: [{ type: 'news', blurb: 'live headlines' }, { type: 'messages', blurb: 'earnings, Fed, White House, live' }, { type: 'browser', blurb: 'web, YouTube' }] },
  { name: 'Poker desk', items: [{ type: 'bets', blurb: 'every trade is a bet: equity vs pot odds' }, { type: 'claims', blurb: 'bull / bear: financials, technicals, news' }] },
  { name: 'Trading tools', items: [{ type: 'risk', blurb: 'size, R:R, edge, drawdown, calc' }, { type: 'options', blurb: 'Black-Scholes + Greeks' }, { type: 'starred', blurb: 'your ★ list + pings' }, { type: 'sim', blurb: 'odds of your next 50 trades (Monte Carlo)' }] },
  { name: 'My accounts', items: [{ type: 'webull', blurb: 'positions + P&L calendar (read-only)' }, { type: 'discord', blurb: 'bot watchlist + your 3 channels' }] },
  { name: 'Time & notes', items: [{ type: 'sessions', blurb: 'NY / London / Asia open-close' }, { type: 'clock', blurb: 'ET clock + countdown' }, { type: 'notes', blurb: 'sticky notes' }] },
  { name: 'Media', items: [{ type: 'spotify', blurb: 'playlists, podcasts' }, { type: 'x', blurb: 'embed a post' }] },
];
const symFor = (t: WidgetType) => t === 'stock' || t === 'options' || t === 'claims' || t === 'congress' || t === 'insider';

type Drag = { id: string; kind: 'move' | 'size'; x0: number; y0: number; start: Widget; area: 'main' | 'side' };

export default function Home({ spaces, setSpaces, d, tickers }: { spaces: Workspaces; setSpaces: (f: (s: Workspaces) => Workspaces) => void; d: HomeData; tickers: { sym: string; name: string }[] }) {
  const { names } = useDesk();
  const ws = spaces.list.find((w) => w.id === spaces.active) ?? spaces.list[0];
  const layout = ws.layout;
  const [q, setQ] = useState('');
  const [libQ, setLibQ] = useState('');
  const [libOpen, setLibOpen] = usePersisted('libOpen', true);
  const [pins, setPins] = usePersisted<WidgetType[]>('libPins', ['stock', 'risk', 'sessions']);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const port = useRef<HTMLDivElement>(null); // the scrolling window onto the canvas
  const [width, setWidth] = useState(900);
  const [vh, setVh] = useState(600);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  useEffect(() => {
    if (!port.current) return;
    const ro = new ResizeObserver(([e]) => { setWidth(e.contentRect.width); setVh(e.contentRect.height); });
    ro.observe(port.current);
    return () => ro.disconnect();
  }, []);
  // one screen = 12 columns; the canvas is CANVAS_COLS wide and you scroll / drag around it
  const colW = Math.max(40, (width - GAP * (COLS - 1)) / COLS);
  const viewCol = () => Math.round((port.current?.scrollLeft ?? 0) / (colW + GAP));
  const viewRow = () => Math.floor((port.current?.scrollTop ?? 0) / (ROW + GAP));
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const panTo = (x: number, y: number, smooth = true) => port.current?.scrollTo({ left: x, top: y, behavior: smooth ? 'smooth' : 'auto' });

  /* ---------- layout state + undo / redo (per workspace, this session) ---------- */
  const hist = useRef<Record<string, { u: HomeLayout[]; r: HomeLayout[] }>>({});
  const h = () => (hist.current[ws.id] ??= { u: [], r: [] });
  const [, bump] = useState(0);
  const setLayout = useCallback((f: (l: HomeLayout) => HomeLayout) => setSpaces((s) => ({ ...s, list: s.list.map((w) => (w.id === s.active ? { ...w, layout: f(w.layout) } : w)) })), [setSpaces]);
  const commit = (f: (l: HomeLayout) => HomeLayout) => { h().u.push(layout); h().u.splice(0, h().u.length - 60); h().r = []; setLayout(f); bump((x) => x + 1); };
  const undo = () => { const p = h().u.pop(); if (p) { h().r.push(layout); setLayout(() => p); bump((x) => x + 1); } };
  const redo = () => { const n = h().r.pop(); if (n) { h().u.push(layout); setLayout(() => n); bump((x) => x + 1); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select')) return;
      // Shift + arrows: move the view one screen across the canvas
      if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && e.key.startsWith('Arrow') && port.current) {
        e.preventDefault();
        const p = port.current, dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        panTo(p.scrollLeft + dx * p.clientWidth, p.scrollTop + dy * p.clientHeight * 0.8);
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  /* ---------- workspaces ---------- */
  const addSpace = () => { const id = uid(); setSpaces((s) => ({ active: id, list: [...s.list, { id, name: `Workspace ${s.list.length + 1}`, layout: EMPTY_HOME }] })); };
  const closeSpace = (id: string) => {
    const w = spaces.list.find((x) => x.id === id)!;
    if (spaces.list.length === 1 || ((w.layout.main.length || w.layout.side.length) && !confirm(`Close “${w.name}” and its widgets?`))) return;
    setSpaces((s) => { const list = s.list.filter((x) => x.id !== id); return { active: s.active === id ? list[0].id : s.active, list }; });
  };
  const rename = (id: string, name: string) => setSpaces((s) => ({ ...s, list: s.list.map((w) => (w.id === id ? { ...w, name: name.trim().slice(0, 24) || w.name } : w)) }));
  const savePoint = () => setSpaces((s) => ({ ...s, list: s.list.map((w) => (w.id === s.active ? { ...w, saved: w.layout, savedAt: Date.now() } : w)) }));
  const restore = () => { if (ws.saved) commit(() => ws.saved!); };
  const clear = () => { if (layout.main.length + layout.side.length) commit(() => EMPTY_HOME); };

  /* ---------- widgets ---------- */
  const add = (type: WidgetType, cfg: Record<string, any> = {}, to: 'main' | 'side' = 'main') => {
    const s = DEFAULT_SIZE[type];
    const w: Widget = { id: uid(), type, x: 0, y: 0, w: s.w, h: to === 'side' ? s.side : s.h, cfg };
    commit((l) => (to === 'side' ? { ...l, side: [w, ...l.side] } : { ...l, main: addTop(l.main, w, viewCol(), viewRow()) }));
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    const raw = q.trim().toUpperCase();
    // a known ticker first, then a company-name match ("tesla" -> TSLA), then any ticker-shaped text
    const hit = tickers.find((t) => t.sym === raw)?.sym ?? (raw.length >= 3 ? tickers.find((t) => t.name.toUpperCase().includes(raw))?.sym : undefined) ?? (SYM_RE.test(raw) ? raw : undefined);
    if (hit) { add('stock', { sym: hit, tf: 'D' }); setQ(''); }
  };
  const remove = (id: string) => commit((l) => ({ main: settle(l.main.filter((w) => w.id !== id)), side: l.side.filter((w) => w.id !== id) }));
  const setCfg = (id: string, cfg: Record<string, any>) => setLayout((l) => ({ main: l.main.map((w) => (w.id === id ? { ...w, cfg } : w)), side: l.side.map((w) => (w.id === id ? { ...w, cfg } : w)) }));
  const togglePin = (id: string) => commit((l) => ({ ...l, main: settle(l.main.map((w) => (w.id === id ? { ...w, pinned: !w.pinned } : w))) }));
  const toSide = (id: string) => commit((l) => { const w = l.main.find((x) => x.id === id)!; return { main: settle(l.main.filter((x) => x.id !== id)), side: [...l.side, { ...w, pinned: false, h: DEFAULT_SIZE[w.type].side }] }; });
  const toMain = (id: string) => commit((l) => { const w = l.side.find((x) => x.id === id)!; return { main: addTop(l.main, { ...w, w: DEFAULT_SIZE[w.type].w, h: DEFAULT_SIZE[w.type].h }, viewCol(), viewRow()), side: l.side.filter((x) => x.id !== id) }; });
  const moveSide = (id: string, dir: -1 | 1) => commit((l) => { const i = l.side.findIndex((x) => x.id === id), j = i + dir; if (j < 0 || j >= l.side.length) return l; const s = [...l.side]; [s[i], s[j]] = [s[j], s[i]]; return { ...l, side: s }; });

  // drag / resize with pointer capture; layout settles live so you see where it will land
  const down = (e: RPE, w: Widget, kind: Drag['kind'], where: 'main' | 'side') => {
    if (kind === 'move' && ((e.target as HTMLElement).closest('button, input, select, textarea, a') || w.pinned)) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    h().u.push(layout); h().r = [];
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
    const next = drag.kind === 'move' ? { ...s, x: s.x + cx, y: Math.max(0, s.y + cy) } : { ...s, w: Math.max(2, Math.min(COLS, CANVAS_COLS - s.x, s.w + cx)), h: Math.max(3, s.h + cy) };
    setLayout((l) => {
      const cur = l.main.find((w) => w.id === s.id);
      if (cur && cur.x === next.x && cur.y === next.y && cur.w === next.w && cur.h === next.h) return l;
      return { ...l, main: settle(l.main.map((w) => (w.id === s.id ? next : w)), s.id) };
    });
  };
  const up = () => { if (drag) { setLayout((l) => ({ ...l, main: settle(l.main) })); setDrag(null); bump((x) => x + 1); } };

  const chrome = (w: Widget, where: 'main' | 'side') => {
    const W = WIDGETS[w.type];
    const Body = W.make;
    const title = symFor(w.type) ? `${W.title}${w.cfg.sym ? ` · ${w.cfg.sym}` : ''}${w.cfg.sym && names[w.cfg.sym] ? ` · ${names[w.cfg.sym]}` : ''}` : W.title;
    return (
      <>
        <div className={`hw-head ${where} ${w.pinned ? 'pinned' : ''}`} onPointerDown={(e) => down(e, w, 'move', where)} onPointerMove={move} onPointerUp={up} title={where === 'main' ? (w.pinned ? 'Pinned: unpin to move' : 'Drag to move') : undefined}>
          <span className="hw-title">{title}</span>
          {where === 'main' && <button className={`hw-btn ${w.pinned ? 'on' : ''}`} onClick={() => togglePin(w.id)} title={w.pinned ? 'Unpin' : 'Pin in place (nothing can move it)'} aria-label={w.pinned ? 'Unpin widget' : 'Pin widget'} aria-pressed={!!w.pinned}>⌖</button>}
          {where === 'side' && <><button className="hw-btn" onClick={() => moveSide(w.id, -1)} title="Move up" aria-label="Move up">↑</button><button className="hw-btn" onClick={() => moveSide(w.id, 1)} title="Move down" aria-label="Move down">↓</button></>}
          <button className="hw-btn" onClick={() => (where === 'main' ? toSide(w.id) : toMain(w.id))} title={where === 'main' ? 'Send to the side bar' : 'Back to the main area'} aria-label={where === 'main' ? 'Send to side bar' : 'Back to main area'}>{where === 'main' ? '⇥' : '⇤'}</button>
          <button className="hw-btn" onClick={() => remove(w.id)} title="Remove widget" aria-label="Remove widget">×</button>
        </div>
        <div className="hw-body"><Body d={d} cfg={w.cfg} set={(c) => setCfg(w.id, c)} /></div>
      </>
    );
  };
  // the canvas always reaches at least two screens below the lowest widget, so there is room to put things further down
  const bottomRows = Math.max(0, ...layout.main.map((w) => w.y + w.h));
  const height = Math.max(bottomRows * (ROW + GAP) + vh * 2, vh * 3);
  const canvasW = CANVAS_COLS * (colW + GAP) - GAP;
  const panDown = (e: RPE) => {
    if (e.target !== e.currentTarget || !port.current) return; // only empty canvas pans
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, sl: port.current.scrollLeft, st: port.current.scrollTop };
  };
  const panMove = (e: RPE) => {
    if (pan.current && port.current) { port.current.scrollLeft = pan.current.sl - (e.clientX - pan.current.x); port.current.scrollTop = pan.current.st - (e.clientY - pan.current.y); return; }
    move(e);
  };
  const panUp = () => { if (pan.current) { pan.current = null; return; } up(); };
  // minimap: whole canvas scaled into a small box; click to jump there
  const MM_W = 168, mmScale = MM_W / canvasW, MM_H = Math.min(110, Math.max(46, height * mmScale));
  const lq = libQ.trim().toLowerCase();
  const libItem = (t: WidgetType, blurb: string) => (
    <div key={t} className="lib-item">
      <button className={`lib-pin ${pins.includes(t) ? 'on' : ''}`} onClick={() => setPins((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))} title={pins.includes(t) ? 'Unpin from the top' : 'Pin to the top of the library'} aria-label={`Pin ${WIDGETS[t].title}`}>★</button>
      <button className="lib-add" onClick={() => add(t, symFor(t) ? { sym: d.sel } : {})} title="Add to the workspace"><b>{WIDGETS[t].title}</b><span>{blurb}</span></button>
      <button className="lib-side" onClick={() => add(t, symFor(t) ? { sym: d.sel } : {}, 'side')} title="Add to the side bar" aria-label={`Add ${WIDGETS[t].title} to the side bar`}>⇥</button>
    </div>
  );
  const blurbOf = (t: WidgetType) => GROUPS.flatMap((g) => g.items).find((i) => i.type === t)?.blurb ?? '';

  return (
    <div className={`page home ${libOpen ? 'lib-on' : ''}`}>
      {libOpen && (
        <aside className="lib" aria-label="Widget library">
          <div className="lib-h"><b>WIDGETS</b><button className="hw-btn" onClick={() => setLibOpen(false)} title="Hide the library" aria-label="Hide widget library">«</button></div>
          <input className="lib-q" value={libQ} onChange={(e) => setLibQ(e.target.value)} placeholder="Search widgets…" aria-label="Search widgets" />
          {!lq && pins.length > 0 && <div className="lib-g"><div className="lib-gh">★ PINNED</div>{pins.map((t) => libItem(t, blurbOf(t)))}</div>}
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => !lq || WIDGETS[i.type].title.toLowerCase().includes(lq) || i.blurb.includes(lq));
            return items.length ? <div key={g.name} className="lib-g"><div className="lib-gh">{g.name.toUpperCase()} <span>{items.length}</span></div>{items.map((i) => libItem(i.type, i.blurb))}</div> : null;
          })}
        </aside>
      )}
      <div className="home-main">
        <div className="home-bar">
          {!libOpen && <button className="btn" onClick={() => setLibOpen(true)} title="Show the widget library">» Widgets</button>}
          <form onSubmit={search} className="home-search">
            <label className="sr-only" htmlFor="home-q">Search a ticker</label>
            <input id="home-q" list="home-tickers" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a ticker or company → adds a stock widget" autoComplete="off" spellCheck={false} />
            <datalist id="home-tickers">{tickers.slice(0, 300).map((t) => <option key={t.sym} value={t.sym}>{t.name}</option>)}</datalist>
            <button className="btn primary" type="submit">Add</button>
          </form>
        </div>
        <div className="home-port" ref={port} onScroll={(e) => setScroll({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop })}>
        <div className="home-grid" ref={area} style={{ height, width: canvasW }} onPointerDown={panDown} onPointerMove={panMove} onPointerUp={panUp}>
          {Array.from({ length: CANVAS_COLS / COLS - 1 }, (_, i) => <div key={i} className="home-screen-edge" style={{ left: (i + 1) * COLS * (colW + GAP) - GAP / 2 }} />)}
          {!layout.main.length && (
            <div className="home-empty">
              <p><b>{ws.name} is blank.</b> Make it yours.</p>
              <p className="muted">Search a ticker above, or pick from the widget library on the left. Drag a widget by its title bar, resize from its corner, pin it with ⌖, and send it to the side bar with ⇥. Workspaces live in the tabs at the bottom.</p>
            </div>
          )}
          {layout.main.map((w) => (
            <section key={w.id} className={`hw panel ${drag?.id === w.id ? 'dragging' : ''} ${w.pinned ? 'pinned' : ''}`} style={{ left: w.x * (colW + GAP), top: w.y * (ROW + GAP), width: w.w * colW + (w.w - 1) * GAP, height: w.h * ROW + (w.h - 1) * GAP }}>
              {chrome(w, 'main')}
              {!w.pinned && <div className="hw-size" onPointerDown={(e) => down(e, w, 'size', 'main')} onPointerMove={move} onPointerUp={up} title="Drag to resize" aria-hidden="true" />}
            </section>
          ))}
        </div>
        </div>
        <div className="home-mm" title="Map of this workspace. Click to jump; drag empty space or use Shift + arrows to move around." style={{ width: MM_W, height: MM_H }}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); panTo((e.clientX - r.left) / mmScale - width / 2, (e.clientY - r.top) / mmScale - vh / 2); }}>
          {layout.main.map((w) => <i key={w.id} className="home-mm-w" style={{ left: w.x * (colW + GAP) * mmScale, top: w.y * (ROW + GAP) * mmScale, width: Math.max(2, (w.w * colW + (w.w - 1) * GAP) * mmScale), height: Math.max(2, (w.h * ROW + (w.h - 1) * GAP) * mmScale) }} />)}
          <b className="home-mm-v" style={{ left: scroll.x * mmScale, top: scroll.y * mmScale, width: width * mmScale, height: vh * mmScale }} />
          {(scroll.x > 4 || scroll.y > 4) && <button className="home-mm-home" onClick={(e) => { e.stopPropagation(); panTo(0, 0); }} title="Back to the top-left">⌂</button>}
        </div>
      </div>
      <aside className="home-side" aria-label="Side bar">
        <div className="home-side-h"><b>SIDE BAR</b><span className="muted small">scroll · ⇤ to move back</span></div>
        {!layout.side.length && <p className="small muted home-side-empty">Your second screen. Send widgets here with ⇥ and scroll through them.</p>}
        {layout.side.map((w) => (
          <section key={w.id} className="hw panel side" style={{ height: w.h * ROW + (w.h - 1) * GAP }}>
            {chrome(w, 'side')}
            <div className="hw-size" onPointerDown={(e) => down(e, w, 'size', 'side')} onPointerMove={move} onPointerUp={up} title="Drag to change height" aria-hidden="true" />
          </section>
        ))}
      </aside>
      <div className="ws-bar">
        <div className="ws-tabs" role="tablist" aria-label="Workspaces">
          {spaces.list.map((w) => (
            <div key={w.id} className={`ws-tab ${w.id === ws.id ? 'on' : ''}`} role="tab" aria-selected={w.id === ws.id}>
              {renaming === w.id
                ? <input autoFocus defaultValue={w.name} onBlur={(e) => { rename(w.id, e.target.value); setRenaming(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} aria-label="Workspace name" />
                : <button onClick={() => setSpaces((s) => ({ ...s, active: w.id }))} onDoubleClick={() => setRenaming(w.id)} title="Double-click to rename">{w.name}</button>}
              {spaces.list.length > 1 && <button className="ws-x" onClick={() => closeSpace(w.id)} aria-label={`Close ${w.name}`}>×</button>}
            </div>
          ))}
          <button className="ws-add" onClick={addSpace} title="New workspace" aria-label="New workspace">+</button>
        </div>
        <div className="ws-actions">
          <button onClick={undo} disabled={!h().u.length} title="Undo (Ctrl/⌘ Z)">↶ Undo</button>
          <button onClick={redo} disabled={!h().r.length} title="Redo (Ctrl/⌘ Shift Z)">↷ Redo</button>
          <button onClick={restore} disabled={!ws.saved} title={ws.savedAt ? `Go back to the save point from ${new Date(ws.savedAt).toLocaleString()}` : 'No save point yet'}>Restore</button>
          <button onClick={clear} disabled={!layout.main.length && !layout.side.length} title="Remove every widget (Undo brings them back)">Clear</button>
          <button className="ws-save" onClick={savePoint} title="Changes save automatically. This marks a save point you can Restore to.">{ws.savedAt ? `Saved ${new Date(ws.savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Save point'}</button>
        </div>
      </div>
    </div>
  );
}
