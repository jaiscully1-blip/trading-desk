import { useGammaLv } from './data/gamma';
import { DEFAULT_SIZE, addTop, type WidgetType } from './lib/grid';
import { movementRead } from '../shared/movement';
import { volRead } from '../shared/volatility';
import { moveStats } from '../shared/movementStats';
import { useMacroPack } from './data/macro';
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Layout, Mode, OrMinutes, Overlay, Quote, RightTab, TF } from './types';
import { clock, et, modeLabel } from './lib/clock';
import { DEMO_AT, INDEXES, defaultBoards, makeCandles, makeHeadlines, makeQuotes } from './lib/demo';
import type { ReactNode } from 'react';
import { DEFAULT_LAYOUTS } from './lib/layout';
import { load, save, usePersisted } from './lib/store';
import { px } from './lib/format';
import { computeLevels, detectLevelEvents, LEVEL_SHORT, type LevelEvent } from './lib/levels';
import { levelsForHours, toolHours } from '../shared/toolHours';
import { encodeInstant } from '../shared/parse';
import { patchWithQuote, useDataMode, useLateMode, useMacro, useQuotes, useSeries, type SeriesState } from './data/live';
import { TopStrip } from './components/TopStrip';
import { Watchlist, orderedWatchlist } from './components/Watchlist';
import { LevelsPanel, type LevelCol } from './components/Levels';
import { RightRail, type NewsFilter } from './components/RightRail';
import { CheckInDialog, OpenPositions, RiskPanel, TradeTicket, uid } from './components/Trading';
import { download } from './lib/download';
import { DEFAULT_RULES, type ExitRules } from './lib/replay';
import { buildRecap, journalCsv, liveRecaps, type Recap } from './lib/recap';
import { useIdbState } from './lib/idb';
import { DEFAULT_SETTINGS, etDay, guard, viewTrade, violations as findViolations, type AccountSettings, type CheckIn, type Trade, type Transfer } from './lib/journal';
import { Scanner } from './components/Scanner';
import { useMovers, useScan, useUniverse } from './data/scan';
import { useCalendar, useNews } from './data/news';
import { keywordHits } from '../shared/catalysts';
import { useMarketStatus } from './data/market';
import { useFlows, useWorld } from './data/world';
import { rotationTurns } from '../shared/rotation';
// Map and globe load on first use so they don't slow the desk's first load
const WorldMap = lazy(() => import('./components/WorldMap'));
const PatternLab = lazy(() => import('./components/PatternLab'));
const Rotation = lazy(() => import('./components/Rotation'));
const CompanyMap = lazy(() => import('./components/CompanyMap'));
const SmartMoney = lazy(() => import('./components/SmartMoney'));
const DistressPage = lazy(() => import('./components/Distress'));
const MtfPage = lazy(() => import('./components/MtfPage'));
const EtfSectors = lazy(() => import('./components/EtfSectors'));
const EconOdds = lazy(() => import('./components/EconOdds'));
import { Calendars } from './components/Calendars';
import { FearStrip } from './components/FearStrip';
import { cloudConfigured, signIn, signOut, useCloudItems, useCloudSync, useCloudUser } from './data/cloud';
import { DEFAULT_THRESHOLDS, liveRow, rankRs, type ScanRow } from '../shared/scan';
import { DEFAULT_PLAYBOOKS, gradeRow, type GradeResult, type Playbook, type SavedFilter } from './lib/playbook';
import { CommandBar, NewsTicker, OverlayView, type Cmd } from './components/Bits';
import { SideNav, pageGroup, NAV_GROUPS, type Page } from './components/SideNav';
const NAV_PAGE_IDS = new Set<string>(NAV_GROUPS.flatMap((g) => g.pages));
const HoverCard = lazy(() => import('./components/HoverCard'));
import DataStatus from './components/DataStatus';
const RiverScene = lazy(() => import('./components/RiverScene'));
import { popout, PageTabs } from './components/common';
import { PingStack, StarredList } from './components/Pings';
import { Desk, type Article, type DeskCtx } from './lib/deskctx';
import TickerInfo from './components/TickerInfo';
import { OFFLINE_NAMES } from './data/info';
import { earningsPings, levelPings, movePing, watchLevels, type Ping } from './lib/pings';
import { useEarnings, useNames } from './data/company';
import type { ChartTF } from './types';
import type { Bar } from '../shared/types';
const CompanyPage = lazy(() => import('./components/CompanyPage'));
const Home = lazy(() => import('./components/Home'));
// The chart, journal, replay, recap, playbook editor, article reader and order ticket carry the charting library and most of the
// journal code. They load the first time they are shown, which keeps the first paint small.
const ChartPanel = lazy(() => import('./components/Chart').then((m) => ({ default: m.ChartPanel })));
const JournalOverlay = lazy(() => import('./components/Journal').then((m) => ({ default: m.JournalOverlay })));
const AccountDrawer = lazy(() => import('./components/Journal').then((m) => ({ default: m.AccountDrawer })));
const ReplayOverlay = lazy(() => import('./components/Replay').then((m) => ({ default: m.ReplayOverlay })));
const RecapOverlay = lazy(() => import('./components/Recap').then((m) => ({ default: m.RecapOverlay })));
const PlaybookEditor = lazy(() => import('./components/Playbooks').then((m) => ({ default: m.PlaybookEditor })));
const ReaderOverlay = lazy(() => import('./components/Poker').then((m) => ({ default: m.ReaderOverlay })));
const OrderTicket = lazy(() => import('./components/OrderTicket').then((m) => ({ default: m.OrderTicket })));
// start fetching the page you will land on while the app shell is still parsing
try {
  const first = JSON.parse(localStorage.getItem('td.page2') ?? '"home"');
  if (first === 'home') void import('./components/Home');
  else if (first === 'desk') void import('./components/Chart');
  else if (first === 'morning') void import('./components/Morning');
} catch { /* storage unavailable */ }
const Morning = lazy(() => import('./components/Morning'));
const Gamma = lazy(() => import('./components/Gamma'));
import { useMorning } from './data/morning';
import type { OrderDraft } from '../shared/orders';
import { Messages } from './components/Messages';
import { useFeed } from './data/feed';
import type { HomeLayout, Workspaces } from './components/Home';
import { COMMODITIES } from './components/HomeWidgets2';

