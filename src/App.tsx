import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Layout, Mode, OrMinutes, Overlay, Quote, RightTab, TF } from './types';
import { clock, et, etTime, hms, modeLabel } from './lib/clock';
import { DEMO_ALERTS, DEMO_AT, INDEXES, defaultBoards, makeHeadlines, makeQuotes } from './lib/demo';
import { DEFAULT_LAYOUTS } from './lib/layout';
import { usePersisted } from './lib/store';
import { pct, px, tone } from './lib/format';
import { computeLevels, detectLevelEvents, LEVEL_SHORT, type LevelEvent } from './lib/levels';
import { encodeInstant } from '../shared/parse';
import { patchWithQuote, useDataMode, useMacro, useQuotes, useSeries, type SeriesState } from './data/live';
import { TopStrip } from './components/TopStrip';
import { Watchlist, orderedWatchlist } from './components/Watchlist';
import { ChartPanel } from './components/Chart';
import { LevelsPanel, type LevelCol } from './components/Levels';
import { QuickJournal, RightRail, type NewsFilter, type ScanFilter } from './components/RightRail';
import { AccountDrawer, CommandBar, NewsTicker, OverlayView, type Cmd } from './components/Bits';
import { Fresh, Seg, popout } from './components/common';

const DEMO_QUOTES = makeQuotes();
const HEADLINES = makeHeadlines(Object.keys(DEMO_QUOTES).filter((s) => !INDEXES.includes(s)));
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

const params = new URLSearchParams(location.search);
const POPOUT = params.get('panel'); // chart | watchlist | right | ticker

interface AlertItem { t: number; sym: string; text: string }

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

const blankQuote = (sym: string, name = sym): Quote => ({ sym, name, last: NaN, chgPct: NaN, rvol: NaN, rs5: NaN, rs20: NaN, rs60: NaN, rsRank: NaN, gapPct: NaN, pmVol: NaN, flags: [] });

function beep() {
  try {
    const a = new AudioContext();
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.25);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + 0.25);
  } catch { /* no audio */ }
}

/** Freshness of a panel built from several sources = the weakest one. */
function worst(...f: Freshness[]): Freshness {
  const order: Freshness[] = ['demo', 'nodata', 'unavailable', 'pending', 'eod', 'delayed', 'live'];
  return f.reduce((a, b) => (order.indexOf(a) <= order.indexOf(b) ? a : b));
}

