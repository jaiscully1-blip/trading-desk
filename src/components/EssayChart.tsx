// Chart for the Essays drawer. Drag across it to select a range (a shaded band and a data card: the move, high / low, volume
// vs normal, SPY over the same days, headlines and filings inside it); click empty chart to clear. Hover a day for its numbers.
// Pinned ranges stay as colored bands; hovering a citation in the essay lights its range up here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, createChart, type IChartApi, type ISeriesApi, type Logical, type UTCTimestamp } from 'lightweight-charts';
import { fmtDay, rangeStats, ymd, type DayBar, type RangeStats } from '../../shared/essay';

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export const PIN_COLORS = ['#ee9a45', '#46d69a', '#5cc8f5', '#ff5a4d', '#b48cff'];
export interface Pin { id: string; from: number; to: number; color: string; label: string }
export interface RangeNews { news: { t: number; title: string; url: string; src: string }[]; filings: { date: string; form: string; items: string; earnings: boolean; url: string }[]; error?: string }
const rangeCache = new Map<string, Promise<RangeNews>>();
export function fetchRange(sym: string, from: number, to: number, name = ''): Promise<RangeNews> {
  const k = `${sym}:${ymd(from)}:${ymd(to)}`;
  if (!rangeCache.has(k)) rangeCache.set(k, fetch(`/api/research?fn=range&symbol=${encodeURIComponent(sym)}&from=${ymd(from)}&to=${ymd(to)}${name ? `&name=${encodeURIComponent(name)}` : ''}`).then(async (r) => { const j = await r.json(); return r.ok ? j : { news: [], filings: [], error: j.error ?? `HTTP ${r.status}` }; }).catch((e) => ({ news: [], filings: [], error: String(e) })));
  return rangeCache.get(k)!;
}
const pct = (v: number | null | undefined, dp = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`);
const vol = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1e3)}K`);

