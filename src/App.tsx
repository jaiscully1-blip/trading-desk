import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Layout, Mode, Overlay, RightTab, TF } from './types';
import { clock, etTime, hms, modeLabel } from './lib/clock';
import { DEMO_ALERTS, DEMO_AT, INDEXES, defaultBoards, makeHeadlines, makeQuotes } from './lib/demo';
import { DEFAULT_LAYOUTS } from './lib/layout';
import { usePersisted } from './lib/store';
import { pct, px, tone } from './lib/format';
import { TopStrip } from './components/TopStrip';
import { Watchlist, orderedWatchlist } from './components/Watchlist';
import { ChartPanel } from './components/Chart';
import { QuickJournal, RightRail, type NewsFilter, type ScanFilter } from './components/RightRail';
import { AccountDrawer, CommandBar, NewsTicker, OverlayView, type Cmd } from './components/Bits';
import { Fresh, Seg, popout } from './components/common';

const QUOTES = makeQuotes();
const TICKERS = Object.values(QUOTES).map((q) => ({ sym: q.sym, name: q.name }));
const HEADLINES = makeHeadlines(Object.keys(QUOTES).filter((s) => !INDEXES.includes(s)));

const params = new URLSearchParams(location.search);
const POPOUT = params.get('panel'); // chart | watchlist | right | ticker

