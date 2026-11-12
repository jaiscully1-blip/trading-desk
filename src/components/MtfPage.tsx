// Multi-timeframe page (⇧M): four dockable charts. Linked mode puts one ticker on 3m / 15m / 1h / daily at once (trend structure on
// the higher timeframes, execution on the lower); unlinked mode gives each chart its own ticker and timeframe. Search any ticker,
// or tap an index, a top stock or one of yours. Drag a chart's tab to rearrange; the layout is saved in this browser.
// Data: Yahoo's public chart data, about 15 minutes delayed (unofficial). Nothing here can trade.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts';
import { dayFibs, priorDayHL } from '../../shared/dayfib';
import type { DataMode } from '../data/live';
import type { Bar } from '../../shared/types';
import { MTF_LABEL, MTF_TFS, type MtfTF } from '../../shared/mtf';
import { CompanySearch } from './CompanySearch';
import { Fresh } from './common';
import { usePersisted } from '../lib/store';

interface Slot { id: string; sym: string; tf: MtfTF }
const LINKED_TFS: MtfTF[] = ['3m', '15m', '1h', '1d'];
const DEFAULT_SLOTS: Slot[] = LINKED_TFS.map((tf, i) => ({ id: `c${i + 1}`, sym: 'SPY', tf }));
const INDEXES = ['SPY', 'QQQ', 'IWM', 'DIA'];
const TOP = ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'TSLA', 'AMD', 'GOOGL'];
const REFRESH: Record<MtfTF, number> = { '1m': 30_000, '3m': 45_000, '5m': 60_000, '15m': 90_000, '1h': 180_000, '4h': 300_000, '1d': 600_000, '1w': 1_800_000 };
const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

interface Ctx { slots: Slot[]; active: string; setActive: (id: string) => void; setSlot: (id: string, p: Partial<Slot>) => void; linked: boolean; mode: DataMode; fib: boolean }
const MtfCtx = createContext<Ctx | null>(null);

/** EMA of closes */
function ema(bars: Bar[], n: number) { const k = 2 / (n + 1); let e = NaN; return bars.map((b) => { e = Number.isFinite(e) ? b.close * k + e * (1 - k) : b.close; return { time: b.time as UTCTimestamp, value: e }; }); }
/** simple moving average */
function sma(bars: Bar[], n: number) { const out: { time: UTCTimestamp; value: number }[] = []; let s = 0; bars.forEach((b, i) => { s += b.close; if (i >= n) s -= bars[i - n].close; if (i >= n - 1) out.push({ time: b.time as UTCTimestamp, value: s / n }); }); return out; }
/** session VWAP, restarting each day (bar times are exchange-local seconds) */
function vwap(bars: Bar[]) { let day = -1, pv = 0, v = 0; return bars.map((b) => { const d = Math.floor(b.time / 86400); if (d !== day) { day = d; pv = 0; v = 0; } const tp = (b.high + b.low + b.close) / 3; pv += tp * b.volume; v += b.volume; return { time: b.time as UTCTimestamp, value: v ? pv / v : b.close }; }); }

