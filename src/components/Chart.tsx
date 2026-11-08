import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp,
} from 'lightweight-charts';
import { barIndexFor, type NewsItem } from '../../shared/news';
import { encodeInstant } from '../../shared/parse';
import { etTime } from '../lib/clock';
import type { ChartTF, TF } from '../types';
import type { DataMode } from '../data/live';
import { useHistNews } from '../data/company';
import { CoName, FlashNum, Skel, Star } from './common';
import { Ladder } from './Ladder';
import { useGammaLv } from '../data/gamma';
import { ZonePrimitive } from '../lib/zones';
import { SWING_KEYS, buildLadder, distLabel, nearestKey, type LadderIn } from '../../shared/ladder';
import type { SeriesState } from '../data/live';
import { sma, toPts, vwapSeries } from '../lib/indicators';
import { LEVEL_SHORT, type Level } from '../lib/levels';
import { usePersisted } from '../lib/store';
import { Fresh, PanelHead, Seg } from './common';
import { pct, px, tone } from '../lib/format';

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
type Overlays = { vwap: boolean; ma: boolean; lvl: boolean; cg?: boolean; gx?: boolean; lad?: boolean; swing?: boolean; zn?: boolean };
const GX_SYMS = ['SPY', 'QQQ', 'IWM'];
type CgTrade = { who: string; party: string; state: string; type: string; traded: string; filed: string; min: number | null; max: number | null };
const cgCache = new Map<string, CgTrade[]>();
const cgRange = (a: number | null, b: number | null) => { const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`); return a == null ? '' : b == null ? `${k(a)}+` : `${k(a)}–${k(b)}`; };
type FlagMode = 'sym' | 'macro' | 'both' | 'off';
const PERIOD: Record<TF, number> = { '5m': 300, '1H': 3600, D: 86400, W: 7 * 86400, M: 31 * 86400 };

export function ChartPanel({
  sym, name, last, chgPct, tf: ctf, onTf, theme, series, levels, onPopout, news = [], onSelect, mode,
}: {
  sym: string; name: string; last: number; chgPct: number; tf: ChartTF; onTf: (t: ChartTF) => void; theme: string;
  series: SeriesState; levels: Level[]; onPopout?: () => void; news?: NewsItem[]; onSelect?: (s: string) => void; mode?: DataMode;
}) {
  // Y = monthly candles, one news button per year
  const tf: TF = ctf === 'Y' ? 'M' : ctf;
  const longTf = ctf === 'D' || ctf === 'W' || ctf === 'M' || ctf === 'Y';
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [flags, setFlags] = usePersisted<FlagMode>('newsFlags', 'both');
  const [pop, setPop] = useState<{ x: number; y: number; items: NewsItem[]; label?: string } | null>(null);
  const byBar = useRef(new Map<string, NewsItem[]>());
  const byLabel = useRef(new Map<string, string>());
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const s = useRef<{ c: ISeriesApi<'Candlestick'>; v: ISeriesApi<'Histogram'>; vw: ISeriesApi<'Line'>; m20: ISeriesApi<'Line'>; m50: ISeriesApi<'Line'> } | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const gxLines = useRef<IPriceLine[]>([]);
  const zp = useRef<ZonePrimitive | null>(null);
  const fitted = useRef('');
  const [ov, setOv] = usePersisted<Overlays>('chartOverlays', { vwap: true, ma: true, lvl: true });
  const bars = series.bars;

  // create once per timeframe/theme
  useEffect(() => {
    if (!el.current) return;
    const up = cssVar('--up'), down = cssVar('--down'), line = cssVar('--line');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: cssVar('--panel') }, textColor: cssVar('--muted'), fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line },
      timeScale: { borderColor: line, timeVisible: tf !== 'D', secondsVisible: false, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
    });
    const cs = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    cs.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });
    const v = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    v.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const common = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const vw = c.addSeries(LineSeries, { ...common, color: cssVar('--vwap') || cssVar('--accent'), lineWidth: 2 });
    const m20 = c.addSeries(LineSeries, { ...common, color: cssVar('--warn') });
    const m50 = c.addSeries(LineSeries, { ...common, color: cssVar('--demo') });
    markers.current = createSeriesMarkers(cs, []);
    c.subscribeClick((p) => {
      const id = typeof p.hoveredObjectId === 'string' ? p.hoveredObjectId : null;
      const items = id ? byBar.current.get(id) : undefined;
      setPop(items && p.point ? { x: p.point.x, y: p.point.y, items, label: byLabel.current.get(id!) } : null);
    });
    chart.current = c;
    s.current = { c: cs, v, vw, m20, m50 };
    fitted.current = '';
    lines.current = [];
    gxLines.current = [];
    zp.current = null;
    return () => { c.remove(); chart.current = null; s.current = null; };
  }, [tf, theme]);

  // data (keeps your zoom/scroll; fits only when symbol/timeframe changes)
  useEffect(() => {
    const x = s.current, c = chart.current;
    if (!x || !c) return;
    const up = cssVar('--up'), down = cssVar('--down');
    x.c.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    x.v.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: (b.close >= b.open ? up : down) + '55' })));
    const fk = `${sym}:${ctf}`;
    if (bars.length && fitted.current !== fk) {
      if (tf === 'D') c.timeScale().setVisibleLogicalRange({ from: bars.length - 130, to: bars.length + 3 });
      else if (tf === 'W') c.timeScale().setVisibleLogicalRange({ from: bars.length - 78, to: bars.length + 2 });
      else if (ctf === 'M') c.timeScale().setVisibleLogicalRange({ from: bars.length - 36, to: bars.length + 2 });
      else if (tf === '5m') c.timeScale().setVisibleLogicalRange({ from: bars.length - 160, to: bars.length + 4 });
      else c.timeScale().fitContent();
      fitted.current = fk;
    }
  }, [bars, sym, tf, theme]);

  // overlays
  const closes = useMemo(() => bars.map((b) => b.close), [bars]);
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    const asT = (p: { time: number; value: number }[]) => p.map((q) => ({ time: q.time as UTCTimestamp, value: q.value }));
    x.vw.setData(ov.vwap && tf !== 'D' ? asT(vwapSeries(bars)) : []);
    x.m20.setData(ov.ma ? asT(toPts(bars, sma(closes, 20))) : []);
    x.m50.setData(ov.ma ? asT(toPts(bars, sma(closes, 50))) : []);
  }, [bars, closes, ov, tf, theme]);

  // Daily / weekly / monthly / yearly charts also pull this ticker's news history (about a year on Finnhub free)
  const hist = useHistNews(sym, bars.length ? bars[0].time * 1000 : Date.now(), Date.now(), mode ?? { kind: 'checking' }, longTf && flags !== 'off' && flags !== 'macro' && !!mode);
  const histItems: NewsItem[] = useMemo(() => hist.items.map((h, i) => ({ id: `h${i}:${h.t}`, t: h.t, title: h.title, src: h.src, url: h.url, syms: [sym], macro: false, sentiment: h.sentiment })), [hist.items, sym]);

  // Congress trades as arrows under the candles (daily and longer). One Alpha Vantage call per ticker, cached 12 h on the server.
  const [cg, setCg] = useState<CgTrade[]>([]);
  useEffect(() => {
    setCg([]);
    if (!ov.cg || !longTf || mode?.kind !== 'live') return;
    const hit = cgCache.get(sym);
    if (hit) { setCg(hit); return; }
    let stop = false;
    fetch(`/api/research?fn=congress&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j) => { if (!stop && Array.isArray(j.trades)) { cgCache.set(sym, j.trades); setCg(j.trades); } }).catch(() => {});
    return () => { stop = true; };
  }, [sym, ov.cg, longTf, mode?.kind]);

  // News buttons: one per candle (5m / 1H / day / week / month) or per year (Y), green = mostly good news, red = mostly bad
  useEffect(() => {
    const m = markers.current;
    if (!m) return;
    byBar.current = new Map();
    byLabel.current = new Map();
    if ((flags === 'off' && !ov.cg) || !bars.length) { m.setMarkers([]); return; }
    const times = bars.map((b) => b.time);
    const seen = new Set<string>();
    const pick = [...news, ...(longTf ? histItems : [])].filter((n) => {
      const k = `${Math.floor(n.t / 86400_000)}:${n.title.toLowerCase().slice(0, 80)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return flags !== 'off' && ((flags !== 'macro' && n.syms.includes(sym)) || (flags !== 'sym' && n.macro));
    });
    const lastAtOrBefore = (enc: number) => { let lo = 0, hi = times.length - 1, ans = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (times[mid] <= enc) { ans = mid; lo = mid + 1; } else hi = mid - 1; } return ans; };
    const yearStart = new Map<number, number>();
    times.forEach((t, i) => { const y = new Date(t * 1000).getUTCFullYear(); if (!yearStart.has(y)) yearStart.set(y, i); });
    const fmt = (t: number, o: Intl.DateTimeFormatOptions) => new Date(t * 1000).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' });
    for (const n of pick) {
      const day = Math.floor(encodeInstant(n.t) / 86400) * 86400;
      let i: number;
      if (ctf === 'Y') i = yearStart.get(new Date(day * 1000).getUTCFullYear()) ?? -1;
      else if (tf === 'W' || tf === 'M') i = day >= times[0] ? lastAtOrBefore(day) : -1;
      else i = barIndexFor(times, PERIOD[tf], tf === 'D' ? day : encodeInstant(n.t));
      if (i < 0) continue;
      const k = `n${times[i]}`;
      byBar.current.set(k, [...(byBar.current.get(k) ?? []), n]);
      if (!byLabel.current.has(k)) {
        const t = times[i];
        byLabel.current.set(k, ctf === 'Y' ? `${new Date(t * 1000).getUTCFullYear()}` : tf === 'M' ? fmt(t, { month: 'long', year: 'numeric' }) : tf === 'W' ? `Week of ${fmt(t, { month: 'short', day: 'numeric', year: 'numeric' })}` : tf === 'D' ? fmt(t, { weekday: 'short', month: 'short', day: 'numeric' }) : '');
      }
    }
    // congress trades: their own arrows below the bars, keyed "c<time>"
    if (ov.cg && longTf) {
      cg.forEach((c, idx) => {
        const t = Date.parse(`${c.traded}T16:00:00Z`);
        if (!Number.isFinite(t)) return;
        const day = Math.floor(encodeInstant(t) / 86400) * 86400;
        const i = ctf === 'Y' ? yearStart.get(new Date(day * 1000).getUTCFullYear()) ?? -1 : tf === 'W' || tf === 'M' ? (day >= times[0] ? lastAtOrBefore(day) : -1) : barIndexFor(times, PERIOD[tf], day);
        if (i < 0) return;
        const k = `c${times[i]}`, buy = /BUY|PURCHASE/i.test(c.type);
        byBar.current.set(k, [...(byBar.current.get(k) ?? []), { id: `cg${idx}`, t, title: `${c.who} (${c.party}-${c.state}) ${buy ? 'bought' : 'sold'} ${cgRange(c.min, c.max)}`, src: `Congress disclosure, filed ${c.filed}`, url: '', syms: [sym], macro: false, sentiment: buy ? 1 : -1 }]);
        if (!byLabel.current.has(k)) byLabel.current.set(k, `Congress · ${new Date(times[i] * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`);
      });
    }
    for (const [k, items] of byBar.current) byBar.current.set(k, items.sort((a, b) => b.t - a.t));
    const up = cssVar('--up'), down = cssVar('--down'), mute = cssVar('--muted'), macro = cssVar('--demo');
    const list: SeriesMarker<Time>[] = [...byBar.current.entries()].map(([id, items]) => {
      if (id[0] === 'c') {
        const net = items.reduce((a, x) => a + x.sentiment, 0);
        return { id, time: (+id.slice(1)) as UTCTimestamp, position: 'belowBar' as const, shape: net >= 0 ? 'arrowUp' as const : 'arrowDown' as const, color: net >= 0 ? up : down, text: `C${items.length > 1 ? items.length : ''}` };
      }
      const sc = items.reduce((a, x) => a + x.sentiment, 0);
      const onlyMacro = items.every((x) => !x.syms.includes(sym));
      return { id, time: (+id.slice(1)) as UTCTimestamp, position: 'aboveBar' as const, shape: 'circle' as const, size: items.length > 4 ? 1.6 : items.length > 1 ? 1.25 : 1, color: onlyMacro ? macro : sc > 0 ? up : sc < 0 ? down : mute, text: items.length > 1 ? String(items.length) : undefined };
    }).sort((a, b) => (a.time as number) - (b.time as number));
    m.setMarkers(list);
  }, [news, histItems, bars, flags, sym, tf, ctf, longTf, theme, cg, ov.cg]);
  useEffect(() => setPop(null), [sym, ctf]);

  // level lines
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    for (const l of lines.current) x.c.removePriceLine(l);
    lines.current = [];
    if (!ov.lvl || tf === 'W' || tf === 'M') return; // day-trading levels don't belong on weekly / monthly candles
    const color: Record<string, string> = { pdh: cssVar('--up'), pdl: cssVar('--down'), pdc: cssVar('--muted'), vwap: cssVar('--accent'), orh: cssVar('--warn'), orl: cssVar('--warn'), pmh: cssVar('--demo'), pml: cssVar('--demo') };
    for (const l of levels) {
      if (l.value == null || (l.id === 'vwap' && ov.vwap && tf !== 'D') || (ov.swing && !SWING_KEYS.has(l.id))) continue;
      lines.current.push(x.c.createPriceLine({ price: l.value, color: color[l.id], lineWidth: 1, lineStyle: l.id === 'pdc' ? LineStyle.Dotted : LineStyle.Dashed, axisLabelVisible: true, title: last > 0 ? `${LEVEL_SHORT[l.id]} ${distLabel((l.value / last - 1) * 100)}` : LEVEL_SHORT[l.id] }));
    }
  }, [levels, ov, tf, theme, bars, Math.round(last * 20)]);

  // opening-range and premarket bands (intraday, day preset only)
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    if (!zp.current) { zp.current = new ZonePrimitive(); x.c.attachPrimitive(zp.current); }
    const v = (id: string) => levels.find((l) => l.id === id)?.value ?? null;
    const z: { lo: number; hi: number; color: string; label: string }[] = [];
    if (ov.lvl && ov.zn !== false && !ov.swing && tf !== 'D' && tf !== 'W' && tf !== 'M') {
      const orl = v('orl'), orh = v('orh'), pml = v('pml'), pmh = v('pmh');
      if (orl != null && orh != null) z.push({ lo: orl, hi: orh, color: cssVar('--warn'), label: 'Opening range' });
      if (pml != null && pmh != null) z.push({ lo: pml, hi: pmh, color: cssVar('--demo'), label: 'Premarket range' });
    }
    zp.current.set(z);
  }, [levels, ov, tf, theme, bars]);

  // Gamma walls + zero-gamma flip (Cboe delayed chain, next 7 days) for SPY / QQQ / IWM; real data only, nothing in demo mode
  const gxOn = ov.gx !== false && GX_SYMS.includes(sym) && mode?.kind === 'live' && tf !== 'W' && tf !== 'M';
  const gx = useGammaLv(sym, gxOn);
  useEffect(() => {
    const x = s.current;
    if (!x) return;
    for (const l of gxLines.current) x.c.removePriceLine(l);
    gxLines.current = [];
    if (!gxOn || !gx) return;
    const add = (v: number | null, color: string, title: string, style: LineStyle) => { if (v != null && Number.isFinite(v)) gxLines.current.push(x.c.createPriceLine({ price: v, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title: last > 0 ? `${title} ${distLabel((v / last - 1) * 100)}` : title })); };
    add(gx.callWall, cssVar('--up'), 'Call wall', LineStyle.LargeDashed);
    add(gx.putWall, cssVar('--down'), 'Put wall', LineStyle.LargeDashed);
    add(gx.flip, cssVar('--accent'), 'γ flip', LineStyle.SparseDotted);
  }, [gx, gxOn, tf, theme, bars, Math.round(last * 20)]);

  // level ladder rows
  const ladOn = ov.lad !== false && ov.lvl && tf !== 'W' && tf !== 'M';
  const ladRows = useMemo(() => {
    if (!ladOn) return [];
    const items: LadderIn[] = levels.map((l) => ({ key: l.id as string, short: LEVEL_SHORT[l.id], label: l.label, value: l.id === 'vwap' && tf === 'D' ? null : l.value, kind: 'level' }));
    if (gxOn && gx) items.push({ key: 'callWall', short: 'Call wall', label: 'Gamma call wall', value: gx.callWall, kind: 'gamma' }, { key: 'putWall', short: 'Put wall', label: 'Gamma put wall', value: gx.putWall, kind: 'gamma' }, { key: 'flip', short: 'γ flip', label: 'Zero-gamma flip', value: gx.flip, kind: 'gamma' });
    return buildLadder(items, last, !!ov.swing);
  }, [ladOn, levels, gx, gxOn, last, ov.swing, tf]);

  const T = (k: keyof Overlays, label: string, hint: string) => (
    <button className={`chip sm ${ov[k] ? 'on' : ''}`} onClick={() => setOv({ ...ov, [k]: !ov[k] })} title={hint} aria-pressed={ov[k]}>{label}</button>
  );

  return (
    <section className="panel chart-panel">
      <PanelHead
        title={
          <span className="chart-title">
            <Star sym={sym} size="md" />
            <b>{sym}</b>
            <CoName sym={sym} className="muted" />{!name || name === sym ? null : null}
            <FlashNum v={last}>{px(last)}</FlashNum>
            <span className={`num ${tone(chgPct)}`}>{pct(chgPct)}</span>
          </span>
        }
        badge={<Fresh kind={series.freshness} at={series.asOf || undefined} src={series.source || undefined} />}
        onPopout={onPopout}
      >
        {T('vwap', 'VWAP', 'Session VWAP (intraday)')}
        {T('ma', 'MA 20/50', '20 and 50-period simple moving averages')}
        {T('lvl', 'Levels', 'Draw key levels on the chart')}
        {GX_SYMS.includes(sym) && mode?.kind === 'live' && <button className={`chip sm ${ov.gx !== false ? 'on' : ''}`} onClick={() => setOv({ ...ov, gx: ov.gx === false })} title={`Dealer gamma: call wall, put wall and zero-gamma flip for the next 7 days (Cboe delayed ~15 min, estimated from open interest)`} aria-pressed={ov.gx !== false}>Gamma</button>}
        {ov.lvl && tf !== 'W' && tf !== 'M' && <button className={`chip sm ${ov.lad !== false ? 'on' : ''}`} onClick={() => setOv({ ...ov, lad: ov.lad === false })} title="Ladder: every level in price order beside the chart, with distance from the last price" aria-pressed={ov.lad !== false}>Ladder</button>}
        {ov.lvl && tf !== 'W' && tf !== 'M' && <button className={`chip sm ${ov.swing ? 'on' : ''}`} onClick={() => setOv({ ...ov, swing: !ov.swing })} title={ov.swing ? 'Swing preset: prior-day range and gamma walls only. Click for Day (all levels).' : 'Day preset: all levels. Click for Swing (prior-day range and gamma walls only).'} aria-pressed={!!ov.swing}>{ov.swing ? 'Swing' : 'Day'}</button>}
        {longTf && T('cg', 'Congress', 'Arrows under the candles where members of Congress bought (▲) or sold (▼) this stock. Click one for who and how much.')}
        <select className="flag-sel" value={flags} onChange={(e) => setFlags(e.target.value as FlagMode)} title="News flags on candles (click a flag for headlines)" aria-label="News flags">
          <option value="both">News: ticker + macro</option><option value="sym">News: ticker</option><option value="macro">News: macro</option><option value="off">News: off</option>
        </select>
        <Seg<ChartTF> value={ctf} onChange={onTf} options={[{ id: '5m', label: '5m', hint: '5-minute (3)', keyHint: '3' }, { id: '1H', label: '1H', hint: '1-hour (2)', keyHint: '2' }, { id: 'D', label: 'D', hint: 'Daily (1): one news button per day', keyHint: '1' }, { id: 'W', label: 'W', hint: 'Weekly (4): one news button per week', keyHint: '4' }, { id: 'M', label: 'M', hint: 'Monthly (5): one news button per month', keyHint: '5' }, { id: 'Y', label: 'Y', hint: 'Monthly candles, one news button per year (6)', keyHint: '6' }]} />
      </PanelHead>
      <div className="chart-body">
      <div className="chart-wrap" ref={el}>
        {!bars.length && (
          <div className="chart-empty">
            {series.loading ? <div className="chart-skel" aria-label="Loading candles"><Skel h={14} w="40%" /><Skel h={160} w="100%" /><Skel h={40} w="100%" /></div> : series.error ? <><b>No candles.</b> <span className="muted">{series.error}</span></> : 'No data'}
          </div>
        )}
        {series.note && <div className="chart-note">{series.note}</div>}
        {pop && (
          <div className="flag-pop" style={{ left: Math.min(pop.x, (el.current?.clientWidth ?? 600) - 330), top: pop.y + 14 }} onMouseDown={(e) => e.stopPropagation()}>
            <button className="icon-btn" onClick={() => setPop(null)} aria-label="Close">×</button>
            {pop.label && pop.label.startsWith('Congress') ? <div className="fp-h">{pop.label} · <span className="up">{pop.items.filter((x) => x.sentiment > 0).length} buys</span> · <span className="down">{pop.items.filter((x) => x.sentiment < 0).length} sells</span> <span className="muted">(STOCK Act filings; amounts are ranges)</span></div>
              : pop.label && <div className="fp-h">{pop.label} · {pop.items.length} headline{pop.items.length > 1 ? 's' : ''} · <span className="up">{pop.items.filter((x) => x.sentiment > 0).length} good</span> · <span className="down">{pop.items.filter((x) => x.sentiment < 0).length} bad</span></div>}
            {pop.items.map((n) => (
              <div key={n.id} className="fp-i">
                <span className={`sent ${n.sentiment > 0 ? 'up' : n.sentiment < 0 ? 'down' : 'muted'}`} title="Keyword sentiment (rough)">●</span>
                <div>
                  {n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> : <span>{n.title}</span>}
                  <div className="small muted">{longTf ? `${new Date(n.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: tf === 'D' ? undefined : 'numeric', timeZone: 'America/New_York' })} ` : ''}{etTime(n.t)} ET · {n.src} · {n.sentiment > 0 ? 'bullish' : n.sentiment < 0 ? 'bearish' : 'neutral'}{n.macro ? ' · macro' : ''}
                    {n.syms.filter((s) => s !== sym).map((s) => <button key={s} className="sym-chip" onClick={() => onSelect?.(s)}>{s}</button>)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {ladOn && <Ladder rows={ladRows} nearest={nearestKey(ladRows)} />}
      </div>
    </section>
  );
}