export default function App() {
  const now = useNow();
  const clk = useMemo(() => clock(now), [now]);
  const isMobile = useMedia('(max-width: 760px)');
  const dataMode = useDataMode();
  const live = dataMode.kind === 'live';

  const [theme, setTheme] = usePersisted<'light' | 'dark'>('theme', 'light');
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [setTheme]);

  const [boards, setBoards] = usePersisted<Record<string, Board>>('boards', () => defaultBoards(DEMO_QUOTES));
  const [sel, setSelRaw] = useState<string>((params.get('sym') || 'SPY').toUpperCase());
  const [override, setOverride] = usePersisted<Mode | null>('modeOverride', null);
  const mode: Mode = override ?? clk.mode;

  // Saved layouts per market-clock mode; whatever you change is saved to the current mode.
  const [layouts, setLayouts] = usePersisted<Partial<Record<Mode, Layout>>>('layouts', {});
  const layout: Layout = { levelsOpen: true, ...DEFAULT_LAYOUTS[mode], ...layouts[mode] };
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
  const [orMin, setOrMin] = usePersisted<OrMinutes>('orMinutes', 15);
  const [alertsOn, setAlertsOn] = usePersisted<Record<string, boolean>>('alertsOn', { SPY: true, QQQ: true });
  const [alertLog, setAlertLog] = usePersisted<AlertItem[]>('alertLog', []);
  const [toast, setToast] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((m: string, ms = 2200) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), ms); }, []);

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

  /* ---------------- data ---------------- */
  const wlSyms = useMemo(() => Object.keys(boards), [boards]);
  const quoteSyms = useMemo(() => [...new Set([...INDEXES, sel, ...wlSyms])].slice(0, 40), [wlSyms, sel]);
  const qs = useQuotes(quoteSyms, dataMode);
  const macro = useMacro(dataMode);

  // In live mode only real fields are shown; scanner/RS fields stay empty until Milestone 3.
  const quotes: Record<string, Quote> = useMemo(() => {
    if (!live) return DEMO_QUOTES[sel] ? DEMO_QUOTES : { ...DEMO_QUOTES, [sel]: blankQuote(sel) };
    const out: Record<string, Quote> = {};
    for (const s of new Set([...Object.keys(DEMO_QUOTES), ...quoteSyms])) {
      const lq = qs?.quotes[s];
      out[s] = { ...blankQuote(s, DEMO_QUOTES[s]?.name), last: lq?.last ?? NaN, chgPct: lq?.chgPct ?? NaN };
    }
    return out;
  }, [live, qs, quoteSyms, sel]);
  const tickers = useMemo(() => Object.values(quotes).map((q) => ({ sym: q.sym, name: q.name })), [quotes]);

  const demoLast = (s: string) => DEMO_QUOTES[s]?.last ?? 100;
  const spyD = useSeries('SPY', 'D', dataMode, demoLast('SPY'));
  const spy5 = useSeries('SPY', '5m', dataMode, demoLast('SPY'));
  const qqqD = useSeries('QQQ', 'D', dataMode, demoLast('QQQ'));
  const qqq5 = useSeries('QQQ', '5m', dataMode, demoLast('QQQ'));
  const selD = useSeries(sel, 'D', dataMode, demoLast(sel));
  const sel5 = useSeries(sel, '5m', dataMode, demoLast(sel));
  const selTf = useSeries(sel, layout.tf, dataMode, demoLast(sel));

  const patch = useCallback(
    (st: SeriesState, sym: string, tf: TF): SeriesState => (live ? { ...st, bars: patchWithQuote(st.bars, qs?.quotes[sym], tf) } : st),
    [live, qs],
  );
  const nowEnc = encodeInstant(now);
  const sessionDay = useMemo(() => {
    const e = et(now);
    return e.wd >= 1 && e.wd <= 5 ? Math.floor(nowEnc / 86400) : undefined; // weekends: last bars' session
  }, [Math.floor(nowEnc / 86400)]); // eslint-disable-line react-hooks/exhaustive-deps

  const levelCol = useCallback(
    (sym: string, d: SeriesState, i5: SeriesState): LevelCol => {
      const daily = patch(d, sym, 'D').bars, intra = patch(i5, sym, '5m').bars;
      const day = live ? sessionDay : undefined;
      return {
        sym,
        last: live ? quotes[sym]?.last ?? (intra.at(-1)?.close ?? NaN) : intra.at(-1)?.close ?? NaN,
        levels: computeLevels({ daily, intraday: intra, orMinutes: orMin, hasExtendedHours: false, sessionDay: day, nowEnc }),
        freshness: worst(d.freshness, i5.freshness),
        asOf: i5.asOf || d.asOf || undefined,
        source: [...new Set([d.source, i5.source].filter(Boolean))].join(' + '),
        error: i5.error || d.error,
      };
    },
    // recompute when bars, quotes or the OR setting change (not every clock tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch, orMin, live, sessionDay, quotes, Math.floor(nowEnc / 60)],
  );
  const cols = useMemo(() => {
    const c = [levelCol('SPY', spyD, spy5), levelCol('QQQ', qqqD, qqq5)];
    if (!INDEXES.includes(sel)) c.push(levelCol(sel, selD, sel5));
    return c;
  }, [levelCol, spyD, spy5, qqqD, qqq5, selD, sel5, sel]);
  const selLevels = cols.find((c) => c.sym === sel)?.levels ?? [];
  const chartSeries = useMemo(() => patch(selTf, sel, layout.tf), [patch, selTf, sel, layout.tf]);

  /* ---------------- level alerts (touch / break) ---------------- */
  const prevPx = useRef<Record<string, number>>({});
  const cool = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!live || !qs) return;
    const fired: LevelEvent[] = [];
    for (const c of cols) {
      const cur = qs.quotes[c.sym]?.last;
      const prev = prevPx.current[c.sym];
      if (Number.isFinite(cur)) prevPx.current[c.sym] = cur;
      if (!alertsOn[c.sym] || prev == null || !Number.isFinite(cur) || prev === cur) continue;
      for (const ev of detectLevelEvents(c.sym, prev, cur, c.levels)) {
        const k = `${ev.sym}:${ev.id}:${ev.kind}`;
        if (Date.now() - (cool.current[k] ?? 0) < 5 * 60_000) continue;
        cool.current[k] = Date.now();
        fired.push(ev);
      }
    }
    if (!fired.length) return;
    const items = fired.map((ev) => ({ t: Date.now(), sym: ev.sym, text: `${ev.sym} ${ev.kind === 'break' ? `broke ${ev.dir === 'up' ? 'above' : 'below'}` : 'touched'} ${LEVEL_SHORT[ev.id]} ${px(ev.level)} (last ${px(ev.price)})` }));
    setAlertLog((l) => [...items, ...l].slice(0, 100));
    flash(items[0].text, 6000);
    beep();
    try {
      if (Notification.permission === 'granted') for (const it of items) new Notification(it.text, { tag: it.text });
    } catch { /* not supported */ }
  }, [qs?.asOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAlerts = (s: string) => {
    setAlertsOn((a) => ({ ...a, [s]: !a[s] }));
    try { if (Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
  };

  /* ---------------- watchlist actions ---------------- */
  const setBoard = (s: string, b: Board) => setBoards((x) => ({ ...x, [s]: b }));
  const removeSym = (s: string) => setBoards((x) => { const y = { ...x }; delete y[s]; return y; });
  const addSym = (s: string) => { setBoards((x) => (x[s] ? x : { ...x, [s]: 'watching' })); flash(`${s} added to Watching`); };

  const order = useMemo(() => [...INDEXES, ...orderedWatchlist(quotes, boards)], [quotes, boards]);
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
    { id: 'levels', label: 'Show/hide levels panel', hint: 'L', run: () => setLayout({ levelsOpen: !layout.levelsOpen }) },
    { id: 'or5', label: 'Opening range: 5 minutes', run: () => setOrMin(5) },
    { id: 'or15', label: 'Opening range: 15 minutes', run: () => setOrMin(15) },
    { id: 'or30', label: 'Opening range: 30 minutes', run: () => setOrMin(30) },
    { id: 'alerts', label: `Toggle level alerts for ${sel}`, run: () => toggleAlerts(sel) },
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
      const map: Record<string, () => void> = {
        m: () => setOverlay((o) => (o === 'map' ? null : 'map')),
        g: () => setOverlay((o) => (o === 'globe' ? null : 'globe')),
        '?': () => setOverlay((o) => (o === 'help' ? null : 'help')),
        t: toggleTheme,
        a: () => setDrawer((d) => !d),
        l: () => setLayout({ levelsOpen: !layout.levelsOpen }),
        '1': () => setTf('D'), '2': () => setTf('1H'), '3': () => setTf('5m'),
        n: () => setTab('news'), s: () => setTab('scanner'), q: () => setTab('journal'), r: () => setTab('risk'),
        '[': () => setLayout({ leftOpen: !layout.leftOpen }),
        ']': () => setLayout({ rightOpen: !layout.rightOpen }),
        b: () => setLayout({ tickerOpen: !layout.tickerOpen }),
        ArrowDown: () => move(1), j: () => move(1),
        ArrowUp: () => move(-1), k: () => move(-1),
      };
      const fn = map[e.key] ?? map[e.key.toLowerCase()];
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

  const q = quotes[sel] ?? blankQuote(sel);
  const quoteFresh: Freshness = live ? (qs ? (qs.error && !Object.keys(qs.quotes).length ? 'nodata' : 'live') : 'pending') : 'demo';
  const wlProps = {
    quotes, boards, setBoard, removeSym, sel, onSelect: setSel,
    fresh: quoteFresh, asOf: live ? qs?.asOf : DEMO_AT, source: live ? qs?.source : 'Generated sample quotes', rsPending: live,
  };
  const rightProps = {
    tab: layout.tab, onTab: setTab, quotes, scanQuotes: DEMO_QUOTES, boards, headlines: HEADLINES, sel, onSelect: setSel, addSym,
    newsFilter, setNewsFilter, scanFilter, setScanFilter,
  };
  const chart = (onPopout?: () => void) => (
    <ChartPanel
      sym={sel} name={q.name} last={live ? q.last : chartSeries.bars.at(-1)?.close ?? q.last} chgPct={q.chgPct}
      tf={layout.tf} onTf={setTf} theme={theme} series={chartSeries} levels={selLevels} onPopout={onPopout}
    />
  );
  const levelsPanel = (
    <LevelsPanel cols={cols} orMin={orMin} setOrMin={setOrMin} alertsOn={alertsOn} toggleAlerts={toggleAlerts} onSelect={setSel} sel={sel} onClose={() => setLayout({ levelsOpen: false })} />
  );
  const dataLine =
    dataMode.kind === 'checking' ? 'Data: checking…'
      : dataMode.kind === 'demo' ? `Data: DEMO (${dataMode.reason})`
        : `Data: live via ${Object.entries(dataMode.health.providers).filter(([, v]) => v).map(([k]) => k).join(', ')}`;

  /* ---------- Popped-out single panel ---------- */
  if (POPOUT) {
    return (
      <div className="popout">
        {POPOUT === 'chart' && <div className="center">{chart()}{layout.levelsOpen && levelsPanel}</div>}
        {POPOUT === 'watchlist' && <Watchlist {...wlProps} />}
        {POPOUT === 'right' && <RightRail {...rightProps} />}
        {POPOUT === 'ticker' && <NewsTicker headlines={HEADLINES} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  /* ---------- Mobile companion ---------- */
  if (isMobile) return <Mobile clk={clk} quotes={quotes} wlProps={wlProps} live={live} alertLog={alertLog} sel={sel} />;

  /* ---------- Desk ---------- */
  const cols3 = `${layout.leftOpen ? `${layout.left}px 5px` : '0 0'} minmax(0,1fr) ${layout.rightOpen ? `5px ${layout.right}px` : '0 0'}`;
  return (
    <div className={`app ${layout.tickerOpen ? '' : 'no-ticker'}`}>
      <TopStrip
        quotes={quotes} clk={clk} mode={mode} override={override} onOverride={setOverride} onSelect={setSel}
        onAccount={() => setDrawer((d) => !d)} accountOpen={drawer} theme={theme} onTheme={toggleTheme} onCmd={() => setCmdOpen(true)}
        quoteFresh={quoteFresh} quoteAsOf={live ? qs?.asOf : DEMO_AT} quoteSource={live ? qs?.source : 'Generated sample quotes'} macro={macro} live={live}
      />
      <main className="main" style={{ gridTemplateColumns: cols3 }}>
        <div className="rail-slot">{layout.leftOpen && <Watchlist {...wlProps} onPopout={() => popout('watchlist', sel)} />}</div>
        <div className={`gutter ${layout.leftOpen ? '' : 'hidden'}`} onPointerDown={drag('left')} title="Drag to resize · [ to hide" />
        <div className="center">
          {chart(() => popout('chart', sel))}
          {layout.levelsOpen && levelsPanel}
        </div>
        <div className={`gutter ${layout.rightOpen ? '' : 'hidden'}`} onPointerDown={drag('right')} title="Drag to resize · ] to hide" />
        <div className="rail-slot">{layout.rightOpen && <RightRail {...rightProps} onPopout={() => popout('right', sel)} />}</div>
      </main>
      {layout.tickerOpen && <NewsTicker headlines={HEADLINES} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}

      <div className="statusbar">
        <span>Layout: <b>{modeLabel(mode)}</b>{override ? ' (manual)' : ' (auto)'}, changes save to this mode</span>
        <span className={live ? '' : 'demo-txt'}>{dataLine}</span>
        <span className="muted">Press <kbd className="kbd">?</kbd> for shortcuts</span>
      </div>

      <CommandBar
        open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} tickers={tickers} onTicker={setSel}
        allowAny={live ? (s) => SYMBOL_RE.test(s) : undefined}
      />
      <AccountDrawer open={drawer} onClose={() => setDrawer(false)} theme={theme} />
      {overlay && <OverlayView kind={overlay} onClose={() => setOverlay(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Mobile({ clk, quotes, wlProps, live, alertLog, sel }: {
  clk: ReturnType<typeof clock>; quotes: Record<string, Quote>; wlProps: Parameters<typeof Watchlist>[0];
  live: boolean; alertLog: AlertItem[]; sel: string;
}) {
  const [tab, setTab] = useState<'watch' | 'alerts' | 'journal'>('watch');
  const alerts = live ? alertLog : DEMO_ALERTS.map((a) => ({ ...a, sym: '' }));
  return (
    <div className="mobile">
      <header className="m-top">
        <span className="brand">DESK</span>
        {INDEXES.map((s) => (
          <span key={s} className="m-idx"><b>{s}</b> <span className="num">{px(quotes[s].last)}</span> <span className={`num ${tone(quotes[s].chgPct)}`}>{pct(quotes[s].chgPct)}</span></span>
        ))}
        <span className="num muted m-clock">{etTime(clk.now)} ET · {clk.toClose != null ? `close ${hms(clk.toClose)}` : `open ${hms(clk.toOpen ?? 0)}`}</span>
      </header>
      <div className="m-tabs">
        <Seg value={tab} onChange={setTab} options={[{ id: 'watch', label: 'Watchlist' }, { id: 'alerts', label: 'Alerts' }, { id: 'journal', label: 'Journal' }]} />
      </div>
      <div className="m-body">
        {tab === 'watch' && <Watchlist {...wlProps} compact />}
        {tab === 'alerts' && (
          <section className="panel">
            <div className="phead"><div className="phead-title">Alerts</div><div className="phead-ctl" /><Fresh kind={live ? 'live' : 'demo'} at={live ? undefined : DEMO_AT} /></div>
            <ul className="news">
              {alerts.map((a, i) => <li key={i}><span className="num muted">{etTime(a.t)}</span><span className="news-t">{a.text}</span></li>)}
              {!alerts.length && <li className="muted">No level alerts yet. They fire on touch or break of SPY/QQQ levels (toggle per ticker on the desk).</li>}
            </ul>
          </section>
        )}
        {tab === 'journal' && <section className="panel"><QuickJournal sym={sel} quotes={quotes} /></section>}
      </div>
    </div>
  );
}