export function EssayChart({ sym, name, bars, spy, pins, focus, onInsert, onPin, onSource }: {
  sym: string; name: string; bars: DayBar[]; spy: DayBar[]; pins: Pin[]; focus: { from: number; to: number; color?: string } | null;
  onInsert: (s: RangeStats, color?: string, pinId?: string) => void; onPin: (s: RangeStats, color: string) => void;
  onSource: (s: { kind: 'news' | 'filing'; title: string; url: string; src: string; t: number }, insert: boolean) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const cs = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const vs = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [, tick] = useState(0);
  const [sel, setSel] = useState<{ a: number; b: number; done: boolean } | null>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);
  const [rn, setRn] = useState<RangeNews | null>(null);
  const drag = useRef<{ x0: number; i0: number; moved: boolean } | null>(null);
  const idxOf = useMemo(() => { const m = new Map<string, number>(); bars.forEach((b, i) => m.set(ymd(b.time), i)); return m; }, [bars]);

  useEffect(() => {
    if (!el.current) return;
    const line = cssVar('--line'), up = cssVar('--up'), down = cssVar('--down');
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: cssVar('--muted'), fontFamily: 'IBM Plex Mono, ui-monospace, monospace', fontSize: 10.5, attributionLogo: false },
      grid: { vertLines: { color: line }, horzLines: { color: line } }, rightPriceScale: { borderColor: line }, timeScale: { borderColor: line, rightOffset: 4 },
      crosshair: { mode: CrosshairMode.Normal },
      // dragging selects a range, so panning moves to the wheel / trackpad
      handleScroll: { mouseWheel: true, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false }, handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    cs.current = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false });
    cs.current.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.2 } });
    vs.current = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'v', lastValueVisible: false, priceLineVisible: false });
    vs.current.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    c.timeScale().subscribeVisibleLogicalRangeChange(() => tick((x) => x + 1));
    c.subscribeCrosshairMove((p) => { if (p.logical == null || !p.point) setHover(null); else setHover({ i: Math.round(p.logical as number), x: p.point.x }); });
    chart.current = c;
    const ro = new ResizeObserver(() => tick((x) => x + 1)); ro.observe(el.current);
    return () => { ro.disconnect(); c.remove(); chart.current = null; cs.current = null; vs.current = null; };
  }, []);

  useEffect(() => {
    const c = chart.current, s = cs.current, v = vs.current;
    if (!c || !s || !v) return;
    s.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    const up = cssVar('--up'), down = cssVar('--down');
    v.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, value: b.volume, color: `${b.close >= b.open ? up : down}55` })));
    if (bars.length) c.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 260), to: bars.length + 3 });
    setSel(null); setRn(null);
  }, [bars]);

  // a citation hovered in the essay, or a pin clicked: show that range
  useEffect(() => {
    if (!focus || !bars.length) return;
    const a = idxOf.get(ymd(focus.from)), b = idxOf.get(ymd(focus.to));
    if (a == null || b == null) return;
    setSel({ a, b, done: true });
    const ts = chart.current?.timeScale(), r = ts?.getVisibleLogicalRange();
    if (ts && r && (a < r.from || b > r.to)) { const pad = Math.max(10, (b - a) * 0.6); ts.setVisibleLogicalRange({ from: a - pad, to: b + pad }); }
  }, [focus, idxOf, bars.length]);

  const stats = useMemo(() => (sel ? rangeStats(bars, sel.a, sel.b, spy) : null), [sel, bars, spy]);
  useEffect(() => {
    setRn(null);
    if (!stats || !sel?.done) return;
    let stop = false;
    fetchRange(sym, stats.from, stats.to, name).then((r) => { if (!stop) setRn(r); });
    return () => { stop = true; };
  }, [stats?.from, stats?.to, sel?.done, sym]); // eslint-disable-line react-hooks/exhaustive-deps

  const ts = chart.current?.timeScale();
  const plotW = ts?.width() ?? 0;
  const idxAt = (x: number) => { const l = ts?.coordinateToLogical(x); return l == null ? null : Math.max(0, Math.min(bars.length - 1, Math.round(l as number))); };
  const band = (a: number, b: number) => {
    if (!ts) return null;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    // whole-bar coordinates only (fractional logicals come back as 0), widened by half a bar each side
    const c0 = ts.logicalToCoordinate(lo as Logical), c1 = ts.logicalToCoordinate(hi as Logical);
    if (c0 == null || c1 == null) return null;
    const half = (ts.options().barSpacing ?? 6) / 2, x0 = c0 - half, x1 = c1 + half;
    const l = Math.max(0, x0), r = Math.min(plotW, x1);
    return r > l ? { left: l, width: r - l } : null;
  };

  const down = (e: React.PointerEvent) => {
    if (e.button !== 0 || !el.current) return;
    const x = e.clientX - el.current.getBoundingClientRect().left;
    if (x > plotW) return; // price axis: let the chart scale
    const i = idxAt(x);
    if (i == null) return;
    drag.current = { x0: x, i0: i, moved: false };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ok */ }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !el.current) return;
    const x = e.clientX - el.current.getBoundingClientRect().left;
    if (!d.moved && Math.abs(x - d.x0) < 4) return;
    d.moved = true;
    const i = idxAt(x);
    if (i != null) setSel({ a: d.i0, b: i, done: false });
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (!d) return;
    if (!d.moved) { setSel(null); return; } // a plain click clears the selection
    setSel((s) => (s ? { ...s, done: true } : s));
  };

  const hb = hover && bars[hover.i] ? bars[hover.i] : null;
  const hPrev = hover && hover.i > 0 ? bars[hover.i - 1] : null;
  const selBand = sel ? band(sel.a, sel.b) : null;
  const [pinColor, setPinColor] = useState(PIN_COLORS[0]);
  const matchPin = stats ? pins.find((p) => ymd(p.from) === ymd(stats.from) && ymd(p.to) === ymd(stats.to)) : undefined;

  return (
    <div className="ec">
      <div className="ec-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="ec-chart" ref={el} />
        {pins.map((p) => { const a = idxOf.get(ymd(p.from)), b = idxOf.get(ymd(p.to)); const bb = a != null && b != null ? band(a, b) : null; return bb ? <div key={p.id} className="ec-band pin" style={{ ...bb, background: `${p.color}22`, borderColor: `${p.color}88` }} title={p.label} /> : null; })}
        {selBand && <div className={`ec-band sel ${sel?.done ? '' : 'live'}`} style={{ ...selBand, background: `${focus?.color ?? 'var(--accent)'}2e`, borderColor: focus?.color ?? 'var(--accent)' }} />}
        {hb && !drag.current?.moved && (
          <div className="ec-hover" style={{ left: Math.min(Math.max(8, (hover!.x) + 14), plotW - 200) }}>
            <b>{fmtDay(hb.time)}</b>
            <span>O {hb.open.toFixed(2)} · H {hb.high.toFixed(2)} · L {hb.low.toFixed(2)} · C {hb.close.toFixed(2)}</span>
            <span>{hPrev ? <span className={hb.close >= hPrev.close ? 'up' : 'down'}>{pct((hb.close / hPrev.close - 1) * 100, 2)}</span> : null} · vol {vol(hb.volume)}</span>
          </div>
        )}
        {!sel && bars.length > 0 && <div className="ec-hint small">Drag across the chart to select a range · scroll to zoom</div>}
      </div>

      {stats && (
        <div className="ec-card" style={{ borderColor: focus?.color ?? matchPin?.color ?? 'var(--accent)' }}>
          <div className="ec-card-h">
            <b>{fmtDay(stats.from)}{stats.days > 1 ? ` → ${fmtDay(stats.to)}` : ''}</b><span className="muted small">{stats.days} trading day{stats.days > 1 ? 's' : ''}</span>
            <button className="hw-btn" onClick={() => setSel(null)} aria-label="Clear selection" title="Clear (or click empty chart)">×</button>
          </div>
          <div className="ec-stats">
            <span><i>Move</i><b className={stats.chgPct >= 0 ? 'up' : 'down'}>{pct(stats.chgPct, 2)}</b></span>
            <span><i>vs SPY</i><b className={(stats.vsSpy ?? 0) >= 0 ? 'up' : 'down'}>{stats.vsSpy == null ? '—' : `${stats.vsSpy >= 0 ? '+' : ''}${stats.vsSpy.toFixed(1)} pts`}</b></span>
            <span><i>High</i><b>{stats.high.toFixed(2)}</b></span>
            <span><i>Low</i><b>{stats.low.toFixed(2)}</b></span>
            <span><i>Volume</i><b>{stats.volVsNormal ? `${stats.volVsNormal.toFixed(1)}× normal` : vol(stats.avgVol)}</b></span>
            <span><i>Up days</i><b>{stats.upDays} / {stats.days}</b></span>
          </div>
          <div className="ec-acts">
            <button className="btn sm primary" onClick={() => onInsert(stats, matchPin?.color, matchPin?.id)}>Insert into essay</button>
            {!matchPin && <span className="ec-pin">{PIN_COLORS.map((c) => <button key={c} className={`ec-sw ${pinColor === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setPinColor(c)} aria-label={`Pin color ${c}`} />)}<button className="btn sm" onClick={() => onPin(stats, pinColor)}>Pin range</button></span>}
            {matchPin && <span className="small muted">Pinned</span>}
          </div>
          {sel?.done && (
            <div className="ec-in">
              {!rn && <p className="small muted">Looking for news and filings in this range…</p>}
              {rn?.filings.length ? <><h5>Filings ({rn.filings.length})</h5><ul>{rn.filings.map((f, i) => (
                <li key={i}><span className="num small muted">{f.date.slice(5)}</span> <a href={f.url} target="_blank" rel="noreferrer noopener">{f.earnings ? 'Earnings (8-K 2.02)' : f.form}{f.items && !f.earnings ? ` · items ${f.items}` : ''}</a>
                  <button className="link small" onClick={() => onSource({ kind: 'filing', title: `${sym} ${f.form}${f.earnings ? ' (earnings)' : ''} filed ${f.date}`, url: f.url, src: 'SEC EDGAR', t: Date.parse(f.date) }, true)}>cite</button></li>
              ))}</ul></> : null}
              {rn && <><h5>Headlines ({rn.news.length})</h5>{!rn.news.length && <p className="small muted">{rn.error ?? 'No headlines found in this window.'}</p>}<ul>{rn.news.slice(0, 25).map((n, i) => (
                <li key={i}><span className="num small muted">{new Date(n.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> <span className="small muted">{n.src}</span>
                  <button className="link small" onClick={() => onSource({ kind: 'news', title: n.title, url: n.url, src: n.src, t: n.t }, true)}>cite</button></li>
              ))}</ul></>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
