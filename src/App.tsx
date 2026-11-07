import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Layout, Mode, OrMinutes, Overlay, Quote, RightTab, TF } from './types';
import { clock, et, modeLabel } from './lib/clock';
import { DEMO_AT, INDEXES, defaultBoards, makeCandles, makeHeadlines, makeQuotes } from './lib/demo';
import type { ReactNode } from 'react';
import { DEFAULT_LAYOUTS } from './lib/layout';
import { load, save, usePersisted } from './lib/store';
import { px } from './lib/format';
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
import { ReplayOverlay } from './components/Replay';
import { RecapOverlay, download } from './components/Recap';
import { DEFAULT_RULES, type ExitRules } from './lib/replay';
import { buildRecap, journalCsv, type Recap } from './lib/recap';
import { useIdbState } from './lib/idb';
import { DEFAULT_SETTINGS, etDay, guard, viewTrade, violations as findViolations, type AccountSettings, type CheckIn, type Trade, type Transfer } from './lib/journal';
import { Scanner } from './components/Scanner';
import { PlaybookEditor } from './components/Playbooks';
import { useMovers, useScan, useUniverse } from './data/scan';
import { useCalendar, useNews } from './data/news';
import { useMarketStatus } from './data/market';
import { useFlows, useWorld } from './data/world';
// Map and globe load on first use so they don't slow the desk's first load
const WorldMap = lazy(() => import('./components/WorldMap'));
const PatternLab = lazy(() => import('./components/PatternLab'));
const MoneyGlobe = lazy(() => import('./components/MoneyGlobe'));
import { Calendars } from './components/Calendars';
import { FearStrip } from './components/FearStrip';
import { cloudConfigured, signIn, signOut, useCloudItems, useCloudSync, useCloudUser } from './data/cloud';
import { DEFAULT_THRESHOLDS, liveRow, rankRs, type ScanRow } from '../shared/scan';
import { DEFAULT_PLAYBOOKS, gradeRow, type GradeResult, type Playbook, type SavedFilter } from './lib/playbook';
import { CommandBar, NewsTicker, OverlayView, type Cmd } from './components/Bits';
import { SideNav, type Page } from './components/SideNav';
import { popout } from './components/common';
import { PingStack, StarredList } from './components/Pings';
import { Desk, type DeskCtx } from './lib/deskctx';
import { earningsPings, levelPings, movePing, watchLevels, type Ping } from './lib/pings';
import { useEarnings, useNames } from './data/company';
import type { ChartTF } from './types';
import type { Bar } from '../shared/types';
const CompanyPage = lazy(() => import('./components/CompanyPage'));
const Home = lazy(() => import('./components/Home'));
import { Messages } from './components/Messages';
import { useFeed } from './data/feed';
import type { HomeLayout } from './components/Home';

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

