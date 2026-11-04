import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Layout, Mode, OrMinutes, Overlay, Quote, RightTab, TF } from './types';
import { clock, et, etTime, hms, modeLabel } from './lib/clock';
import { DEMO_ALERTS, DEMO_AT, INDEXES, defaultBoards, makeHeadlines, makeQuotes } from './lib/demo';
import type { ReactNode } from 'react';
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
import { RightRail, type NewsFilter } from './components/RightRail';
import { CheckInDialog, OpenPositions, RiskPanel, TradeTicket, uid } from './components/Trading';
import { AccountDrawer, JournalOverlay } from './components/Journal';
import { useIdbState } from './lib/idb';
import { DEFAULT_SETTINGS, etDay, guard, viewTrade, violations as findViolations, type AccountSettings, type CheckIn, type Trade, type Transfer } from './lib/journal';
import { Scanner } from './components/Scanner';
import { PlaybookEditor } from './components/Playbooks';
import { useMovers, useScan, useUniverse } from './data/scan';
import { useCalendar, useNews } from './data/news';
import { Calendars } from './components/Calendars';
import { FearStrip } from './components/FearStrip';
import { cloudConfigured, signIn, signOut, useCloudItems, useCloudSync, useCloudUser } from './data/cloud';
import { DEFAULT_THRESHOLDS, liveRow, rankRs, type ScanRow } from '../shared/scan';
import { DEFAULT_PLAYBOOKS, gradeRow, type GradeResult, type Playbook, type SavedFilter } from './lib/playbook';
import { CommandBar, NewsTicker, OverlayView, type Cmd } from './components/Bits';
import { Fresh, Seg, popout } from './components/common';

