// ETFs & sectors: a Finviz-style S&P 500 heatmap, what's inside each ETF, and your own baskets vs SPY.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COMPANIES } from '../../shared/data/companies';
import { ETFS } from '../../shared/etfs';
import { basketCurve, holdingsMove, squarify, type Basket, type Closes, type EtfProfile, type SnapMap } from '../../shared/markets';
import { moveColor, pct, useApi, useSnapshot, type SnapshotResp } from '../data/apis';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh, Seg } from './common';

type Tab = 'heat' | 'etf' | 'baskets';
const capFmt = (v: number) => (v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`);

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [sz, setSz] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSz({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, sz] as const;
}

interface Tile { sym: string; name: string; v: number; c: number | null; mc: number | null; group: string }
/** Groups (sectors) laid out first, then the stocks inside each. */
export function Treemap({ tiles, onPick, minH = 420 }: { tiles: Tile[]; onPick: (s: string) => void; minH?: number }) {
  const [ref, sz] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<Tile | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Tile[]>();
    for (const t of tiles) m.set(t.group, [...(m.get(t.group) ?? []), t]);
    return [...m.entries()].map(([g, ts]) => ({ g, ts, v: ts.reduce((s, t) => s + t.v, 0) }));
  }, [tiles]);
  const laid = useMemo(() => {
    if (!sz.w || !sz.h) return [];
    return squarify(groups, { x: 0, y: 0, w: sz.w, h: sz.h }).map((gr) => {
      const head = gr.h > 40 && gr.w > 60 ? 15 : 0;
      const wt = gr.ts.reduce((s, t) => s + (t.c != null ? t.v : 0), 0);
      const avg = wt ? gr.ts.reduce((s, t) => s + (t.c != null ? t.c * t.v : 0), 0) / wt : null;
      return { ...gr, head, avg, cells: squarify(gr.ts, { x: gr.x + 1, y: gr.y + head + 1, w: Math.max(0, gr.w - 2), h: Math.max(0, gr.h - head - 2) }) };
    });
  }, [groups, sz]);
  return (
    <div className="tm" ref={ref} style={{ minHeight: minH }} onMouseLeave={() => setHov(null)}>
      <svg width={sz.w} height={sz.h}>
        {laid.map((gr) => (
          <g key={gr.g}>
            <rect x={gr.x} y={gr.y} width={gr.w} height={gr.h} className="tm-grp" />
            {gr.head > 0 && <text x={gr.x + 4} y={gr.y + 11} className="tm-gl">{gr.g.toUpperCase()} <tspan className={gr.avg != null && gr.avg >= 0 ? 'tm-up' : 'tm-dn'}>{pct(gr.avg, 2)}</tspan></text>}
            {gr.cells.map((c) => {
              const fs = Math.max(8, Math.min(22, Math.sqrt(c.w * c.h) / 4.2));
              const show = c.w > 26 && c.h > 14;
              return (
                <g key={c.sym} className="tm-cell" onMouseEnter={() => setHov(c)} onClick={() => onPick(c.sym)}>
                  <rect x={c.x} y={c.y} width={Math.max(0, c.w - 1)} height={Math.max(0, c.h - 1)} fill={moveColor(c.c)} />
                  {show && <text x={c.x + c.w / 2} y={c.y + c.h / 2 + (c.h > fs * 2.4 ? -fs * 0.15 : fs * 0.35)} textAnchor="middle" fontSize={fs} className="tm-t">{c.sym}</text>}
                  {show && c.h > fs * 2.4 && <text x={c.x + c.w / 2} y={c.y + c.h / 2 + fs * 0.95} textAnchor="middle" fontSize={fs * 0.68} className="tm-t2">{pct(c.c, 2)}</text>}
                </g>
              );
            })}
          </g>
        ))}
      </svg>
      {hov && <div className="tm-tip"><b>{hov.sym}</b> {hov.name}<br /><span className={hov.c != null && hov.c >= 0 ? 'up' : 'down'}>{pct(hov.c)}</span>{hov.mc ? <span className="muted"> · {capFmt(hov.mc)}</span> : null}<span className="muted"> · {hov.group}</span></div>}
    </div>
  );
}

function Heatmap({ snap, onChart }: { snap: SnapshotResp | null; onChart: (s: string) => void }) {
  const [uni, setUni] = usePersisted<'spx' | 'all'>('heatUni', 'spx');
  const [size, setSize] = usePersisted<'cap' | 'eq'>('heatSize', 'cap');
  const s = snap?.snap ?? {};
  const caps = !!snap?.caps;
  const tiles: Tile[] = COMPANIES.filter((c) => uni === 'all' || c[7] === 'spx').map((c) => {
    const q = s[c[0]];
    return { sym: c[0], name: c[1], group: c[2], c: q?.c ?? null, mc: q?.mc ?? null, v: size === 'cap' && caps ? q?.mc ?? 0 : 1 };
  });
  const priced = tiles.filter((t) => t.c != null);
  const up = priced.filter((t) => t.c! > 0).length;
  return (
    <div className="es-heat">
      <div className="es-bar">
        <Seg value={uni} onChange={setUni} options={[{ id: 'spx', label: 'S&P 500' }, { id: 'all', label: '+ Nasdaq-100' }]} />
        <Seg value={size} onChange={setSize} options={[{ id: 'cap', label: 'Size: market cap' }, { id: 'eq', label: 'Equal size' }]} />
        {priced.length > 0 && <span className="small"><span className="up">{up} up</span> · <span className="down">{priced.length - up} down</span></span>}
        <span className="es-legend">{[-3, -2, -1, 0, 1, 2, 3].map((v) => <i key={v} style={{ background: moveColor(v === 0 ? 0.0001 : v) }}>{v > 0 ? `+${v}` : v}%</i>)}</span>
        {size === 'cap' && snap && !caps && <span className="small muted">Market caps unavailable from the backup source; boxes are equal size.</span>}
      </div>
      {!snap ? <p className="muted hw-pad">Loading quotes…</p> : <Treemap tiles={tiles} onPick={onChart} />}
    </div>
  );
}

const ETF_GROUPS: { label: string; syms: string[] }[] = [
  { label: 'Broad', syms: ['SPY', 'QQQ', 'DIA', 'IWM', 'RSP'] },
  { label: 'Sectors', syms: ['XLK', 'XLC', 'XLY', 'XLF', 'XLV', 'XLI', 'XLE', 'XLP', 'XLU', 'XLB', 'XLRE'] },
  { label: 'Themes', syms: ['SMH', 'SOXX', 'IGV', 'ARKK', 'XBI', 'KRE', 'ITB', 'TAN', 'URA', 'GDX'] },
];
function Holdings({ snap, onChart }: { snap: SnapMap; onChart: (s: string) => void }) {
  const [sym, setSym] = usePersisted<string>('etfSym', 'XLK');
  const [view, setView] = usePersisted<'map' | 'list'>('etfView', 'map');
  const r = useApi<EtfProfile & { asOf: number; source: string; note?: string; stale?: boolean }>(`/api/research?fn=etf&symbol=${sym}`, 0, 12 * 3600_000);
  const d = r.data?.sym === sym ? r.data : null;
  const info = ETFS[sym];
  const mv = d ? holdingsMove(d.holdings, snap) : null;
  const top = d?.holdings.filter((h) => h.sym).slice(0, 60) ?? [];
  const fq = snap[sym];
  return (
    <div className="es-etf">
      <div className="es-picks">{ETF_GROUPS.map((g) => <div key={g.label} className="es-pg"><span className="muted small">{g.label}</span>{g.syms.map((s) => <button key={s} className={`chip sm ${s === sym ? 'on' : ''}`} onClick={() => setSym(s)} title={ETFS[s]?.name}>{s}</button>)}</div>)}</div>
      <div className="sm-head">
        <div>
          <h3>{sym} <span className="muted">· {info?.name ?? ''}</span> {fq && <span className={fq.c >= 0 ? 'up' : 'down'}>{pct(fq.c)}</span>}</h3>
          {info && <p className="small muted">{info.what}</p>}
        </div>
        {d && <Fresh kind="eod" at={d.asOf} src={d.source} />}
      </div>
      {r.loading && !d && <p className="muted">Loading holdings…</p>}
      {r.error && !d && <p className="down small">{r.error}</p>}
      {d && (
        <>
          {d.note && <p className="small warn">{d.note}</p>}
          <div className="sm-stats">
            {d.netAssets != null && <div><span className="muted small">Fund size</span><b>{capFmt(d.netAssets)}</b></div>}
            {d.expense != null && <div><span className="muted small">Fee</span><b>{(d.expense * 100).toFixed(2)}%/yr</b></div>}
            <div><span className="muted small">Holdings</span><b>{d.holdings.length}</b></div>
            {mv?.move != null && <div><span className="muted small">Holdings today (weighted)</span><b className={mv.move >= 0 ? 'up' : 'down'}>{pct(mv.move)}</b><span className="small muted"> covers {Math.round(mv.covered * 100)}%</span></div>}
            <div className="sm-flt"><Seg value={view} onChange={setView} options={[{ id: 'map', label: 'Map' }, { id: 'list', label: 'List' }]} /></div>
          </div>
          {d.sectors.length > 1 && (
            <div className="es-secbar" title="Sector weights">{d.sectors.map((s, i) => <i key={s.sector} style={{ flexGrow: s.weight, background: `hsl(${(i * 37) % 360} 45% 50%)` }} title={`${s.sector} ${(s.weight * 100).toFixed(1)}%`}>{s.weight > 0.07 ? `${s.sector.toLowerCase()} ${Math.round(s.weight * 100)}%` : ''}</i>)}</div>
          )}
          {view === 'map'
            ? <Treemap minH={380} tiles={top.map((h) => ({ sym: h.sym, name: h.name, v: h.weight, c: snap[h.sym]?.c ?? null, mc: snap[h.sym]?.mc ?? null, group: sym }))} onPick={onChart} />
            : (
              <div className="sm-tblwrap">
                <table className="sm-tbl">
                  <thead><tr><th>#</th><th>Ticker</th><th>Name</th><th className="r">Weight</th><th className="r">Today</th></tr></thead>
                  <tbody>{d.holdings.slice(0, 100).map((h, i) => (
                    <tr key={`${h.sym}${i}`}><td className="muted small">{i + 1}</td><td>{h.sym ? <button className="sym-chip" onClick={() => onChart(h.sym)}>{h.sym}</button> : <span className="muted">—</span>}</td><td className="sm-name">{h.name}</td>
                      <td className="r"><span className="sm-wbar"><i style={{ width: `${Math.min(100, (h.weight / (d.holdings[0]?.weight || 1)) * 100)}%` }} /></span>{(h.weight * 100).toFixed(2)}%</td>
                      <td className={`r num ${(snap[h.sym]?.c ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(snap[h.sym]?.c)}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          <p className="note">Holdings refresh weekly (each new fund costs one of the 25 free Alpha Vantage calls a day). Today’s moves come from the market snapshot.</p>
        </>
      )}
    </div>
  );
}