function useNarrow(px: number) {
  const q = `(max-width: ${px}px)`;
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, [q]);
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
  const dataMode = useDataMode();
  const live = dataMode.kind === 'live';

  // Terminal (dark) is the default look; T switches to the light "paper" theme
  const [theme, setTheme] = usePersisted<'light' | 'dark'>('themeV2', 'dark');
  // Home is the landing page (new key so existing installs open on Home once)
  const [page, setPage] = usePersisted<Page>('page2', 'home');
  const [homeLayout, setHomeLayout] = usePersisted<HomeLayout>('homeLayout', { main: [], side: [] });
  const homeSyms = useMemo(() => [...homeLayout.main, ...homeLayout.side].filter((w) => w.cfg?.sym).map((w) => String(w.cfg.sym)), [homeLayout]);
  const homeHasMovers = useMemo(() => [...homeLayout.main, ...homeLayout.side].some((w) => w.type === 'movers'), [homeLayout]);
  const homeHasMsgs = useMemo(() => [...homeLayout.main, ...homeLayout.side].some((w) => w.type === 'messages'), [homeLayout]);
  const [companySym, setCompanySym] = usePersisted<string>('companySym', 'NVDA');
  // Half-screen laptop windows: the watchlist folds away (press [ to show it) and the side menu shrinks to keys
  const narrow = useNarrow(1240);
  const [narrowLeft, setNarrowLeft] = useState(false);
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
  const [ciOpen, setCiOpen] = useState(false);
  // Journal lives in IndexedDB (screenshots); account rules are small and live with the other settings
  const [trades, setTrades, jLoaded] = useIdbState<Trade[]>('journal', []);
  const [transfers, setTransfers, trLoaded] = useIdbState<Transfer[]>('transfers', []);
  const [checkins, setCheckins, ciLoaded] = useIdbState<CheckIn[]>('checkins', []);
  const [settings, setSettings] = usePersisted<AccountSettings>('account', DEFAULT_SETTINGS);
  const [exitRules, setExitRules] = usePersisted<ExitRules>('exitRules', DEFAULT_RULES);
  const [recaps, setRecaps, rcLoaded] = useIdbState<Recap[]>('recaps', []);
  const [autoBackup, setAutoBackup] = usePersisted('autoBackup', true);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [recapOpen, setRecapOpen] = useState<string | false>(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [watchOnly, setWatchOnly] = usePersisted('tickerWatchOnly', false);
  const [orMin, setOrMin] = usePersisted<OrMinutes>('orMinutes', 15);
  const [alertsOn, setAlertsOn] = usePersisted<Record<string, boolean>>('alertsOn', { SPY: true, QQQ: true });
  const [, setAlertLog] = usePersisted<AlertItem[]>('alertLog', []);
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
  useCloudSync('exitRules', exitRules, setExitRules);
  useCloudItems('recap', recaps, setRecaps, (r) => r.day, rcLoaded);
  useCloudItems('trade', trades, setTrades, (t) => t.id, jLoaded);
  useCloudItems('transfer', transfers, setTransfers, (t) => t.id, trLoaded);
  useCloudItems('checkin', checkins, setCheckins, (c) => c.day, ciLoaded);
  const cloudUser = useCloudUser();

  /* ---------------- data ---------------- */
  /* ---------------- starred stocks (pings) ---------------- */
  const [stars, setStars] = usePersisted<string[]>('stars', []);
  const [pingAt, setPingAt] = usePersisted<number>('pingAt', 3);
  const [pings, setPings] = useState<Ping[]>([]);
  const [pingLog, setPingLog] = usePersisted<Ping[]>('pingLog', []);
  const wlSyms = useMemo(() => [...new Set([...Object.keys(boards), ...stars, ...homeSyms])], [boards, stars, homeSyms]);
  const movers = useMovers(dataMode, scanPrefs.includeMovers || homeHasMovers);
  // QQQ is always scanned (SPY is added server-side) so the index day trades get playbook grades too
  const universe = useUniverse(['QQQ', ...wlSyms], live ? scanList : [...scanList, ...Object.keys(DEMO_QUOTES).filter((s) => !INDEXES.includes(s))], movers?.movers, scanPrefs.includeMovers);
  // USO/UUP are the fear strip's live oil and dollar proxies
  const quoteSyms = useMemo(() => [...new Set([...INDEXES, 'USO', 'UUP', sel, ...stars, ...wlSyms, ...universe])].slice(0, 56), [wlSyms, sel, universe, stars]);
  const qs = useQuotes(quoteSyms, dataMode);
  const feed = useFeed(useMemo(() => [...wlSyms, ...universe].slice(0, 80), [wlSyms, universe]), dataMode, page === 'messages' || (page === 'home' && homeHasMsgs));
  const scan = useScan(universe, dataMode, (s) => DEMO_QUOTES[s]?.last ?? 100);
  const macro = useMacro(dataMode);
  const market = useMarketStatus(dataMode);
  const worldData = useWorld(dataMode, page === 'map');
  const flowsData = useFlows(dataMode, page === 'flows');
  // Market-clock mode: tell me when the layout switched itself
  const prevMode = useRef<Mode | null>(null);
  useEffect(() => {
    if (prevMode.current && prevMode.current !== mode && !override) flash(`Market clock: ${modeLabel(mode)} layout`, 3000);
    prevMode.current = mode;
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const seriesTf: TF = layout.tf === 'Y' ? 'M' : layout.tf;
  const selTf = useSeries(sel, seriesTf, dataMode, demoLast(sel));

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
  const chartSeries = useMemo(() => patch(selTf, sel, seriesTf), [patch, selTf, sel, seriesTf]);

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

  /* ---------------- end-of-day recap + daily CSV backup ---------------- */
  const csvFor = useCallback((day: string | null) => {
    const vs = day ? views.filter((v) => etDay(v.openedAt ?? v.t.created) === day || (v.closedAt != null && etDay(v.closedAt) === day)) : views;
    return journalCsv(vs, viols);
  }, [views, viols]);
  useEffect(() => {
    if (!rcLoaded || !jLoaded || POPOUT) return;
    const e = et(now);
    if (clk.holiday || e.wd === 0 || e.wd === 6 || e.sod < clk.closeSod) return; // early-close days recap at 1:00 PM
    if (recaps.some((r) => r.day === today && !r.partial)) return;
    const r = buildRecap(today, views, viols, checkin);
    if (!r) return;
    setRecaps((x) => [...x.filter((y) => y.day !== today), r]);
    if (autoBackup) download(`desk-journal-${today}.csv`, journalCsv(views, viols)); // full journal, once a day at the close
    setRecapOpen(today);
    flash(`Daily recap ready: grade ${r.grade}`, 6000);
  }, [Math.floor(now / 60_000), rcLoaded, jLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  const openRecap = () => {
    const r = buildRecap(today, views, viols, checkin);
    if (r && et(now).sod < clk.closeSod) setRecaps((x) => [...x.filter((y) => y.day !== today), { ...r, partial: true, lesson: `(Day in progress) ${r.lesson}` }]);
    setRecapOpen(today);
  };
  const replayView = replayId ? views.find((v) => v.t.id === replayId) : undefined;

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

  /* ---------------- starred: names, pings ---------------- */
  const names = useNames(useMemo(() => [...new Set([...quoteSyms, ...stars, companySym])], [quoteSyms, stars, companySym]), dataMode,
    useMemo(() => Object.fromEntries(Object.values(DEMO_QUOTES).map((q) => [q.sym, q.name])), []));
  const toggleStar = useCallback((sym: string) => {
    setStars((xs) => (xs.includes(sym) ? xs.filter((x) => x !== sym) : [...xs, sym]));
    flash(stars.includes(sym) ? `${sym} unstarred` : `★ ${sym} starred: pings for news, earnings, moves, levels`, 2500);
    try { if (Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
  }, [stars, setStars, flash]);
  const openCompany = useCallback((sym: string) => { setCompanySym(sym); setPage('company'); }, [setCompanySym, setPage]);
  const desk: DeskCtx = useMemo(() => ({ stars, toggleStar, names, openCompany }), [stars, toggleStar, names, openCompany]);

  const fired = useRef<Set<string>>(new Set(load<string[]>('pingFired', [])));
  const pushPings = useCallback((ps: Ping[]) => {
    if (!ps.length) return;
    save('pingFired', [...fired.current].slice(-600));
    setPings((x) => [...ps, ...x].slice(0, 20));
    setPingLog((l) => [...ps, ...l].slice(0, 200));
    beep();
    try { if (Notification.permission === 'granted' && document.hidden) for (const p of ps) new Notification(`★ ${p.sym}: ${p.text}`, { tag: p.id }); } catch { /* not supported */ }
  }, [setPingLog]);
  // news: any new headline tagged with a starred ticker (the first load only marks what's already there)
  const newsPrimed = useRef(false);
  useEffect(() => {
    if (!stars.length || !news.items.length) return;
    const fresh: Ping[] = [];
    for (const n of news.items) {
      for (const s of n.syms.filter((x) => stars.includes(x))) {
        const id = `news:${s}:${n.id}`;
        if (fired.current.has(id)) continue;
        fired.current.add(id);
        if (newsPrimed.current && Date.now() - n.t < 6 * 3600_000) fresh.push({ id, t: Date.now(), sym: s, kind: 'news', text: n.title, url: n.url || undefined, tone: n.sentiment > 0 ? 'up' : n.sentiment < 0 ? 'down' : undefined });
      }
    }
    newsPrimed.current = true;
    pushPings(fresh.slice(0, 5));
  }, [news.asOf, news.items.length, stars.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // earnings: day before, day of, and when results post
  const earnings = useEarnings(stars, dataMode);
  useEffect(() => {
    const d = et(now), today = `${d.y}-${String(d.mo).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    const tm = new Date(Date.UTC(d.y, d.mo - 1, d.d + 1)).toISOString().slice(0, 10);
    pushPings(earningsPings(earnings, today, tm, fired.current));
  }, [earnings, Math.floor(now / 3600_000)]); // eslint-disable-line react-hooks/exhaustive-deps
  // moves + levels: on each quote refresh
  const starDaily = useStarDaily(stars, dataMode);
  const starPrev = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!stars.length) return;
    const d = et(now), day = `${d.y}-${d.mo}-${d.d}`, todayStart = Date.UTC(d.y, d.mo - 1, d.d) / 1000;
    const out: Ping[] = [];
    for (const s of stars) {
      const q = quotes[s];
      if (!q || !Number.isFinite(q.last)) continue;
      const mp = movePing(s, q.chgPct, pingAt, day, fired.current);
      if (mp) out.push(mp);
      const prev = starPrev.current[s];
      starPrev.current[s] = q.last;
      if (prev != null && starDaily[s]?.length) out.push(...levelPings(s, prev, q.last, watchLevels(starDaily[s], todayStart), fired.current));
    }
    pushPings(out);
  }, [qs?.asOf, live ? 0 : quotes]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const setTf = (tf: ChartTF) => setLayout({ tf });

  const commands: Cmd[] = [
    { id: 'gappers', label: 'Scanner: gappers ≥3%', run: () => { setFilterId('gappers'); setTab('scanner'); } },
    { id: 'scanner', label: 'Scanner page', hint: 'S', run: () => setPage('scanner') }, { id: 'desk', label: 'Desk page', hint: 'D', run: () => setPage('desk') }, { id: 'patterns', label: 'Pattern lookup: candlesticks + chart patterns for any ticker', hint: 'X', run: () => setPage('patterns') },
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
    { id: 'calendar', label: 'Calendars page: economic, Fed, earnings, IPOs', hint: 'C', run: () => setPage('calendar') },
    { id: 'fed', label: 'Fed meeting countdown and rate odds', run: () => setPage('calendar') },
    { id: 'earnings', label: 'Earnings calendar', run: () => setPage('calendar') },
    { id: 'fear', label: 'Show/hide fear strip', hint: 'F', run: () => setLayout({ fearOpen: layout.fearOpen === false }) },
    { id: 'journal', label: 'Journal page (trades, stats, violations, import)', hint: 'Shift J', run: () => setPage('journal') },
    { id: 'ticket', label: 'Quick journal / trade ticket', hint: 'Q', run: () => setTab('journal') },
    { id: 'import', label: 'Import broker CSV', run: () => setPage('journal') },
    { id: 'checkin', label: 'Pre-session check-in', run: () => setCiOpen(true) },
    { id: 'recap', label: 'Daily recap (today so far, and past days)', run: openRecap },
    { id: 'replay', label: 'Replay my last trade with ghost exit', run: () => { const last = [...views].filter((v) => v.openedAt != null).sort((a, b) => b.openedAt! - a.openedAt!)[0]; if (last) setReplayId(last.t.id); else flash('No trades to replay yet'); } },
    { id: 'backup', label: 'Download full journal CSV backup', run: () => download(`desk-journal-all-${today}.csv`, csvFor(null)) },
    { id: 'auto-backup', label: `Auto CSV backup at the close: ${autoBackup ? 'on (turn off)' : 'off (turn on)'}`, run: () => setAutoBackup(!autoBackup) },
    { id: 'risk', label: 'Open risk / position size', hint: 'R', run: () => setTab('risk') },
    { id: 'account', label: 'Open account drawer', hint: 'A', run: () => setDrawer(true) },
    { id: 'map', label: 'World map page', hint: 'M', run: () => setPage('map') },
    { id: 'globe', label: 'Money flow globe page', hint: 'G', run: () => setPage('flows') },
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
      if (e.key === 'Escape') { if (replayId) { setReplayId(null); return; } setCmdOpen(false); setOverlay(null); setDrawer(false); setPbOpen(false); setSyncOpen(false); setCiOpen(false); setRecapOpen(false); return; }
      if (cmdOpen || pbOpen || syncOpen || ciOpen || replayId || recapOpen || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, () => void> = {
        h: () => setPage('home'), e: () => setPage('messages'), d: () => setPage('desk'), x: () => setPage('patterns'), s: () => setPage('scanner'), m: () => setPage('map'), g: () => setPage('flows'), c: () => setPage('calendar'),
        '?': () => setOverlay((o) => (o === 'help' ? null : 'help')),
        t: toggleTheme,
        a: () => setDrawer((d) => !d),
        l: () => setLayout({ levelsOpen: !layout.levelsOpen }),
        p: () => setPbOpen(true),
        J: () => setPage('journal'),
        '1': () => setTf('D'), '2': () => setTf('1H'), '3': () => setTf('5m'), '4': () => setTf('W'), '5': () => setTf('M'), '6': () => setTf('Y'),
        o: () => openCompany(sel),
        n: () => { setPage('desk'); setTab('news'); }, q: () => { setPage('desk'); setTab('journal'); }, r: () => { setPage('desk'); setTab('risk'); },
        f: () => setLayout({ fearOpen: layout.fearOpen === false }),
        '[': () => (narrow ? setNarrowLeft((v) => !v) : setLayout({ leftOpen: !layout.leftOpen })),
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
    <>
    <StarredList quotes={quotes} log={pingLog} sel={sel} onSelect={setSel} threshold={pingAt} setThreshold={setPingAt} />
    <Scanner
      rows={rows} grades={grades} scan={scan} universe={universe} boards={boards} sel={sel} onSelect={setSel} addSym={addSym}
      filterId={filterId} setFilterId={setFilterId} filters={filters} setFilters={setFilters}
      playbooks={playbooks} playbookId={activePb?.id ?? ''} setPlaybookId={(id) => setScanPrefs((x) => ({ ...x, playbookId: id }))} onEditPlaybooks={() => setPbOpen(true)}
      scanList={scanList} setScanList={setScanList} includeMovers={scanPrefs.includeMovers} setIncludeMovers={(v) => setScanPrefs((x) => ({ ...x, includeMovers: v }))}
      movers={movers} live={live}
    />
    </>
  );
  const journalSlot = (
    <div className="qj2">
      <TradeTicket sym={sel} last={q.last} playbook={activePb} grade={grades[sel]} guard={g} settings={settings} checkin={checkin} onCheckIn={() => setCiOpen(true)} onLog={logTrade} now={now} demoPrices={!live} />
      <OpenPositions views={views} lastPx={lastPx} onClose={closeTrade} onStop={moveStop} onSelect={setSel} />
      <div className="fb-row qj-foot"><button className="btn" onClick={() => setPage('journal')}>Open journal</button><span className="muted small">Shift+J · stats, violations, CSV import</span></div>
    </div>
  );
  const riskSlot = <RiskPanel guard={g} settings={settings} setSettings={setSettings} checkin={checkin} onCheckIn={() => setCiOpen(true)} violations={viols} now={now} last={Number.isFinite(q.last) ? q.last : undefined} />;
  const rightProps = {
    tab: layout.tab, onTab: setTab, quotes, boards, sel, onSelect: setSel, addSym,
    newsFilter, setNewsFilter, scanner, journal: journalSlot, risk: riskSlot, news,
    calendar: <Calendars cal={cal} now={now} onSelect={setSel} mySyms={new Set(wlSyms)} />,
  };
  const chart = (onPopout?: () => void) => (
    <ChartPanel mode={dataMode}
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

  /* ---------- Desk: side menu + pages (laptop) ---------- */
  const leftShown = narrow ? narrowLeft : layout.leftOpen;
  const rightW = narrow ? Math.min(layout.right, 300) : layout.right;
  const cols3 = `${leftShown ? `${Math.min(layout.left, narrow ? 220 : 520)}px 5px` : '0 0'} minmax(0,1fr) ${layout.rightOpen ? `5px ${rightW}px` : '0 0'}`;
  const toDesk = (s: string) => { setSel(s); setPage('desk'); };
  let body: ReactNode;
  if (page === 'scanner') {
    body = <div className="page page-split"><section className="panel rr"><div className="rr-body">{scanner}</div></section><div className="center">{chart()}</div></div>;
  } else if (page === 'calendar') {
    body = <div className="page page-split"><section className="panel cal-page"><Calendars cal={cal} now={now} onSelect={setSel} mySyms={new Set(wlSyms)} /></section><div className="center">{chart()}</div></div>;
  } else if (page === 'journal') {
    body = <div className="page"><JournalOverlay views={views} setTrades={setTrades} transfers={transfers} setTransfers={setTransfers} violations={viols} lastPx={lastPx} settings={settings} onClose={() => setPage('desk')} onSelect={toDesk} onReplay={setReplayId} canSample={!live} /></div>;
  } else if (page === 'messages') {
    body = <div className="page"><section className="panel msgs-page"><div className="phead"><div className="phead-title">Messages: earnings, Fed, White House, economy</div></div><Messages feed={feed} cal={cal} nowMs={now} onChart={toDesk} /></section></div>;
  } else if (page === 'home') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <Home layout={homeLayout} setLayout={setHomeLayout} tickers={tickers.map((t) => ({ sym: t.sym, name: names[t.sym] ?? t.name }))}
          d={{ mode: dataMode, theme, quotes, news, cal, movers, clk, macro, pingLog, sel, pingAt, setPingAt, onChart: toDesk, demoLast, feed, now }} />
      </Suspense>
    );
  } else if (page === 'company') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <CompanyPage sym={companySym} mode={dataMode} onOpen={setCompanySym} onChart={toDesk} onPatterns={(s) => { save('patSym', s); setPage('patterns'); }} />
      </Suspense>
    );
  } else if (page === 'patterns') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <PatternLab mode={dataMode} theme={theme} symbols={[...wlSyms, ...universe]} demoLast={demoLast} onChart={toDesk} />
      </Suspense>
    );
  } else if (page === 'map' || page === 'flows') {
    body = (
      <div className="page">
        <Suspense fallback={<section className="panel"><div className="ph-body">Loading…</div></section>}>
          {page === 'map'
            ? <WorldMap mode={dataMode} data={worldData} symbols={[...new Set([...INDEXES, ...wlSyms, ...universe])]} names={Object.fromEntries(Object.values(quotes).map((x) => [x.sym, x.name]))} onSelect={toDesk} onClose={() => setPage('desk')} />
            : <MoneyGlobe data={flowsData} theme={theme} onSelect={toDesk} onClose={() => setPage('desk')} />}
        </Suspense>
      </div>
    );
  } else {
    body = (
      <main className="main" style={{ gridTemplateColumns: cols3 }}>
        <div className="rail-slot">{leftShown && <Watchlist {...wlProps} onPopout={() => popout('watchlist', sel)} />}</div>
        <div className={`gutter ${leftShown ? '' : 'hidden'}`} onPointerDown={drag('left')} title="Drag to resize · [ to hide" />
        <div className="center">
          {chart(() => popout('chart', sel))}
          {layout.levelsOpen && levelsPanel}
        </div>
        <div className={`gutter ${layout.rightOpen ? '' : 'hidden'}`} onPointerDown={drag('right')} title="Drag to resize · ] to hide" />
        <div className="rail-slot">{layout.rightOpen && <RightRail {...rightProps} onPopout={() => popout('right', sel)} />}</div>
      </main>
    );
  }
  return (
    <Desk.Provider value={desk}>
    <div className="shell">
      <SideNav compact={narrow} page={page} onPage={setPage} onCmd={() => setCmdOpen(true)} onHelp={() => setOverlay('help')} onAccount={() => setDrawer((d) => !d)} />
      <div className={`app ${layout.tickerOpen ? '' : 'no-ticker'} ${layout.fearOpen !== false ? 'has-fear' : ''}`}>
        <TopStrip
          quotes={quotes} clk={clk} mode={mode} override={override} onOverride={setOverride} onSelect={setSel}
          onAccount={() => setDrawer((d) => !d)} accountOpen={drawer} theme={theme} onTheme={toggleTheme} onCmd={() => setCmdOpen(true)}
          account={{ guard: g, settings, demo: views.some((v) => v.t.demo), demoPrices }}
          marketSource={market?.status?.source}
          quoteFresh={quoteFresh} quoteAsOf={live ? qs?.asOf : DEMO_AT} quoteSource={live ? qs?.source : 'Generated sample quotes'} macro={macro} live={live}
        />
        {layout.fearOpen !== false && <FearStrip macro={macro} quotes={quotes} live={live} />}
        {body}
        {layout.tickerOpen && <NewsTicker headlines={news.items} fresh={news.freshness} asOf={news.asOf} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}

        <div className="statusbar">
          <span>Layout: <b>{modeLabel(mode)}</b>{override ? ' (manual)' : ' (auto)'}, changes save to this mode</span>
          <span className={live ? '' : 'demo-txt'}>{dataLine}</span>
          <button className="sync-btn" onClick={() => setSyncOpen(true)} title={cloudConfigured ? 'Supabase sync' : 'Sync not configured'}>
            {cloudConfigured ? (cloudUser ? `Synced · ${cloudUser.email}` : 'Sync: sign in') : 'Saved in this browser'}
          </button>
          <span className="muted">Press <kbd className="kbd">?</kbd> for shortcuts</span>
        </div>
      </div>

      <CommandBar
        open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} tickers={tickers} onTicker={setSel}
        allowAny={live ? (s) => SYMBOL_RE.test(s) : undefined}
      />
      <AccountDrawer open={drawer} onClose={() => setDrawer(false)} theme={theme} views={views} transfers={liveTransfers} settings={settings} setSettings={setSettings} guard={g} onImport={() => { setDrawer(false); setPage('journal'); }} />
      {recapOpen !== false && <RecapOverlay recaps={recaps} initialDay={recapOpen || undefined} onClose={() => setRecapOpen(false)} onReplay={setReplayId} csvFor={csvFor} />}
      {replayView && <ReplayOverlay v={replayView} live={live} theme={theme} rules={exitRules} setRules={setExitRules} onClose={() => setReplayId(null)} />}
      {ciOpen && <CheckInDialog day={today} existing={checkin} onClose={() => setCiOpen(false)} onSave={(c) => { setCheckins((x) => [...x.filter((y) => y.day !== c.day), c]); setCiOpen(false); }} />}
      {pbOpen && <PlaybookEditor playbooks={playbooks} setPlaybooks={setPlaybooks} activeId={activePb?.id ?? ''} setActiveId={(id) => setScanPrefs((x) => ({ ...x, playbookId: id }))} rows={rows} vwap={vwapBy} onClose={() => setPbOpen(false)} />}
      {syncOpen && <SyncDialog user={cloudUser?.email ?? null} onClose={() => setSyncOpen(false)} />}
      {overlay === 'help' && <OverlayView kind="help" onClose={() => setOverlay(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <PingStack pings={pings} onOpen={toDesk} onDismiss={(id) => setPings((x) => x.filter((p) => p.id !== id))} />
    </div>
    </Desk.Provider>
  );
}

/** Daily bars for starred tickers (for yesterday's high/low and pattern triggers). One request each, spaced out, refreshed every 3 hours. */
function useStarDaily(stars: string[], mode: ReturnType<typeof useDataMode>): Record<string, Bar[]> {
  const [by, setBy] = useState<Record<string, Bar[]>>({});
  const key = stars.join(',');
  useEffect(() => {
    if (!stars.length) return;
    if (mode.kind === 'demo') { setBy(Object.fromEntries(stars.map((s) => [s, makeCandles(s, 'D', DEMO_QUOTES[s]?.last ?? 100)]))); return; }
    if (mode.kind !== 'live') return;
    let stop = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => stars.forEach((s, i) => timers.push(setTimeout(async () => {
      try { const r = await fetch(`/api/candles?symbol=${s}&tf=D`); const j = await r.json(); if (!stop && r.ok) setBy((x) => ({ ...x, [s]: j.bars })); } catch { /* skip */ }
    }, i * 9000)));
    run();
    const iv = setInterval(run, 3 * 3600_000);
    return () => { stop = true; timers.forEach(clearTimeout); clearInterval(iv); };
  }, [key, mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return by;
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