function useBars(sym: string, tf: MtfTF, mode: DataMode) {
  const [st, setSt] = useState<{ bars: Bar[]; name: string; asOf: number; error?: string; loading: boolean }>({ bars: [], name: '', asOf: 0, loading: true });
  useEffect(() => {
    if (mode.kind !== 'live') { setSt({ bars: [], name: '', asOf: 0, loading: false, error: 'Needs live data: this page never draws made-up candles.' }); return; }
    let stop = false;
    setSt((s) => ({ ...s, loading: true, error: undefined }));
    const go = () => fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(sym)}&tf=${tf}`).then((r) => r.json()).then((j) => {
      if (stop) return;
      setSt(j.bars ? { bars: j.bars, name: j.name ?? '', asOf: j.asOf, loading: false } : { bars: [], name: '', asOf: 0, loading: false, error: j.error ?? 'No data' });
    }).catch((e) => !stop && setSt((s) => ({ ...s, loading: false, error: String(e) })));
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, REFRESH[tf]);
    return () => { stop = true; clearInterval(id); };
  }, [sym, tf, mode.kind]);
  return st;
}

function MtfChart({ slot }: { slot: Slot }) {
  const ctx = useContext(MtfCtx)!;
  const { bars, name, asOf, error, loading } = useBars(slot.sym, slot.tf, ctx.mode);
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const ser = useRef<{ c: ISeriesApi<'Candlestick'>; v: ISeriesApi<'Histogram'>; a: ISeriesApi<'Line'>; b: ISeriesApi<'Line'>; w: ISeriesApi<'Line'> } | null>(null);
  const fitted = useRef('');
  const intraday = !['1d', '1w'].includes(slot.tf);

  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--chart-bg') || cssVar('--panel') }, textColor: cssVar('--muted'), fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line }, timeScale: { borderColor: line, timeVisible: intraday, secondsVisible: false, rightOffset: 3 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const cs = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    ser.current = { c: cs, v, a: c.addSeries(LineSeries, { ...common, color: cssVar('--warn') }), b: c.addSeries(LineSeries, { ...common, color: cssVar('--demo') }), w: c.addSeries(LineSeries, { ...common, color: cssVar('--vwap') || cssVar('--accent'), lineWidth: 2 }) };
    chart.current = c;
    fitted.current = '';
    return () => { c.remove(); chart.current = null; ser.current = null; };
  }, [intraday]);

  useEffect(() => {
    const x = ser.current, c = chart.current;
    if (!x || !c) return;
    const up = cssVar('--up'), down = cssVar('--down');
    x.c.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    x.v.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: (b.close >= b.open ? up : down) + '55' })));
    // intraday: EMA 9 / 21 + VWAP for execution; daily / weekly: 50 / 200-day averages for structure
    x.a.setData(intraday ? ema(bars, 9) : sma(bars, 50));
    x.b.setData(intraday ? ema(bars, 21) : sma(bars, 200));
    x.w.setData(intraday ? vwap(bars) : []);
    const k = `${slot.sym}:${slot.tf}`;
    if (bars.length && fitted.current !== k) {
      const n = bars.length, show = slot.tf === '1m' ? 180 : slot.tf === '3m' ? 130 : intraday ? 120 : 160;
      c.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 2 });
      fitted.current = k;
    }
  }, [bars, intraday, slot.sym, slot.tf]);

  // today's Fibonacci levels from yesterday's high and low (not on weekly bars)
  const fibLines = useRef<IPriceLine[]>([]);
  useEffect(() => {
    const x = ser.current;
    if (!x) return;
    for (const l of fibLines.current) x.c.removePriceLine(l);
    fibLines.current = [];
    if (!ctx.fib || slot.tf === '1w') return;
    const pd = priorDayHL(bars);
    if (!pd) return;
    const gold = cssVar('--warn'), faint = cssVar('--muted');
    fibLines.current.push(x.c.createPriceLine({ price: pd.high, color: cssVar('--up'), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'PDH' }));
    fibLines.current.push(x.c.createPriceLine({ price: pd.low, color: cssVar('--down'), lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: 'PDL' }));
    for (const f of dayFibs(pd.high, pd.low)) {
      const key = f.ratio === 0.5 || f.ratio === 0.618;
      fibLines.current.push(x.c.createPriceLine({ price: f.price, color: key ? gold : faint, lineWidth: 1, lineStyle: f.kind === 'ext' ? LineStyle.SparseDotted : LineStyle.Dotted, axisLabelVisible: key, title: f.label }));
    }
  }, [bars, ctx.fib, slot.tf]);

  const last = bars.at(-1), prev = bars.at(-2);
  const chg = last && prev ? (last.close / prev.close - 1) * 100 : null;
  const on = ctx.active === slot.id;
  return (
    <div className={`mtf-cell ${on ? 'on' : ''}`} onMouseDown={() => ctx.setActive(slot.id)}>
      <div className="mtf-h">
        <b className="num">{slot.sym}</b>
        <span className="mtf-n small muted">{name}</span>
        <select value={slot.tf} onChange={(e) => ctx.setSlot(slot.id, { tf: e.target.value as MtfTF })} aria-label="Timeframe" title={ctx.linked ? 'Linked: the ticker follows the search; each chart keeps its timeframe' : 'Timeframe'}>
          {MTF_TFS.map((t) => <option key={t} value={t}>{MTF_LABEL[t]}</option>)}
        </select>
        {last && <span className="num small">{last.close.toFixed(2)}</span>}
        {chg != null && <span className={`num small ${chg >= 0 ? 'up' : 'down'}`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>}
        <span className="mtf-legend small muted">{intraday ? 'EMA 9 · EMA 21 · VWAP' : 'SMA 50 · SMA 200'}</span>
        {asOf > 0 && <Fresh kind={intraday ? 'delayed' : 'eod'} at={asOf} src="Yahoo Finance chart data (unofficial, about 15 min delayed). 3m and 4h are built from 1m and 1h bars." />}
      </div>
      <div className="mtf-chart" ref={el} />
      {(loading && !bars.length) && <div className="mtf-msg muted small">Loading {slot.sym} {MTF_LABEL[slot.tf]}…</div>}
      {error && !bars.length && <div className="mtf-msg down small">{error}</div>}
    </div>
  );
}

/** one dock panel = one chart slot */
function Panel(props: IDockviewPanelProps<{ id: string }>) {
  const ctx = useContext(MtfCtx)!;
  const slot = ctx.slots.find((s) => s.id === props.params.id);
  return slot ? <MtfChart slot={slot} /> : null;
}
const COMPONENTS = { chart: Panel };

export default function MtfPage({ mode, mySyms }: { mode: DataMode; mySyms: string[] }) {
  const [slots, setSlots] = usePersisted<Slot[]>('mtfSlots', DEFAULT_SLOTS);
  const [linked, setLinked] = usePersisted<boolean>('mtfLinked', true);
  const [active, setActive] = useState('c1');
  const [layout, setLayout] = usePersisted<object | null>('mtfLayout', null);
  const api = useRef<DockviewReadyEvent['api'] | null>(null);

  const setSlot = useCallback((id: string, p: Partial<Slot>) => setSlots((ss) => ss.map((s) => (s.id === id ? { ...s, ...p } : s))), [setSlots]);
  /** pick a ticker: linked = all four charts on their linked timeframes; unlinked = only the chart you last clicked */
  const pick = useCallback((sym: string) => {
    if (linked) setSlots((ss) => ss.map((s) => ({ ...s, sym })));
    else setSlot(active, { sym });
  }, [linked, active, setSlots, setSlot]);
  const toggleLink = () => {
    const next = !linked;
    setLinked(next);
    if (next) { const sym = slots.find((s) => s.id === active)?.sym ?? slots[0].sym; setSlots(DEFAULT_SLOTS.map((d) => ({ ...d, sym }))); }
  };

  // dock titles follow the slots
  useEffect(() => { const a = api.current; if (!a) return; for (const s of slots) a.getPanel(s.id)?.api.setTitle(`${s.sym} · ${MTF_LABEL[s.tf]}`); }, [slots]);

  const onReady = (e: DockviewReadyEvent) => {
    api.current = e.api;
    let restored = false;
    if (layout) { try { e.api.fromJSON(layout as any); restored = e.api.panels.length === 4; } catch { restored = false; } }
    if (!restored) {
      e.api.clear();
      const t = (s: Slot) => `${s.sym} · ${MTF_LABEL[s.tf]}`;
      const [a, b, c, d] = slots;
      e.api.addPanel({ id: a.id, component: 'chart', params: { id: a.id }, title: t(a) });
      e.api.addPanel({ id: b.id, component: 'chart', params: { id: b.id }, title: t(b), position: { referencePanel: a.id, direction: 'right' } });
      e.api.addPanel({ id: c.id, component: 'chart', params: { id: c.id }, title: t(c), position: { referencePanel: a.id, direction: 'below' } });
      e.api.addPanel({ id: d.id, component: 'chart', params: { id: d.id }, title: t(d), position: { referencePanel: b.id, direction: 'below' } });
    }
    e.api.onDidLayoutChange(() => { try { setLayout(e.api.toJSON()); } catch { /* ignore */ } });
  };
  const resetLayout = () => { setLayout(null); const a = api.current; if (!a) return; a.clear(); onReady({ api: a } as DockviewReadyEvent); };

  const [fib, setFib] = usePersisted<boolean>('mtfFib', true);
  const ctx = useMemo<Ctx>(() => ({ slots, active, setActive, setSlot, linked, mode, fib }), [slots, active, setSlot, linked, mode, fib]);
  const mine = [...new Set(mySyms)].filter((s) => !INDEXES.includes(s) && !TOP.includes(s)).slice(0, 10);
  const cur = slots.find((s) => s.id === active)?.sym ?? slots[0].sym;
  const chip = (s: string) => <button key={s} className={`chip sm ${slots.some((x) => x.sym === s) && (linked || cur === s) ? 'on' : ''}`} onClick={() => pick(s)}>{s}</button>;

  return (
    <MtfCtx.Provider value={ctx}>
      <section className="panel mtf">
        <div className="phead mtf-top">
          <div className="phead-title">Multi-timeframe</div>
          <CompanySearch mode={mode} onOpen={pick} current={linked ? cur : `${cur} (chart ${active.slice(1)})`} />
          <button className={`btn ${linked ? 'primary' : ''}`} onClick={toggleLink} title={linked ? 'Linked: one ticker on 3m, 15m, 1h and daily. Click to give each chart its own ticker.' : 'Unlinked: search changes only the chart you last clicked. Click to link all four.'}>
            {linked ? '🔗 Linked' : 'Unlinked'}
          </button>
          <button className={`chip sm ${fib ? 'on' : ''}`} onClick={() => setFib(!fib)} aria-pressed={fib} title="Fibonacci levels for today from yesterday's high and low (50% and 61.8% highlighted)">Fib</button>
          <button className="btn" onClick={resetLayout} title="Put the four charts back in a 2 x 2 grid">Reset layout</button>
        </div>
        <div className="mtf-chips">
          <span className="small muted">Indexes</span>{INDEXES.map(chip)}
          <span className="small muted">Top</span>{TOP.map(chip)}
          {mine.length > 0 && <><span className="small muted">Yours</span>{mine.map(chip)}</>}
        </div>
        <div className="mtf-dock">
          <DockviewReact className="dockview-theme-abyss mtf-dv" components={COMPONENTS} onReady={onReady} />
        </div>
        <p className="note">{linked ? 'Linked: the higher timeframes (1h, daily) show trend structure, the lower ones (3m, 15m) show execution. Pick a ticker and all four follow.' : 'Unlinked: click a chart, then search or tap a ticker to change just that chart. Each chart has its own timeframe.'} Drag a tab to rearrange or split the charts. Prices about 15 minutes delayed.</p>
      </section>
    </MtfCtx.Provider>
  );
}