function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function useMedia(q: string) {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

export default function App() {
  const now = useNow();
  const clk = useMemo(() => clock(now), [now]);
  const isMobile = useMedia('(max-width: 760px)');

  const [theme, setTheme] = usePersisted<'light' | 'dark'>('theme', 'light');
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [setTheme]);

  const [boards, setBoards] = usePersisted<Record<string, Board>>('boards', () => defaultBoards(QUOTES));
  const [sel, setSelRaw] = useState<string>(params.get('sym') || 'SPY');
  const [override, setOverride] = usePersisted<Mode | null>('modeOverride', null);
  const mode: Mode = override ?? clk.mode;

  // Saved layouts per market-clock mode; whatever you change is saved to the current mode.
  const [layouts, setLayouts] = usePersisted<Partial<Record<Mode, Layout>>>('layouts', {});
  const layout: Layout = { ...DEFAULT_LAYOUTS[mode], ...layouts[mode] };
  const setLayout = useCallback(
    (patch: Partial<Layout>) => setLayouts((all) => ({ ...all, [mode]: { ...DEFAULT_LAYOUTS[mode], ...all[mode], ...patch } })),
    [mode, setLayouts],
  );

  const [cmdOpen, setCmdOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [drawer, setDrawer] = useState(false);
  const [newsFilter, setNewsFilter] = usePersisted<NewsFilter>('newsFilter', 'all');
  const [scanFilter, setScanFilter] = usePersisted<ScanFilter>('scanFilter', 'all');
  const [watchOnly, setWatchOnly] = usePersisted('tickerWatchOnly', false);
  const [toast, setToast] = useState('');
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  // Sync the selected ticker across popped-out windows
  const bc = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    try {
      bc.current = new BroadcastChannel('trading-desk');
      bc.current.onmessage = (e) => e.data?.sym && setSelRaw(e.data.sym);
    } catch { /* not supported */ }
    return () => bc.current?.close();
  }, []);
  const setSel = useCallback((s: string) => {
    setSelRaw(s);
    bc.current?.postMessage({ sym: s });
  }, []);

  const setBoard = (s: string, b: Board) => setBoards((x) => ({ ...x, [s]: b }));
  const removeSym = (s: string) => setBoards((x) => { const y = { ...x }; delete y[s]; return y; });
  const addSym = (s: string) => { setBoards((x) => (x[s] ? x : { ...x, [s]: 'watching' })); flash(`${s} added to Watching`); };

  const order = useMemo(() => [...INDEXES, ...orderedWatchlist(QUOTES, boards)], [boards]);
  const move = (d: 1 | -1) => {
    const i = order.indexOf(sel);
    const n = order[Math.max(0, Math.min(order.length - 1, (i < 0 ? 0 : i) + d))];
    if (n) setSel(n);
  };

  const setTab = (t: RightTab) => setLayout({ tab: t, rightOpen: true });
  const setTf = (tf: TF) => setLayout({ tf });

  const commands: Cmd[] = [
    { id: 'gappers', label: 'Scanner: gappers ≥3%', run: () => { setScanFilter('gappers'); setTab('scanner'); } },
    { id: 'scanner', label: 'Open scanner', hint: 'S', run: () => setTab('scanner') },
    { id: 'rvol', label: 'Scanner: relative volume ≥2', run: () => { setScanFilter('rvol'); setTab('scanner'); } },
    { id: 'highs', label: 'Scanner: 52-week highs', run: () => { setScanFilter('hi52'); setTab('scanner'); } },
    { id: 'news', label: 'Open news', hint: 'N', run: () => setTab('news') },
    { id: 'journal', label: 'Open quick journal', hint: 'Q', run: () => setTab('journal') },
    { id: 'risk', label: 'Open risk / position size', hint: 'R', run: () => setTab('risk') },
    { id: 'account', label: 'Open account drawer', hint: 'A', run: () => setDrawer(true) },
    { id: 'map', label: 'World map overlay', hint: 'M', run: () => setOverlay('map') },
    { id: 'globe', label: 'Money flow globe overlay', hint: 'G', run: () => setOverlay('globe') },
    { id: 'd', label: 'Chart: daily', hint: '1', run: () => setTf('D') },
    { id: '1h', label: 'Chart: 1-hour', hint: '2', run: () => setTf('1H') },
    { id: '5m', label: 'Chart: 5-minute', hint: '3', run: () => setTf('5m') },
    { id: 'theme', label: 'Toggle light / dark', hint: 'T', run: toggleTheme },
    { id: 'popout', label: 'Pop chart out to a new window', run: () => popout('chart', sel) },
    { id: 'layout-reset', label: `Reset layout for ${modeLabel(mode)}`, run: () => { setLayouts((a) => { const b = { ...a }; delete b[mode]; return b; }); flash(`Layout reset for ${modeLabel(mode)}`); } },
    { id: 'mode-auto', label: 'Market-clock mode: auto', run: () => setOverride(null) },
    { id: 'mode-pre', label: 'Mode override: pre-market', run: () => setOverride('pre') },
    { id: 'mode-open', label: 'Mode override: open', run: () => setOverride('open') },
    { id: 'mode-midday', label: 'Mode override: midday', run: () => setOverride('midday') },
    { id: 'mode-power', label: 'Mode override: power hour', run: () => setOverride('power') },
    { id: 'mode-after', label: 'Mode override: after-hours & review', run: () => setOverride('after') },
    { id: 'help', label: 'Keyboard shortcuts', hint: '?', run: () => setOverlay('help') },
  ];

  // Keyboard-first
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((o) => !o); return; }
      if (e.key === 'Escape') { setCmdOpen(false); setOverlay(null); setDrawer(false); return; }
      if (cmdOpen || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const map: Record<string, () => void> = {
        m: () => setOverlay((o) => (o === 'map' ? null : 'map')),
        g: () => setOverlay((o) => (o === 'globe' ? null : 'globe')),
        '?': () => setOverlay((o) => (o === 'help' ? null : 'help')),
        t: toggleTheme,
        a: () => setDrawer((d) => !d),
        '1': () => setTf('D'), '2': () => setTf('1H'), '3': () => setTf('5m'),
        n: () => setTab('news'), s: () => setTab('scanner'), q: () => setTab('journal'), r: () => setTab('risk'),
        '[': () => setLayout({ leftOpen: !layout.leftOpen }),
        ']': () => setLayout({ rightOpen: !layout.rightOpen }),
        b: () => setLayout({ tickerOpen: !layout.tickerOpen }),
        ArrowDown: () => move(1), j: () => move(1),
        ArrowUp: () => move(-1), k: () => move(-1),
      };
      const fn = map[k] ?? map[k.toLowerCase()];
      if (fn) { e.preventDefault(); fn(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  // Rail resizing
  const drag = (side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = side === 'left' ? layout.left : layout.right;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - x0;
      const w = Math.max(200, Math.min(520, side === 'left' ? w0 + dx : w0 - dx));
      setLayout(side === 'left' ? { left: w } : { right: w });
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const q = QUOTES[sel] ?? QUOTES.SPY;
  const rightProps = {
    tab: layout.tab, onTab: setTab, quotes: QUOTES, boards, headlines: HEADLINES, sel, onSelect: setSel, addSym,
    newsFilter, setNewsFilter, scanFilter, setScanFilter,
  };

  /* ---------- Popped-out single panel ---------- */
  if (POPOUT) {
    return (
      <div className="popout">
        {POPOUT === 'chart' && <ChartPanel q={q} tf={layout.tf} onTf={setTf} theme={theme} />}
        {POPOUT === 'watchlist' && <Watchlist quotes={QUOTES} boards={boards} setBoard={setBoard} removeSym={removeSym} sel={sel} onSelect={setSel} />}
        {POPOUT === 'right' && <RightRail {...rightProps} />}
        {POPOUT === 'ticker' && <NewsTicker headlines={HEADLINES} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}
      </div>
    );
  }

  /* ---------- Mobile companion ---------- */
  if (isMobile) return <Mobile clk={clk} boards={boards} sel={sel} setSel={setSel} setBoard={setBoard} removeSym={removeSym} />;

  /* ---------- Desk ---------- */
  const cols = `${layout.leftOpen ? `${layout.left}px 5px` : '0 0'} minmax(0,1fr) ${layout.rightOpen ? `5px ${layout.right}px` : '0 0'}`;
  return (
    <div className={`app ${layout.tickerOpen ? '' : 'no-ticker'}`}>
      <TopStrip
        quotes={QUOTES} clk={clk} mode={mode} override={override} onOverride={setOverride} onSelect={setSel}
        onAccount={() => setDrawer((d) => !d)} accountOpen={drawer} theme={theme} onTheme={toggleTheme} onCmd={() => setCmdOpen(true)}
      />
      <main className="main" style={{ gridTemplateColumns: cols }}>
        <div className="rail-slot">{layout.leftOpen && <Watchlist quotes={QUOTES} boards={boards} setBoard={setBoard} removeSym={removeSym} sel={sel} onSelect={setSel} onPopout={() => popout('watchlist', sel)} />}</div>
        <div className={`gutter ${layout.leftOpen ? '' : 'hidden'}`} onPointerDown={drag('left')} title="Drag to resize · [ to hide" />
        <ChartPanel q={q} tf={layout.tf} onTf={setTf} theme={theme} onPopout={() => popout('chart', sel)} />
        <div className={`gutter ${layout.rightOpen ? '' : 'hidden'}`} onPointerDown={drag('right')} title="Drag to resize · ] to hide" />
        <div className="rail-slot">{layout.rightOpen && <RightRail {...rightProps} onPopout={() => popout('right', sel)} />}</div>
      </main>
      {layout.tickerOpen && <NewsTicker headlines={HEADLINES} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}

      <div className="statusbar">
        <span>Layout: <b>{modeLabel(mode)}</b>{override ? ' (manual)' : ' (auto)'}, changes save to this mode</span>
        <span className="muted">Press <kbd className="kbd">?</kbd> for shortcuts</span>
      </div>

      <CommandBar open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} tickers={TICKERS} onTicker={setSel} />
      <AccountDrawer open={drawer} onClose={() => setDrawer(false)} theme={theme} />
      {overlay && <OverlayView kind={overlay} onClose={() => setOverlay(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Mobile({ clk, boards, sel, setSel, setBoard, removeSym }: { clk: ReturnType<typeof clock>; boards: Record<string, Board>; sel: string; setSel: (s: string) => void; setBoard: (s: string, b: Board) => void; removeSym: (s: string) => void }) {
  const [tab, setTab] = useState<'watch' | 'alerts' | 'journal'>('watch');
  return (
    <div className="mobile">
      <header className="m-top">
        <span className="brand">DESK</span>
        {INDEXES.map((s) => (
          <span key={s} className="m-idx"><b>{s}</b> <span className="num">{px(QUOTES[s].last)}</span> <span className={`num ${tone(QUOTES[s].chgPct)}`}>{pct(QUOTES[s].chgPct)}</span></span>
        ))}
        <span className="num muted m-clock">{etTime(clk.now)} ET · {clk.toClose != null ? `close ${hms(clk.toClose)}` : `open ${hms(clk.toOpen ?? 0)}`}</span>
      </header>
      <div className="m-tabs">
        <Seg value={tab} onChange={setTab} options={[{ id: 'watch', label: 'Watchlist' }, { id: 'alerts', label: 'Alerts' }, { id: 'journal', label: 'Journal' }]} />
      </div>
      <div className="m-body">
        {tab === 'watch' && <Watchlist quotes={QUOTES} boards={boards} setBoard={setBoard} removeSym={removeSym} sel={sel} onSelect={setSel} compact />}
        {tab === 'alerts' && (
          <section className="panel">
            <div className="phead"><div className="phead-title">Alerts</div><div className="phead-ctl" /><Fresh kind="demo" at={DEMO_AT} /></div>
            <ul className="news">
              {DEMO_ALERTS.map((a, i) => <li key={i}><span className="num muted">{etTime(a.t)}</span><span className="news-t">{a.text}</span></li>)}
            </ul>
            <p className="note">Level alerts (touch/break) are wired in Milestone 2.</p>
          </section>
        )}
        {tab === 'journal' && <section className="panel"><QuickJournal sym={sel} quotes={QUOTES} /></section>}
      </div>
    </div>
  );
}