const DEMO_QUOTES = makeQuotes();
const HEADLINES = makeHeadlines(Object.keys(DEMO_QUOTES).filter((s) => !INDEXES.includes(s)));
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const DEFAULT_SCAN_LIST = ['NVDA', 'AMD', 'TSLA', 'PLTR', 'META', 'AAPL', 'MSFT', 'AMZN', 'AVGO', 'COIN', 'MSTR', 'HOOD', 'SOFI', 'RKLB', 'IONQ', 'CRWD', 'SHOP', 'ANET', 'ARM', 'MU', 'NFLX', 'UBER', 'SMCI', 'CELH'];

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
  const [filterId, setFilterId] = usePersisted<string>('scanFilterId', 'all');
  const [filters, setFilters] = usePersisted<SavedFilter[]>('savedFilters', []);
  const [playbooks, setPlaybooks] = usePersisted<Playbook[]>('playbooks', DEFAULT_PLAYBOOKS);
  const [scanList, setScanList] = usePersisted<string[]>('scanList', DEFAULT_SCAN_LIST);
  const [scanPrefs, setScanPrefs] = usePersisted<{ playbookId: string; includeMovers: boolean }>('scanPrefs', { playbookId: DEFAULT_PLAYBOOKS[0].id, includeMovers: false });
  const [pbOpen, setPbOpen] = useState(false);
  const [jnOpen, setJnOpen] = useState(false);
  const [ciOpen, setCiOpen] = useState(false);
  // Journal lives in IndexedDB (screenshots); account rules are small and live with the other settings
  const [trades, setTrades, jLoaded] = useIdbState<Trade[]>('journal', []);
  const [transfers, setTransfers, trLoaded] = useIdbState<Transfer[]>('transfers', []);
  const [checkins, setCheckins, ciLoaded] = useIdbState<CheckIn[]>('checkins', []);
  const [settings, setSettings] = usePersisted<AccountSettings>('account', DEFAULT_SETTINGS);
  const [syncOpen, setSyncOpen] = useState(false);
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

  // Supabase sync (no-op unless configured and signed in)
  useCloudSync('boards', boards, setBoards);
  useCloudSync('playbooks', playbooks, setPlaybooks);
  useCloudSync('filters', filters, setFilters);
  useCloudSync('scanList', scanList, setScanList);
  useCloudSync('scanPrefs', scanPrefs, setScanPrefs);
  useCloudSync('account', settings, setSettings);
  useCloudItems('trade', trades, setTrades, (t) => t.id, jLoaded);
  useCloudItems('transfer', transfers, setTransfers, (t) => t.id, trLoaded);
  useCloudItems('checkin', checkins, setCheckins, (c) => c.day, ciLoaded);
  const cloudUser = useCloudUser();

  /* ---------------- data ---------------- */
  const wlSyms = useMemo(() => Object.keys(boards), [boards]);
  const movers = useMovers(dataMode, scanPrefs.includeMovers);
  // QQQ is always scanned (SPY is added server-side) so the index day trades get playbook grades too
  const universe = useUniverse(['QQQ', ...wlSyms], live ? scanList : [...scanList, ...Object.keys(DEMO_QUOTES).filter((s) => !INDEXES.includes(s))], movers?.movers, scanPrefs.includeMovers);
  // USO/UUP are the fear strip's live oil and dollar proxies
  const quoteSyms = useMemo(() => [...new Set([...INDEXES, 'USO', 'UUP', sel, ...wlSyms, ...universe])].slice(0, 52), [wlSyms, sel, universe]);
  const qs = useQuotes(quoteSyms, dataMode);
  const scan = useScan(universe, dataMode, (s) => DEMO_QUOTES[s]?.last ?? 100);
  const macro = useMacro(dataMode);
  const newsSyms = useMemo(() => [...new Set([sel, ...INDEXES, ...wlSyms])], [sel, wlSyms]);
  const news = useNews(newsSyms, dataMode, HEADLINES);
  const cal = useCalendar(useMemo(() => [...new Set([...wlSyms, ...universe])], [wlSyms, universe]), dataMode);

  // Scan rows: daily stats finished with the live quote, then RS-ranked across the universe
  const todayDay = Math.floor(encodeInstant(now) / 86400);
  const sessionStarted = et(now).sod >= 9.5 * 3600;
  const rows: ScanRow[] = useMemo(() => {
    const b = scan.bases;
    const lq = (s: string) => (live ? qs?.quotes[s] : undefined);
    const isToday = (s: string) => { const q = lq(s); return !!q && sessionStarted && Math.floor(encodeInstant(q.t) / 86400) === todayDay; };
    const spy = b.SPY ? { base: b.SPY, q: lq('SPY') } : undefined;
    const r = [...new Set(['SPY', ...universe])].filter((s) => b[s]).map((s) => liveRow(b[s], lq(s), spy, DEFAULT_THRESHOLDS, isToday(s)));
    return rankRs(r);
  }, [scan.bases, qs, live, universe, todayDay, sessionStarted]);
  const rowBy = useMemo(() => Object.fromEntries(rows.map((r) => [r.sym, r])), [rows]);

  // Watchlist/top strip quotes. Live: real price fields + RS from the scan. Demo: everything from the demo engine.
  const quotes: Record<string, Quote> = useMemo(() => {
    const out: Record<string, Quote> = {};
    for (const s of new Set([...Object.keys(DEMO_QUOTES), ...quoteSyms])) {
      const r = rowBy[s];
      if (!live) {
        const d = DEMO_QUOTES[s] ?? blankQuote(s);
        out[s] = r ? { ...d, last: r.last, chgPct: r.chgPct, rsRank: r.rsRank ?? NaN } : d;
        continue;
      }
      const lq = qs?.quotes[s];
      out[s] = { ...blankQuote(s, DEMO_QUOTES[s]?.name), last: lq?.last ?? NaN, chgPct: lq?.chgPct ?? NaN, rsRank: r?.rsRank ?? NaN };
    }
    if (!out[sel]) out[sel] = blankQuote(sel);
    return out;
  }, [live, qs, quoteSyms, sel, rowBy]);
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
  const vwapBy = useMemo(() => Object.fromEntries(cols.flatMap((c) => { const v = c.levels.find((l) => l.id === 'vwap')?.value; return v != null ? [[c.sym, v]] : []; })), [cols]);
  const activePb = playbooks.find((p) => p.id === scanPrefs.playbookId) ?? playbooks[0];
  const grades = useMemo(() => {
    const g: Record<string, GradeResult> = {};
    if (activePb) for (const r of rows) g[r.sym] = gradeRow(activePb, r, { vwap: vwapBy[r.sym] });
    return g;
  }, [rows, activePb, vwapBy]);
  const chartSeries = useMemo(() => patch(selTf, sel, layout.tf), [patch, selTf, sel, layout.tf]);

  /* ---------------- journal + account + guardrails ---------------- */
  const views = useMemo(() => trades.filter((t) => !t.deleted).map(viewTrade), [trades]);
  const liveTransfers = useMemo(() => transfers.filter((t) => !t.deleted), [transfers]);
  const lastPx = useCallback((s: string) => { const x = quotes[s]?.last; return Number.isFinite(x) ? x : undefined; }, [quotes]);
  const g = useMemo(() => guard(views, liveTransfers, settings, now, lastPx), [views, liveTransfers, settings, now, lastPx]);
  const today = etDay(now);
  const checkin = checkins.find((c) => c.day === today);
  const viols = useMemo(() => findViolations(views, liveTransfers, settings, checkins), [views, liveTransfers, settings, checkins]);
  const demoPrices = !live && views.some((v) => v.status === 'open');
  const logTrade = (t: Trade) => { setTrades((ts) => [...ts, t]); flash(`Logged ${t.side} ${t.sym}`); };
  const closeTrade = (id: string, qty: number, price: number) =>
    setTrades((ts) => ts.map((t) => (t.id === id ? { ...t, updated: Date.now(), fills: [...t.fills, { id: uid(), t: Date.now(), action: t.side === 'long' ? 'sell' : 'buy', qty, price, src: 'manual' }] } : t)));
  const moveStop = (id: string, stop: number) =>
    setTrades((ts) => ts.map((t) => (t.id === id ? { ...t, updated: Date.now(), stop, stopHistory: [...t.stopHistory, { t: Date.now(), stop }] } : t)));
  // Ask for the pre-session check-in once per trading day, before/at the open
  useEffect(() => {
    if (!ciLoaded || checkin || POPOUT) return;
    if (!(mode === 'pre' || mode === 'open') || et(now).wd === 0 || et(now).wd === 6) return;
    try { if (sessionStorage.getItem(`td.ciAsked.${today}`)) return; sessionStorage.setItem(`td.ciAsked.${today}`, '1'); } catch { /* ignore */ }
    setCiOpen(true);
  }, [ciLoaded, checkin, mode, today]); // eslint-disable-line react-hooks/exhaustive-deps

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
    { id: 'gappers', label: 'Scanner: gappers ≥3%', run: () => { setFilterId('gappers'); setTab('scanner'); } },
    { id: 'scanner', label: 'Open scanner', hint: 'S', run: () => setTab('scanner') },
    { id: 'rvol', label: 'Scanner: relative volume ≥2', run: () => { setFilterId('rvol'); setTab('scanner'); } },
    { id: 'breakouts', label: 'Scanner: 20/50-day breakouts', run: () => { setFilterId('brk'); setTab('scanner'); } },
    { id: 'highs', label: 'Scanner: 52-week highs', run: () => { setFilterId('hi52'); setTab('scanner'); } },
    { id: 'gapgo', label: 'Scanner: gap-and-go', run: () => { setFilterId('gapgo'); setTab('scanner'); } },
    { id: 'squeeze', label: 'Scanner: squeeze', run: () => { setFilterId('squeeze'); setTab('scanner'); } },
    { id: 'patterns', label: 'Scanner: bull flags / cup and handle', run: () => { setFilterId('patterns'); setTab('scanner'); } },
    { id: 'aplus', label: 'Scanner: grade A+', run: () => { setFilterId('aplus'); setTab('scanner'); } },
    { id: 'playbook', label: 'Edit playbooks', hint: 'P', run: () => setPbOpen(true) },
    ...playbooks.map((pb) => ({ id: `pb-${pb.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, label: `Grade with playbook: ${pb.name}`, run: () => setScanPrefs((x) => ({ ...x, playbookId: pb.id })) })),
    ...(cloudConfigured ? [{ id: 'sync', label: cloudUser ? `Sync: signed in as ${cloudUser.email}` : 'Sync: sign in to Supabase', run: () => setSyncOpen(true) }] : []),
    { id: 'levels', label: 'Show/hide levels panel', hint: 'L', run: () => setLayout({ levelsOpen: !layout.levelsOpen }) },
    { id: 'or5', label: 'Opening range: 5 minutes', run: () => setOrMin(5) },
    { id: 'or15', label: 'Opening range: 15 minutes', run: () => setOrMin(15) },
    { id: 'or30', label: 'Opening range: 30 minutes', run: () => setOrMin(30) },
    { id: 'alerts', label: `Toggle level alerts for ${sel}`, run: () => toggleAlerts(sel) },
    { id: 'news', label: 'Open news', hint: 'N', run: () => setTab('news') },
    { id: 'calendar', label: 'Calendars: economic, Fed, earnings, IPOs', hint: 'C', run: () => setTab('calendar') },
    { id: 'fed', label: 'Fed meeting countdown and rate odds', run: () => setTab('calendar') },
    { id: 'earnings', label: 'Earnings calendar', run: () => setTab('calendar') },
    { id: 'fear', label: 'Show/hide fear strip', hint: 'F', run: () => setLayout({ fearOpen: layout.fearOpen === false }) },
    { id: 'journal', label: 'Open full journal (trades, stats, violations, import)', hint: 'Shift J', run: () => setJnOpen(true) },
    { id: 'ticket', label: 'Quick journal / trade ticket', hint: 'Q', run: () => setTab('journal') },
    { id: 'import', label: 'Import broker CSV', run: () => setJnOpen(true) },
    { id: 'checkin', label: 'Pre-session check-in', run: () => setCiOpen(true) },
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
      if (e.key === 'Escape') { setCmdOpen(false); setOverlay(null); setDrawer(false); setPbOpen(false); setSyncOpen(false); setJnOpen(false); setCiOpen(false); return; }
      if (cmdOpen || pbOpen || syncOpen || jnOpen || ciOpen || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, () => void> = {
        m: () => setOverlay((o) => (o === 'map' ? null : 'map')),
        g: () => setOverlay((o) => (o === 'globe' ? null : 'globe')),
        '?': () => setOverlay((o) => (o === 'help' ? null : 'help')),
        t: toggleTheme,
        a: () => setDrawer((d) => !d),
        l: () => setLayout({ levelsOpen: !layout.levelsOpen }),
        p: () => setPbOpen(true),
        J: () => setJnOpen(true),
        '1': () => setTf('D'), '2': () => setTf('1H'), '3': () => setTf('5m'),
        n: () => setTab('news'), s: () => setTab('scanner'), q: () => setTab('journal'), r: () => setTab('risk'), c: () => setTab('calendar'),
        f: () => setLayout({ fearOpen: layout.fearOpen === false }),
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
  const scanner = (
    <Scanner
      rows={rows} grades={grades} scan={scan} universe={universe} boards={boards} sel={sel} onSelect={setSel} addSym={addSym}
      filterId={filterId} setFilterId={setFilterId} filters={filters} setFilters={setFilters}
      playbooks={playbooks} playbookId={activePb?.id ?? ''} setPlaybookId={(id) => setScanPrefs((x) => ({ ...x, playbookId: id }))} onEditPlaybooks={() => setPbOpen(true)}
      scanList={scanList} setScanList={setScanList} includeMovers={scanPrefs.includeMovers} setIncludeMovers={(v) => setScanPrefs((x) => ({ ...x, includeMovers: v }))}
      movers={movers} live={live}
    />
  );
  const journalSlot = (
    <div className="qj2">
      <TradeTicket sym={sel} last={q.last} playbook={activePb} grade={grades[sel]} guard={g} settings={settings} checkin={checkin} onCheckIn={() => setCiOpen(true)} onLog={logTrade} now={now} demoPrices={!live} />
      <OpenPositions views={views} lastPx={lastPx} onClose={closeTrade} onStop={moveStop} onSelect={setSel} />
      <div className="fb-row qj-foot"><button className="btn" onClick={() => setJnOpen(true)}>Open journal</button><span className="muted small">Shift+J · stats, violations, CSV import</span></div>
    </div>
  );
  const riskSlot = <RiskPanel guard={g} settings={settings} setSettings={setSettings} checkin={checkin} onCheckIn={() => setCiOpen(true)} violations={viols} now={now} last={Number.isFinite(q.last) ? q.last : undefined} />;
  const rightProps = {
    tab: layout.tab, onTab: setTab, quotes, boards, sel, onSelect: setSel, addSym,
    newsFilter, setNewsFilter, scanner, journal: journalSlot, risk: riskSlot, news,
    calendar: <Calendars cal={cal} now={now} onSelect={setSel} mySyms={new Set(wlSyms)} />,
  };
  const chart = (onPopout?: () => void) => (
    <ChartPanel
      sym={sel} name={q.name} last={live ? q.last : chartSeries.bars.at(-1)?.close ?? q.last} chgPct={q.chgPct}
      tf={layout.tf} onTf={setTf} theme={theme} series={chartSeries} levels={selLevels} onPopout={onPopout}
      news={news.items} onSelect={setSel}
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
        {POPOUT === 'ticker' && <NewsTicker headlines={news.items} fresh={news.freshness} asOf={news.asOf} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    );
  }

  /* ---------- Mobile companion ---------- */
  if (isMobile) return (
    <>
      <Mobile clk={clk} quotes={quotes} wlProps={wlProps} live={live} alertLog={alertLog} journal={journalSlot} />
      {ciOpen && <CheckInDialog day={today} existing={checkin} onClose={() => setCiOpen(false)} onSave={(c) => { setCheckins((x) => [...x.filter((y) => y.day !== c.day), c]); setCiOpen(false); }} />}
    </>
  );

  /* ---------- Desk ---------- */
  const cols3 = `${layout.leftOpen ? `${layout.left}px 5px` : '0 0'} minmax(0,1fr) ${layout.rightOpen ? `5px ${layout.right}px` : '0 0'}`;
  return (
    <div className={`app ${layout.tickerOpen ? '' : 'no-ticker'} ${layout.fearOpen !== false ? 'has-fear' : ''}`}>
      <TopStrip
        quotes={quotes} clk={clk} mode={mode} override={override} onOverride={setOverride} onSelect={setSel}
        onAccount={() => setDrawer((d) => !d)} accountOpen={drawer} theme={theme} onTheme={toggleTheme} onCmd={() => setCmdOpen(true)}
        account={{ guard: g, settings, demo: views.some((v) => v.t.demo), demoPrices }}
        quoteFresh={quoteFresh} quoteAsOf={live ? qs?.asOf : DEMO_AT} quoteSource={live ? qs?.source : 'Generated sample quotes'} macro={macro} live={live}
      />
      {layout.fearOpen !== false && <FearStrip macro={macro} quotes={quotes} live={live} />}
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
      {layout.tickerOpen && <NewsTicker headlines={news.items} fresh={news.freshness} asOf={news.asOf} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}

      <div className="statusbar">
        <span>Layout: <b>{modeLabel(mode)}</b>{override ? ' (manual)' : ' (auto)'}, changes save to this mode</span>
        <span className={live ? '' : 'demo-txt'}>{dataLine}</span>
        <button className="sync-btn" onClick={() => setSyncOpen(true)} title={cloudConfigured ? 'Supabase sync' : 'Sync not configured'}>
          {cloudConfigured ? (cloudUser ? `Synced · ${cloudUser.email}` : 'Sync: sign in') : 'Saved in this browser'}
        </button>
        <span className="muted">Press <kbd className="kbd">?</kbd> for shortcuts</span>
      </div>

      <CommandBar
        open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} tickers={tickers} onTicker={setSel}
        allowAny={live ? (s) => SYMBOL_RE.test(s) : undefined}
      />
      <AccountDrawer open={drawer} onClose={() => setDrawer(false)} theme={theme} views={views} transfers={liveTransfers} settings={settings} setSettings={setSettings} guard={g} onImport={() => { setDrawer(false); setJnOpen(true); }} />
      {jnOpen && <JournalOverlay views={views} setTrades={setTrades} transfers={transfers} setTransfers={setTransfers} violations={viols} lastPx={lastPx} settings={settings} onClose={() => setJnOpen(false)} onSelect={(s) => { setSel(s); setJnOpen(false); }} canSample={!live} />}
      {ciOpen && <CheckInDialog day={today} existing={checkin} onClose={() => setCiOpen(false)} onSave={(c) => { setCheckins((x) => [...x.filter((y) => y.day !== c.day), c]); setCiOpen(false); }} />}
      {pbOpen && <PlaybookEditor playbooks={playbooks} setPlaybooks={setPlaybooks} activeId={activePb?.id ?? ''} setActiveId={(id) => setScanPrefs((x) => ({ ...x, playbookId: id }))} rows={rows} vwap={vwapBy} onClose={() => setPbOpen(false)} />}
      {syncOpen && <SyncDialog user={cloudUser?.email ?? null} onClose={() => setSyncOpen(false)} />}
      {overlay && <OverlayView kind={overlay} onClose={() => setOverlay(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Mobile({ clk, quotes, wlProps, live, alertLog, journal }: {
  clk: ReturnType<typeof clock>; quotes: Record<string, Quote>; wlProps: Parameters<typeof Watchlist>[0];
  live: boolean; alertLog: AlertItem[]; journal: ReactNode;
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
        {tab === 'journal' && <section className="panel">{journal}</section>}
      </div>
    </div>
  );
}

function SyncDialog({ user, onClose }: { user: string | null; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="cmd sync" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Sync">
        <div className="phead"><div className="phead-title">Sync</div><div className="phead-ctl" /><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="sync-body">
          {!cloudConfigured ? (
            <p>Watchlists, playbooks and filters are saved in this browser only. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> and run <code>supabase/schema.sql</code> to sync across devices.</p>
          ) : user ? (
            <>
              <p>Signed in as <b>{user}</b>. Watchlist boards, playbooks, saved filters and the scan list sync to Supabase.</p>
              <button className="btn" onClick={() => signOut().then(onClose)}>Sign out</button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); signIn(email).then(() => setMsg('Check your email for the sign-in link.')).catch((err) => setMsg(err.message)); }}>
              <p>Sign in with a magic link to sync across devices.</p>
              <div className="fb-row"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /><button className="btn primary">Send link</button></div>
              {msg && <p className="small muted">{msg}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