const DEMO_QUOTES = makeQuotes();
/** Deep links like /$SPY or /nvda open that ticker on the desk (Vercel rewrites every page path to the app). */
const PATH_SYM = (() => { try { const m = /^\/\$?([A-Za-z][A-Za-z0-9.\-]{0,9})\/?$/.exec(decodeURIComponent(location.pathname)); return m ? m[1].toUpperCase() : null; } catch { return null; } })();
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
  // the whole desk re-renders when this ticks, so it ticks every 15 s (every second only while a cooldown is counting down);
  // clocks and countdowns that show seconds run their own timer (src/lib/useTick.ts)
  const [fastTick, setFastTick] = useState(false);
  const now = useNow(fastTick ? 1000 : 15_000);
  const clk = useMemo(() => clock(now), [now]);
  const dataMode = useDataMode();
  const lateMode = useLateMode(dataMode); // scanner, rotation and calendars start a few seconds after the first paint
  const live = dataMode.kind === 'live';

  // Terminal (dark) is the default look; T switches to the light "paper" theme
  const [theme, setTheme] = usePersisted<'light' | 'dark'>('themeV2', 'dark');
  // Home is the landing page (new key so existing installs open on Home once)
  const [page, setPage] = usePersisted<Page>('page2', 'home');
  const [flowView, setFlowView] = usePersisted<'flow' | 'companies'>('flowView', 'flow');
  // Home workspaces (the earlier single Home layout becomes "Main")
  const [spaces, setSpaces] = usePersisted<Workspaces>('workspaces', () => ({ active: 'main', list: [{ id: 'main', name: 'Main', layout: load<HomeLayout>('homeLayout', { main: [], side: [] }) }] }));
  const homeLayout = (spaces.list.find((w) => w.id === spaces.active) ?? spaces.list[0]).layout;
  const homeSyms = useMemo(() => [...homeLayout.main, ...homeLayout.side].flatMap((w) => (w.type === 'commodities' ? COMMODITIES.map((c) => c[0]) : w.type !== 'crypto' && w.cfg?.sym ? [String(w.cfg.sym)] : [])), [homeLayout]);
  const homeHasMovers = useMemo(() => [...homeLayout.main, ...homeLayout.side].some((w) => w.type === 'movers'), [homeLayout]);
  const [alertWords, setAlertWords] = usePersisted<string[]>('alertWords', []);
  const homeHasMsgs = useMemo(() => [...homeLayout.main, ...homeLayout.side].some((w) => w.type === 'messages'), [homeLayout]);
  const [companySym, setCompanySym] = usePersisted<string>('companySym', 'NVDA');
  // Half-screen laptop windows: the watchlist folds away (press [ to show it) and the side menu shrinks to keys
  const narrow = useNarrow(1240);
  const iconRail = useNarrow(1000); // below this the side menu becomes an icon rail; above it every page is named
  const [narrowLeft, setNarrowLeft] = useState(false);
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  // Riverfront scene behind the dark theme: moving, still, or off (the light paper theme never shows it)
  const [scene, setScene] = usePersisted<'live' | 'still' | 'off'>('scene', 'live');
  const river = theme === 'dark' && scene !== 'off';
  useLayoutEffect(() => { if (river) document.documentElement.dataset.scene = 'river'; else delete document.documentElement.dataset.scene; }, [river]);
  const [focus, setFocus] = useState(false);
  const [drawerSeen, setDrawerSeen] = useState(false); // the account drawer loads the first time it is opened, then stays mounted
  const prevRails = useRef({ l: true, r: true });
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [setTheme]);

  const [boards, setBoards] = usePersisted<Record<string, Board>>('boards', () => defaultBoards(DEMO_QUOTES));
  const [sel, setSelRaw] = useState<string>((PATH_SYM || params.get('sym') || 'SPY').toUpperCase());
  useEffect(() => { if (PATH_SYM) { setPage('desk'); history.replaceState(null, '', `/${location.search}`); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [override, setOverride] = usePersisted<Mode | null>('modeOverride', null);
  const mode: Mode = override ?? clk.mode;

  // Saved layouts per market-clock mode; whatever you change is saved to the current mode.
  const [layouts, setLayouts] = usePersisted<Partial<Record<Mode, Layout>>>('layouts', {});
  const layout: Layout = { levelsOpen: true, ...DEFAULT_LAYOUTS[mode], ...layouts[mode] };
  if ((layout.tf as string) === 'Y') layout.tf = 'M'; // the yearly chart was retired; a saved Y falls back to monthly
  const setLayout = useCallback(
    (patch: Partial<Layout>) => setLayouts((all) => ({ ...all, [mode]: { ...DEFAULT_LAYOUTS[mode], ...all[mode], ...patch } })),
    [mode, setLayouts],
  );
  const toggleFocus = () => {
    if (!focus) { prevRails.current = { l: layout.leftOpen, r: layout.rightOpen }; setLayout({ leftOpen: false, rightOpen: false }); setFocus(true); }
    else { setLayout({ leftOpen: prevRails.current.l, rightOpen: prevRails.current.r }); setFocus(false); }
  };

  const [cmdOpen, setCmdOpen] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { if (drawer) setDrawerSeen(true); }, [drawer]);
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
  const feed = useFeed(useMemo(() => [...wlSyms, ...universe].slice(0, 80), [wlSyms, universe]), dataMode, page === 'messages' || (page === 'home' && homeHasMsgs) || alertWords.length > 0); // keyword alerts keep the feed running on every page
  const scan = useScan(universe, lateMode, (s) => DEMO_QUOTES[s]?.last ?? 100);
  const macro = useMacro(dataMode);
  const market = useMarketStatus(dataMode);
  const worldData = useWorld(dataMode, page === 'map');
  // always loaded (cheap: the server caches it for hours) so sector rotation pings work on every page
  const flowsData = useFlows(lateMode, true);
  // Hold Alt / Option to see every keyboard shortcut on screen
  useEffect(() => {
    const root = document.documentElement;
    const on = (e: KeyboardEvent) => { if (e.key === 'Alt') root.classList.add('show-keys'); };
    const off = (e?: KeyboardEvent) => { if (!e || e.key === 'Alt') root.classList.remove('show-keys'); };
    const blur = () => off();
    window.addEventListener('keydown', on); window.addEventListener('keyup', off); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', off); window.removeEventListener('blur', blur); };
  }, []);
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
        out[s] = r ? { ...d, last: r.last, chgPct: r.chgPct, rsRank: r.rsRank ?? NaN, spark: scan.bases[s]?.spark } : d;
        continue;
      }
      const lq = qs?.quotes[s];
      out[s] = { ...blankQuote(s, DEMO_QUOTES[s]?.name), last: lq?.last ?? NaN, chgPct: lq?.chgPct ?? NaN, rsRank: r?.rsRank ?? NaN, spark: scan.bases[s]?.spark };
    }
    if (!out[sel]) out[sel] = blankQuote(sel);
    return out;
  }, [live, qs, quoteSyms, sel, rowBy, scan.bases]);
  const tickers = useMemo(() => Object.values(quotes).map((q) => ({ sym: q.sym, name: q.name })), [quotes]);
  const morningSyms = useMemo(() => [...new Set([...stars, ...Object.keys(quotes).filter((s) => !INDEXES.includes(s))])].slice(0, 40), [stars, quotes]);
  const morning = useMorning(dataMode, page === 'morning', morningSyms);

  const demoLast = (s: string) => DEMO_QUOTES[s]?.last ?? 100;
  const spyD = useSeries('SPY', 'D', dataMode, demoLast('SPY'));
  const spy5 = useSeries('SPY', '5m', dataMode, demoLast('SPY'));
  const qqqD = useSeries('QQQ', 'D', dataMode, demoLast('QQQ'));
  // regime badge: SPY vs its 50/200-day averages + dealer-gamma sign; live data only
  const spyGamma = useGammaLv('SPY', live);
  // Movement watch: priced-in move (VIX) against how far SPY actually moves, plus theta burn. Neutral on direction. Live data only.
  const macroPack = useMacroPack(dataMode).pack;
  // the free quote providers only give ~100 daily bars; the macro pack carries about 3 years of SPY from Yahoo, used when it is longer
  const longSpy = useMemo(() => (macroPack?.spy && macroPack.spy.length > spyD.bars.length ? macroPack.spy.map(([time, open, high, low, close]) => ({ time, open, high, low, close, volume: 0 })) : spyD.bars), [macroPack, spyD.bars]);
  const vol = useMemo(() => (live && macroPack?.vix.length ? volRead(macroPack.vix, longSpy) : null), [live, macroPack, longSpy]);
  const dayStats = useMemo(() => (live && spyD.freshness !== 'demo' ? moveStats(longSpy, macroPack?.events ?? {}) : null), [live, macroPack, longSpy, spyD.freshness]);
  const movement = useMemo(() => {
    const vix = macro?.vix?.value, last = quotes.SPY?.last;
    if (!live || spyD.freshness === 'demo' || !vix || !last) return null;
    const minutesLeft = clk.session === 'Regular session' ? Math.max(0, Math.round((clk.closeSod - clk.et.sod) / 60)) : null;
    return movementRead({ spot: last, iv: vix / 100, closes: spyD.bars.map((b) => b.close), minutesLeft, gamma: spyGamma?.regime ?? null });
  }, [live, macro, quotes.SPY?.last, spyD.bars, spyD.freshness, spyGamma, clk.session, Math.floor(clk.et.sod / 600)]); // eslint-disable-line react-hooks/exhaustive-deps
  const qqq5 = useSeries('QQQ', '5m', dataMode, demoLast('QQQ'));
  const selD = useSeries(sel, 'D', dataMode, demoLast(sel));
  const sel5 = useSeries(sel, '5m', dataMode, demoLast(sel));
  const seriesTf: TF = layout.tf;
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

  // premarket high/low (free extended-hours bars from Alpha Vantage, SPY and QQQ only)
  const [pmLv, setPmLv] = useState<Record<string, { high: number; low: number } | null>>({});
  useEffect(() => {
    if (!live) return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      try { const r = await fetch('/api/research?fn=premarket'); const j = await r.json(); if (!stop && r.ok) setPmLv(j.levels ?? {}); } catch { /* keep */ }
      if (!stop) t = setTimeout(go, 15 * 60_000);
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [live]);

  const levelCol = useCallback(
    (sym: string, d: SeriesState, i5: SeriesState): LevelCol => {
      const daily = patch(d, sym, 'D').bars, intra = patch(i5, sym, '5m').bars;
      const day = live ? sessionDay : undefined;
      return {
        sym,
        last: live ? quotes[sym]?.last ?? (intra.at(-1)?.close ?? NaN) : intra.at(-1)?.close ?? NaN,
        levels: levelsForHours(computeLevels({ daily, intraday: intra, orMinutes: orMin, hasExtendedHours: false, sessionDay: day, nowEnc }).map((l) => {
          const pm = live ? pmLv[sym] : null;
          return pm && (l.id === 'pmh' || l.id === 'pml') ? { ...l, value: l.id === 'pmh' ? pm.high : pm.low, status: undefined } : l;
        }), toolHours(now, orMin)),
        freshness: worst(d.freshness, i5.freshness),
        asOf: i5.asOf || d.asOf || undefined,
        source: [...new Set([d.source, i5.source].filter(Boolean))].join(' + '),
        error: i5.error || d.error,
      };
    },
    // recompute when bars, quotes or the OR setting change (not every clock tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch, orMin, live, sessionDay, quotes, pmLv, Math.floor(nowEnc / 60), Math.floor(now / 60_000)],
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
  // rebuilt when trades change and once a minute, so an option that has just expired closes at $0 without a reload
  const nowMin = Math.floor(now / 60_000);
  const views = useMemo(() => trades.filter((t) => !t.deleted).map((t) => viewTrade(t, { now: nowMin * 60_000 })), [trades, nowMin]);
  const liveTransfers = useMemo(() => transfers.filter((t) => !t.deleted), [transfers]);
  const lastPx = useCallback((s: string) => { const x = quotes[s]?.last; return Number.isFinite(x) ? x : undefined; }, [quotes]);
  const g = useMemo(() => guard(views, liveTransfers, settings, now, lastPx), [views, liveTransfers, settings, now, lastPx]);
  useEffect(() => { setFastTick(!!g.cooldownUntil && g.cooldownUntil > Date.now()); }, [g.cooldownUntil, now]);
  // panels that load on first use are fetched quietly once the desk is idle, so the first click on them is instant
  useEffect(() => {
    const loaders = [() => import('./components/Journal'), () => import('./components/Recap'), () => import('./components/OrderTicket'), () => import('./components/CompanyPage'),
      () => import('./components/Distress'), () => import('./components/DayCases'), () => import('./components/Morning'), () => import('./components/Home'), () => import('./components/Chart'),
      () => import('./components/Playbooks'), () => import('./components/Replay'), () => import('./components/SmartMoney'), () => import('./components/EtfSectors'), () => import('./components/Gamma')];
    const idle = (f: () => void) => ('requestIdleCallback' in window ? (window as any).requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 200));
    let i = 0, stop = false;
    const next = () => { if (stop || i >= loaders.length) return; loaders[i++]().catch(() => {}).finally(() => idle(next)); };
    const t = setTimeout(() => idle(next), 4000);
    return () => { stop = true; clearTimeout(t); };
  }, []);
  const today = etDay(now);
  const checkin = checkins.find((c) => c.day === today);
  const viols = useMemo(() => findViolations(views, liveTransfers, settings, checkins), [views, liveTransfers, settings, checkins]);
  const rulesData = useMemo(() => ({ g, settings, checkedIn: !!checkin, viols, hasAccount: settings.startBalance != null && g.startOfDay > 0 }), [g, settings, checkin, viols]);
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
  // what the recap overlay shows: rebuilt from the journal as it is now, so a CSV added late updates that day's card
  const shownRecaps = useMemo(() => liveRecaps(recaps, views, viols, today, checkin, et(now).sod < clk.closeSod), [recaps, views, viols, today, checkin, Math.floor(now / 60_000)]); // eslint-disable-line react-hooks/exhaustive-deps
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
    useMemo(() => ({ ...OFFLINE_NAMES, ...Object.fromEntries(Object.values(DEMO_QUOTES).map((q) => [q.sym, q.name])) }), []));
  const toggleStar = useCallback((sym: string) => {
    setStars((xs) => (xs.includes(sym) ? xs.filter((x) => x !== sym) : [...xs, sym]));
    flash(stars.includes(sym) ? `${sym} unstarred` : `★ ${sym} starred: pings for news, earnings, moves, levels`, 2500);
    try { if (Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ }
  }, [stars, setStars, flash]);
  const openCompany = useCallback((sym: string) => { setCompanySym(sym); setPage('company'); }, [setCompanySym, setPage]);
  const [article, setArticle] = useState<Article | null>(null);
  const [info, setInfo] = useState<{ sym: string; at: { x: number; y: number } } | null>(null);
  const openInfo = useCallback((sym: string, at?: { x: number; y: number }) => setInfo({ sym, at: at ?? { x: window.innerWidth / 2 - 170, y: 120 } }), []);
  const [orderReq, setOrderReq] = useState<{ initial: Partial<OrderDraft>; last?: number | null } | null>(null);
  const openOrder = useCallback((initial: Partial<OrderDraft>, last?: number | null) => setOrderReq({ initial, last }), []);
  const desk: DeskCtx = useMemo(() => ({ stars, toggleStar, names, openCompany, openArticle: setArticle, openInfo, openOrder, alertWords, setAlertWords }), [stars, toggleStar, names, openCompany, openInfo, openOrder, alertWords, setAlertWords]);

  const fired = useRef<Set<string>>(new Set(load<string[]>('pingFired', [])));
  const pushPings = useCallback((ps: Ping[]) => {
    if (!ps.length) return;
    save('pingFired', [...fired.current].slice(-600));
    setPings((x) => [...ps, ...x].slice(0, 20));
    setPingLog((l) => [...ps, ...l].slice(0, 200));
    beep();
    try { if (Notification.permission === 'granted' && document.hidden) for (const p of ps) new Notification(`★ ${p.sym}: ${p.text}`, { tag: p.id }); } catch { /* not supported */ }
  }, [setPingLog]);
  // rotation: ping when a sector / theme / country turns (Lagging->Improving, Improving->Leading, Leading->Weakening, Weakening->Lagging)
  useEffect(() => {
    if (!live || !flowsData?.rows.length) return;
    const prev = load<Record<string, { q: string; day: string }>>('rotQuad', {});
    const { turns, next } = rotationTurns(flowsData.rows, prev);
    save('rotQuad', next);
    if (!Object.keys(prev).length) return; // first time: just remember where everything is
    pushPings(turns.slice(0, 6).map((t) => ({ id: `rot:${t.sym}:${t.day}`, t: Date.now(), sym: t.sym, kind: 'rotation' as const, text: `${t.label} ${t.text}`, tone: t.tone })));
  }, [flowsData, live, pushPings]);
  // keyword alerts: a new message (filing, stake, insider trade, press release, Fed…) that contains one of your words.
  // The first load only marks what's already there, so old messages don't ring.
  const feedPrimed = useRef(false);
  useEffect(() => {
    if (!feed?.items.length || feed.demo) return;
    const fresh: Ping[] = [];
    for (const m of feed.items) {
      if (m.kind === 'live') continue;
      const hits = alertWords.length ? keywordHits(m, alertWords) : [];
      if (!hits.length) continue;
      const id = `kw:${m.id}`;
      if (fired.current.has(id)) continue;
      fired.current.add(id);
      if (feedPrimed.current && Date.now() - m.t < 6 * 3600_000) fresh.push({ id, t: Date.now(), sym: m.sym ?? '', kind: 'keyword', text: `“${hits.join('”, “')}”: ${m.title}`, url: m.url, tone: m.tone });
    }
    feedPrimed.current = true;
    pushPings(fresh.slice(0, 5));
  }, [feed?.asOf, alertWords.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // open a widget on the current Home workspace (add it if missing, else update its settings), then go Home
  const openWidget = (type: WidgetType, cfg: Record<string, any> = {}) => {
    setSpaces((s) => ({ ...s, list: s.list.map((w) => {
      if (w.id !== s.active) return w;
      const l = w.layout, ex = [...l.main, ...l.side].find((x) => x.type === type);
      if (ex) { const up = (xs: typeof l.main) => xs.map((x) => (x.id === ex.id ? { ...x, cfg: { ...x.cfg, ...cfg } } : x)); return { ...w, layout: { main: up(l.main), side: up(l.side) } }; }
      const sz = DEFAULT_SIZE[type];
      return { ...w, layout: { ...l, main: addTop(l.main, { id: `${type}-${Date.now().toString(36)}`, type, x: 0, y: 0, w: sz.w, h: sz.h, cfg }) } };
    }) }));
    setPage('home');
  };
  // short codes, like a terminal: type the code in the command bar (Ctrl/Cmd K)
  const codes: Cmd[] = [
    ['des', 'DES · Company tear sheet', () => { setCompanySym(sel); setPage('company'); }],
    ['cf', 'CF · SEC filings, stakes, insider trades, press releases', () => setPage('messages')],
    ['ecal', 'ECAL · Earnings calendar', () => setPage('calendar')], ['ipo', 'IPO · IPO calendar', () => setPage('calendar')],
    ['tran', 'TRAN · Call transcripts (Earnings calls tab)', () => setPage('calendar')], ['live', 'LIVE · Today\'s earnings calls and webcasts', () => setPage('calendar')],
    ['eco', 'ECO · Economic calendar and countdowns', () => setPage('calendar')], ['wirp', 'WIRP · Fed rate odds', () => setPage('calendar')],
    ['most', 'MOST · Most active, gainers, losers', () => openWidget('movers', { list: 'active' })],
    ['hmap', 'HMAP · Index heatmap (ETFs & sectors)', () => setPage('etfs')],
    ['halt', 'HALT · Trading halts', () => openWidget('halts')], ['moso', 'MOSO · Most active options', () => openWidget('optactive')],
    ['imov', 'IMOV · Index movers (S&P 500 / Nasdaq-100)', () => openWidget('idxmovers')],
    ['wei', 'WEI · World equity indices', () => openWidget('world', { tab: 'indices' })], ['weif', 'WEIF · World index futures', () => openWidget('world', { tab: 'futures' })],
    ['fx', 'FX · FX pairs', () => openWidget('world', { tab: 'fx' })], ['fxip', 'FXIP · Currency strength', () => openWidget('world', { tab: 'fx' })],
    ['tas', 'TAS · Time & sales (IEX)', () => openWidget('tape', { sym: sel })], ['perp', 'PERP · Crypto perpetuals and funding', () => openWidget('perps')],
    ['gc', 'GC · Yield curve', () => openWidget('rates')], ['gtmm', 'GTMM · Rates dashboard', () => openWidget('rates')],
    ['glco', 'GLCO · Commodities', () => openWidget('commodities')], ['pmi', 'PMI · Prediction markets', () => setPage('odds')],
    ['hldr', 'HLDR · 13F holdings (smart money)', () => setPage('smart')], ['hfnd', 'HFND · Hedge funds and long-only managers', () => setPage('smart')],
    ['eqs', 'EQS · Equity screener', () => setPage('scanner')], ['trend', 'TREND · Trending tickers (Reddit)', () => openWidget('trending')],
    ['hms', 'HMS · Compare securities', () => openWidget('analysis', { tab: 'compare', syms: [sel, 'SPY'] })],
    ['beta', 'BETA · Beta regression', () => openWidget('analysis', { tab: 'beta', syms: [sel] })], ['hrh', 'HRH · Return distribution', () => openWidget('analysis', { tab: 'returns', syms: [sel] })],
    ['ovdv', 'OVDV · Volatility surface (Gamma & IV)', () => setPage('gamma')], ['gv', 'GV · Gamma levels and IV', () => setPage('gamma')],
    ['kelly', 'KELLY · Odds of your next trades (simulator)', () => openWidget('sim')], ['calc', 'CALC · Risk and position calculator', () => openWidget('risk')],
    ['note', 'NOTE · Sticky notes', () => openWidget('notes')], ['al', 'AL · Keyword alerts (Messages)', () => setPage('messages')],
    ['qm', 'QM · Quote monitor (watchlist on the desk)', () => setPage('desk')], ['shrt', 'SHRT · Most-shorted stocks', () => openWidget('hisi')],
    ['hous', 'HOUS · Housing (Zillow)', () => openWidget('housing')],
  ].map(([id, label, run]) => ({ id: id as string, label: label as string, run: run as () => void, code: true, group: 'Codes' }));
  // codes that take a ticker ("NVDA DES", "AAPL BETA")
  const withSym: Record<string, (s: string) => void> = {
    des: (s) => { setCompanySym(s); setPage('company'); }, tas: (s) => openWidget('tape', { sym: s }),
    hms: (s) => openWidget('analysis', { tab: 'compare', syms: [s, 'SPY'] }), beta: (s) => openWidget('analysis', { tab: 'beta', syms: [s] }), hrh: (s) => openWidget('analysis', { tab: 'returns', syms: [s] }),
  };
  for (const c of codes) if (withSym[c.id]) c.runSym = withSym[c.id];
  const commands: Cmd[] = [
    ...codes,
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
    { id: 'order', label: 'Webull order ticket (you approve every order)', run: () => openOrder({ sym: sel, side: 'BUY', type: 'LIMIT' }, Number.isFinite(quotes[sel]?.last) ? quotes[sel].last : null) },
    { id: 'gamma', label: 'Gamma & IV: call wall, put wall, zero-gamma flip, IV surface (SPY, QQQ, IWM, SPX)', hint: 'V', run: () => setPage('gamma') },
    { id: 'morning', label: 'Morning plan: premarket movers, sectors, setups, events (before 11am)', hint: 'W', run: () => setPage('morning') },
    { id: 'map', label: 'World map page', hint: 'M', run: () => setPage('map') },
    { id: 'globe', label: 'Sector rotation page', hint: 'G', run: () => setPage('flows') },
    { id: 'etfs', label: 'ETFs & sectors: heatmap, ETF holdings, baskets', hint: 'U', run: () => setPage('etfs') },
    { id: 'smart', label: 'Smart money: 13F investors, ARK, politicians', hint: 'I', run: () => setPage('smart') },
    { id: 'odds', label: 'Economic odds (Fed, recession, CPI)', hint: 'Y', run: () => setPage('odds') },
    { id: 'status', label: 'Data status: which sources are working or limited', hint: '⇧B', run: () => setPage('status') },
    { id: 'mtf', label: 'Multi-timeframe: 4 linked charts (3m, 15m, 1h, daily)', hint: '⇧M', run: () => setPage('mtf') },
    { id: 'distress', label: 'Distress: weak companies, turnarounds, sector stress', hint: '⇧R', run: () => setPage('distress') },
    { id: 'd', label: 'Chart: daily', hint: '1', run: () => setTf('D') },
    { id: '1h', label: 'Chart: 1-hour', hint: '2', run: () => setTf('1H') },
    { id: '5m', label: 'Chart: 5-minute', hint: '3', run: () => setTf('5m') },
    { id: '15m', label: 'Chart: 15-minute', hint: '6', run: () => setTf('15m') },
    { id: 'theme', label: 'Toggle light / dark', hint: 'T', run: toggleTheme },
    { id: 'scene-live', label: 'River scene: moving boats (dark theme)', run: () => { setScene('live'); if (theme !== 'dark') toggleTheme(); } },
    { id: 'scene-still', label: 'River scene: still picture, nothing moves', run: () => { setScene('still'); if (theme !== 'dark') toggleTheme(); } },
    { id: 'scene-off', label: 'River scene: off (plain dark desk)', run: () => setScene('off') },
    { id: 'focus', label: 'Focus mode: hide side bars, strips and ticker', hint: 'Z', run: () => toggleFocus() },
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
        w: () => setPage('morning'), v: () => setPage('gamma'), h: () => setPage('home'), e: () => setPage('messages'), d: () => setPage('desk'), x: () => setPage('patterns'), s: () => setPage('scanner'), m: () => setPage('map'), g: () => setPage('flows'), c: () => setPage('calendar'), u: () => setPage('etfs'), i: () => setPage('smart'), y: () => setPage('odds'), B: () => setPage('status'), R: () => setPage('distress'), M: () => setPage('mtf'),
        '?': () => setOverlay((o) => (o === 'help' ? null : 'help')),
        t: toggleTheme,
        z: () => toggleFocus(),
        a: () => setDrawer((d) => !d),
        l: () => setLayout({ levelsOpen: !layout.levelsOpen }),
        p: () => setPbOpen(true),
        J: () => setPage('journal'),
        '1': () => setTf('D'), '2': () => setTf('1H'), '3': () => setTf('5m'), '4': () => setTf('W'), '5': () => setTf('M'), '6': () => setTf('15m'),
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
    calendar: <Calendars cal={cal} now={now} onSelect={setSel} mySyms={new Set([...wlSyms, ...stars])} mode={dataMode} news={news.items} />,
  };
  const chart = (onPopout?: () => void) => (
    <Suspense fallback={<section className="panel chart-panel"><div className="ph-body muted small">Loading chart…</div></section>}>
    <ChartPanel mode={dataMode}
      sym={sel} name={q.name} last={live ? q.last : chartSeries.bars.at(-1)?.close ?? q.last} chgPct={q.chgPct}
      tf={layout.tf} onTf={setTf} theme={theme} series={chartSeries} levels={selLevels} onPopout={onPopout}
      news={news.items} onSelect={setSel}
    />
    </Suspense>
  );
  const levelsPanel = (
    <LevelsPanel cols={cols} orMin={orMin} setOrMin={setOrMin} alertsOn={alertsOn} toggleAlerts={toggleAlerts} onSelect={setSel} sel={sel} onClose={() => setLayout({ levelsOpen: false })} />
  );

  /* ---------- Popped-out single panel ---------- */
  if (POPOUT) {
    return (
      <Desk.Provider value={desk}>
      <div className="popout">
        {POPOUT === 'chart' && <div className="center">{chart()}{layout.levelsOpen && levelsPanel}</div>}
        {POPOUT === 'watchlist' && <Watchlist {...wlProps} />}
        {POPOUT === 'right' && <RightRail {...rightProps} />}
        {POPOUT === 'ticker' && <NewsTicker headlines={news.items} fresh={news.freshness} asOf={news.asOf} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}
        {toast && <div className="toast" role="status">{toast}</div>}
        <Suspense fallback={null}>{article && <ReaderOverlay a={article} mode={dataMode} onClose={() => setArticle(null)}  />}</Suspense>
      </div>
      </Desk.Provider>
    );
  }

  /* ---------- Desk: side menu + pages (laptop) ---------- */
  const leftShown = narrow ? narrowLeft : layout.leftOpen;
  const rightW = narrow ? Math.min(layout.right, 300) : layout.right;
  const cols3 = `${leftShown ? `${Math.min(layout.left, narrow ? 220 : 520)}px 5px` : '0 0'} minmax(0,1fr) ${layout.rightOpen ? `5px ${rightW}px` : '0 0'}`;
  const toDesk = (s: string) => { setSel(s); setPage('desk'); };
  const closedR = views.filter((v) => v.status === 'closed' && !v.t.deleted).map((v) => ({ r: v.r, realized: v.realized }));
  const flowSwitch = <PageTabs<'flow' | 'companies'> value={flowView} onChange={setFlowView} options={[{ id: 'flow', label: 'Sector rotation' }, { id: 'companies', label: 'Companies map' }]} />;
  let body: ReactNode;
  if (page === 'scanner') {
    body = <div className="page page-split"><section className="panel rr"><div className="rr-body">{scanner}</div></section><div className="center">{chart()}</div></div>;
  } else if (page === 'calendar') {
    body = <div className="page page-split"><section className="panel cal-page"><Calendars cal={cal} now={now} onSelect={setSel} mySyms={new Set([...wlSyms, ...stars])} mode={dataMode} news={news.items} /></section><div className="center">{chart()}</div></div>;
  } else if (page === 'journal') {
    body = <div className="page"><Suspense fallback={<section className="panel"><div className="ph-body muted small">Loading journal…</div></section>}><JournalOverlay views={views} setTrades={setTrades} transfers={transfers} setTransfers={setTransfers} onAutoStart={(t) => setSettings((s) => (s.startBalance == null ? { ...s, startBalance: 0, startDate: t } : s))} violations={viols} lastPx={lastPx} settings={settings} onClose={() => setPage('desk')} onSelect={toDesk} onReplay={setReplayId} canSample={!live} /></Suspense></div>;
  } else if (page === 'messages') {
    body = <div className="page"><section className="panel msgs-page"><div className="phead"><div className="phead-title">Messages: earnings, Fed, White House, economy</div></div><Messages feed={feed} cal={cal} nowMs={now} onChart={toDesk} /></section></div>;
  } else if (page === 'gamma') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <Gamma mode={dataMode} onChart={toDesk} />
      </Suspense>
    );
  } else if (page === 'morning') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <Morning data={morning} cal={cal} pm={pmLv} rules={rulesData} now={now} watch={morningSyms} onChart={toDesk} onCheckIn={() => setCiOpen(true)} mode={dataMode} />
      </Suspense>
    );
  } else if (page === 'home') {
    body = (
      <Suspense fallback={<div className="page"><section className="panel"><div className="ph-body">Loading…</div></section></div>}>
        <Home spaces={spaces} setSpaces={setSpaces} tickers={tickers.map((t) => ({ sym: t.sym, name: names[t.sym] ?? t.name }))}
          d={{ mode: dataMode, theme, quotes, news, cal, movers, clk, macro, pingLog, sel, pingAt, setPingAt, onChart: toDesk, demoLast, feed, now, openPage: (p: string) => setPage(p as Page), trades: closedR, riskPct: settings.riskPct, equity: settings.startBalance == null ? null : g.equity, playbooks, rules: rulesData }} />
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
  } else if (page === 'mtf') {
    body = (
      <div className="page">
        <Suspense fallback={<section className="panel"><div className="ph-body">Loading…</div></section>}>
          <MtfPage mode={dataMode} mySyms={[...new Set([...wlSyms, sel])]} />
        </Suspense>
      </div>
    );
  } else if (page === 'distress') {
    body = (
      <div className="page">
        <Suspense fallback={<section className="panel"><div className="ph-body">Loading…</div></section>}>
          <DistressPage mode={dataMode} mySyms={[...new Set([...wlSyms, sel])]} onChart={toDesk} />
        </Suspense>
      </div>
    );
  } else if (page === 'status') {
    body = <div className="page"><DataStatus mode={dataMode} /></div>;
  } else if (page === 'smart' || page === 'etfs' || page === 'odds') {
    body = (
      <div className="page">
        <Suspense fallback={<section className="panel"><div className="ph-body">Loading…</div></section>}>
          {page === 'smart' ? <SmartMoney mode={dataMode} onChart={toDesk} /> : page === 'etfs' ? <EtfSectors mode={dataMode} onChart={toDesk} /> : <EconOdds mode={dataMode} />}
        </Suspense>
      </div>
    );
  } else if (page === 'map' || page === 'flows') {
    body = (
      <div className="page">
        <Suspense fallback={<section className="panel"><div className="ph-body">Loading…</div></section>}>
          {page === 'map'
            ? <WorldMap mode={dataMode} data={worldData} symbols={[...new Set([...INDEXES, ...wlSyms, ...universe])]} names={Object.fromEntries(Object.values(quotes).map((x) => [x.sym, x.name]))} onSelect={toDesk} onClose={() => setPage('desk')} />
            : flowView === 'companies'
              ? <CompanyMap mode={dataMode} extra={flowSwitch} onChart={toDesk} onClose={() => setPage('desk')} />
              : <Rotation data={flowsData} onSelect={toDesk} extra={flowSwitch} />}
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
    <div className={`shell ${focus ? 'focus' : ''}`} data-group={pageGroup(page)}>
      {river && <Suspense fallback={null}><RiverScene still={scene === 'still'} /></Suspense>}
      <Suspense fallback={null}><HoverCard quotes={quotes} names={OFFLINE_NAMES} /></Suspense>
      {focus && <button className="focus-chip" onClick={toggleFocus} title="Bring the side bars back (Z)">Focus mode · Z to exit</button>}
      <SideNav compact={iconRail} page={page} onPage={setPage} dataState={dataMode.kind} onCmd={() => setCmdOpen(true)} onHelp={() => setOverlay('help')} onAccount={() => setDrawer((d) => !d)} />
      <div className={`app ${layout.tickerOpen ? '' : 'no-ticker'} ${layout.fearOpen !== false ? 'has-fear' : ''}`}>
        <TopStrip
          movement={movement} vol={vol} moveStats={dayStats}
          quotes={quotes} clk={clk} mode={mode} override={override} onOverride={setOverride} onSelect={setSel}
          onAccount={() => setDrawer((d) => !d)} accountOpen={drawer} theme={theme} onTheme={toggleTheme} onCmd={() => setCmdOpen(true)} onWorld={() => setPage('map')}
          account={{ guard: g, settings, demo: views.some((v) => v.t.demo), demoPrices }}
          marketSource={market?.status?.source}
          quoteFresh={quoteFresh} quoteAsOf={live ? qs?.asOf : DEMO_AT} quoteSource={live ? qs?.source : 'Generated sample quotes'} macro={macro} live={live}
        />
        {layout.fearOpen !== false && <FearStrip macro={macro} quotes={quotes} live={live} />}
        {body}
        {layout.tickerOpen && <NewsTicker headlines={news.items} fresh={news.freshness} asOf={news.asOf} boards={boards} watchOnly={watchOnly} setWatchOnly={setWatchOnly} onSelect={setSel} />}

      </div>

      <CommandBar
        open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} tickers={tickers} onTicker={setSel} quotes={quotes} pages={NAV_PAGE_IDS}
        allowAny={live ? (s) => SYMBOL_RE.test(s) : undefined}
      />
      {(drawer || drawerSeen) && <Suspense fallback={null}><AccountDrawer open={drawer} onClose={() => setDrawer(false)} theme={theme} views={views} transfers={liveTransfers} settings={settings} setSettings={setSettings} guard={g} onImport={() => { setDrawer(false); setPage('journal'); }} /></Suspense>}
      <Suspense fallback={null}>{recapOpen !== false && <RecapOverlay recaps={shownRecaps} initialDay={recapOpen || undefined} onClose={() => setRecapOpen(false)} onReplay={setReplayId} csvFor={csvFor}
        importDeps={{ setTrades, setTransfers, settings, onAutoStart: (t) => setSettings((s) => (s.startBalance == null ? { ...s, startBalance: 0, startDate: t } : s)) }} onOpenImport={() => { setRecapOpen(false); save('journalTab', 'import'); setPage('journal'); }} />}</Suspense>
      <Suspense fallback={null}>{replayView && <ReplayOverlay v={replayView} live={live} theme={theme} rules={exitRules} setRules={setExitRules} onClose={() => setReplayId(null)} />}</Suspense>
      {ciOpen && <CheckInDialog day={today} existing={checkin} onClose={() => setCiOpen(false)} onSave={(c) => { setCheckins((x) => [...x.filter((y) => y.day !== c.day), c]); setCiOpen(false); }} />}
      <Suspense fallback={null}>{pbOpen && <PlaybookEditor playbooks={playbooks} setPlaybooks={setPlaybooks} activeId={activePb?.id ?? ''} setActiveId={(id) => setScanPrefs((x) => ({ ...x, playbookId: id }))} rows={rows} vwap={vwapBy} onClose={() => setPbOpen(false)} />}</Suspense>
      {syncOpen && <SyncDialog user={cloudUser?.email ?? null} onClose={() => setSyncOpen(false)} />}
      {overlay === 'help' && <OverlayView kind="help" onClose={() => setOverlay(null)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      <Suspense fallback={null}>{article && <ReaderOverlay a={article} mode={dataMode} onClose={() => setArticle(null)}  />}</Suspense>
      <Suspense fallback={null}>{orderReq && <OrderTicket initial={orderReq.initial} last={orderReq.last ?? (orderReq.initial.sym && Number.isFinite(quotes[orderReq.initial.sym]?.last) ? quotes[orderReq.initial.sym].last : null)} live={live} onClose={() => setOrderReq(null)} onPlaced={(t) => flash(`Sent to Webull: ${t}`, 5000)} />}</Suspense>
      {info && <TickerInfo key={info.sym} sym={info.sym} at={info.at} mode={dataMode} onClose={() => setInfo(null)} onChart={toDesk} onCompany={openCompany} />}
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