const TEMPLATES: Basket[] = [
  { id: 't-ai', name: 'AI chips', syms: ['NVDA', 'AMD', 'AVGO', 'MU', 'MRVL', 'ARM'] },
  { id: 't-mag', name: 'Magnificent 7', syms: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'] },
  { id: 't-cyber', name: 'Cybersecurity', syms: ['CRWD', 'PANW', 'FTNT', 'ZS', 'NET'] },
  { id: 't-nuc', name: 'Power & nuclear', syms: ['CEG', 'VST', 'GEV', 'OKLO', 'SMR', 'CCJ'] },
];
const RANGES: { id: string; label: string; days: number | 'ytd' }[] = [{ id: '1m', label: '1M', days: 30 }, { id: '3m', label: '3M', days: 91 }, { id: '6m', label: '6M', days: 182 }, { id: 'ytd', label: 'YTD', days: 'ytd' }, { id: '1y', label: '1Y', days: 365 }];

function Baskets({ snap, onChart }: { snap: SnapMap; onChart: (s: string) => void }) {
  const [baskets, setBaskets] = usePersisted<Basket[]>('baskets', []);
  const [selId, setSelId] = usePersisted<string | null>('basketSel', null);
  const [rng, setRng] = usePersisted<string>('basketRange', '3m');
  const [draft, setDraft] = useState<{ id: string | null; name: string; syms: string } | null>(null);
  const sel = baskets.find((b) => b.id === selId) ?? baskets[0] ?? null;
  const url = sel ? `/api/research?fn=closes&symbols=${[...new Set([...sel.syms, 'SPY'])].slice(0, 16).join(',')}` : null;
  const r = useApi<{ closes: Closes; missing: string[]; sources: string[]; asOf: number }>(url, 0, 3600_000);
  const R = RANGES.find((x) => x.id === rng) ?? RANGES[1];
  const start = R.days === 'ytd' ? Date.UTC(new Date().getUTCFullYear(), 0, 1) / 1000 - 86400 * 3 : Date.now() / 1000 - R.days * 86400;
  const res = useMemo(() => (sel && r.data ? basketCurve(r.data.closes, sel.syms, 'SPY', start) : null), [sel, r.data, start]);
  const save = () => {
    if (!draft) return;
    const syms = [...new Set(draft.syms.toUpperCase().split(/[\s,]+/).map((s) => s.trim().replace(/^\$/, '')).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))].slice(0, 15);
    if (!syms.length) return;
    const b: Basket = { id: draft.id ?? `b${Date.now()}`, name: draft.name.trim() || syms.slice(0, 3).join(' / '), syms };
    setBaskets((xs) => (draft.id ? xs.map((x) => (x.id === draft.id ? b : x)) : [...xs, b]));
    setSelId(b.id); setDraft(null);
  };
  const W = 640, H = 220;
  const curve = res?.curve ?? [];
  const lo = Math.min(...curve.flatMap((p) => [p.basket, p.bench]), 100), hi = Math.max(...curve.flatMap((p) => [p.basket, p.bench]), 100);
  const X = (i: number) => (i / Math.max(1, curve.length - 1)) * W, Y = (v: number) => H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 16);
  const line = (k: 'basket' | 'bench') => curve.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  const last = curve[curve.length - 1];
  const today = sel ? (() => { const qs = sel.syms.map((s) => snap[s]?.c).filter((v): v is number => v != null); return qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null; })() : null;
  return (
    <div className="sm-split">
      <aside className="sm-list">
        {baskets.map((b) => <button key={b.id} className={`sm-fund ${sel?.id === b.id ? 'on' : ''}`} onClick={() => setSelId(b.id)}><b>{b.name}</b><span className="small muted">{b.syms.join(' · ')}</span></button>)}
        <button className="btn" onClick={() => setDraft({ id: null, name: '', syms: '' })}>+ New basket</button>
        {!baskets.length && <><p className="small muted">Or start from one of these:</p>{TEMPLATES.map((t) => <button key={t.id} className="chip sm" onClick={() => { const b = { ...t, id: `b${Date.now()}` }; setBaskets((xs) => [...xs, b]); setSelId(b.id); }}>{t.name}</button>)}</>}
      </aside>
      <section className="sm-main">
        {draft && (
          <div className="es-draft">
            <input className="lib-q" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Basket name (e.g. AI semis)" aria-label="Basket name" />
            <input className="lib-q" value={draft.syms} onChange={(e) => setDraft({ ...draft, syms: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Tickers, comma or space separated (up to 15)" aria-label="Basket tickers" />
            <button className="btn primary" onClick={save}>Save</button><button className="btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        )}
        {!sel && !draft && <p className="muted">Make a basket of tickers (a theme, your watchlist, a sector you like) and see how it does against SPY, equal-weighted.</p>}
        {sel && (
          <>
            <div className="sm-head">
              <div>
                <h3>{sel.name} {today != null && <span className={today >= 0 ? 'up' : 'down'}>{pct(today)} today</span>}</h3>
                {last && <p className="small">Basket <b className={last.basket >= 100 ? 'up' : 'down'}>{pct(last.basket - 100, 1)}</b> vs SPY <b className={last.bench >= 100 ? 'up' : 'down'}>{pct(last.bench - 100, 1)}</b> over {R.label} → <b className={last.basket >= last.bench ? 'up' : 'down'}>{last.basket >= last.bench ? 'beating' : 'lagging'} by {Math.abs(last.basket - last.bench).toFixed(1)} pts</b></p>}
              </div>
              <div className="sm-row">
                <Seg value={rng} onChange={setRng} options={RANGES.map((x) => ({ id: x.id, label: x.label }))} />
                <button className="btn" onClick={() => setDraft({ id: sel.id, name: sel.name, syms: sel.syms.join(', ') })}>Edit</button>
                <button className="btn" onClick={() => { setBaskets((xs) => xs.filter((x) => x.id !== sel.id)); setSelId(null); }}>Delete</button>
                {r.data && <Fresh kind="eod" at={r.data.asOf} src={`Daily closes: ${r.data.sources.join(', ')}`} />}
              </div>
            </div>
            {r.loading && !r.data && <p className="muted">Loading daily closes…</p>}
            {r.error && !r.data && <p className="down small">{r.error}</p>}
            {curve.length > 1 && (
              <svg viewBox={`0 0 ${W} ${H}`} className="es-chart" preserveAspectRatio="none">
                <line x1={0} x2={W} y1={Y(100)} y2={Y(100)} className="es-zero" />
                <path d={line('bench')} className="es-bench" />
                <path d={line('basket')} className="es-bsk" />
              </svg>
            )}
            {curve.length > 1 && <div className="es-key small"><span><i className="es-bsk-k" /> {sel.name} (equal weight)</span><span><i className="es-bench-k" /> SPY</span></div>}
            {res && (
              <table className="sm-tbl">
                <thead><tr><th>Ticker</th><th className="r">{R.label} return</th><th className="r">vs SPY</th><th className="r">Today</th></tr></thead>
                <tbody>{[...res.per].sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9)).map((p) => (
                  <tr key={p.sym}><td><button className="sym-chip" onClick={() => onChart(p.sym)}>{p.sym}</button></td><td className={`r num ${(p.ret ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(p.ret, 1)}</td>
                    <td className={`r num ${p.ret != null && last && p.ret >= last.bench - 100 ? 'up' : 'down'}`}>{p.ret != null && last ? pct(p.ret - (last.bench - 100), 1) : '—'}</td>
                    <td className={`r num ${(snap[p.sym]?.c ?? 0) >= 0 ? 'up' : 'down'}`}>{pct(snap[p.sym]?.c)}</td></tr>
                ))}</tbody>
              </table>
            )}
            {r.data?.missing.length ? <p className="small warn">No price history for: {r.data.missing.join(', ')}</p> : null}
            <p className="note">Baskets are saved in this browser. Equal weight, rebalanced daily (the average of each day’s moves).</p>
          </>
        )}
      </section>
    </div>
  );
}

export default function EtfSectors({ mode, onChart, extra }: { mode: DataMode; onChart: (s: string) => void; extra?: ReactNode }) {
  const [tab, setTab] = usePersisted<Tab>('esTab', 'heat');
  const live = mode.kind === 'live';
  const snap = useSnapshot(live);
  return (
    <div className="overlay" role="dialog" aria-label="ETFs and sectors">
      <div className="overlay-in sm">
        <div className="phead">
          <div className="phead-title">ETFs & sectors</div>
          <div className="phead-ctl">
            {extra}
            <Seg value={tab} onChange={setTab} options={[{ id: 'heat', label: 'Sector heatmap' }, { id: 'etf', label: 'Inside an ETF' }, { id: 'baskets', label: 'My baskets' }]} />
            {live && snap.data && <Fresh kind="delayed" at={snap.data.asOf} src={snap.data.source} />}
          </div>
        </div>
        <div className="sm-body">
          {!live ? <p className="hw-pad muted"><Fresh kind="demo" /> The heatmap, ETF holdings and baskets use real quotes, so they need the live desk.</p>
            : <>
              {snap.error && !snap.data && <p className="down small hw-pad">Market snapshot: {snap.error}</p>}
              {tab === 'heat' ? <Heatmap snap={snap.data} onChart={onChart} /> : tab === 'etf' ? <Holdings snap={snap.data?.snap ?? {}} onChart={onChart} /> : <Baskets snap={snap.data?.snap ?? {}} onChart={onChart} />}
            </>}
        </div>
      </div>
    </div>
  );
}
