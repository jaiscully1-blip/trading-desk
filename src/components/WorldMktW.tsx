// World markets widgets: indices / index futures / FX pairs (with currency strength), trading halts, and index movers.
// Live data only; demo mode says so instead of showing made-up numbers.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import type { Halt, Mover, Px } from '../../shared/worldmkt';
import { Fresh, Seg, Spark, Star } from './common';

function useJson<T>(url: string | null, everyMs: number) {
  const [st, setSt] = useState<{ d: T | null; err: string | null }>({ d: null, err: null });
  useEffect(() => {
    if (!url) return;
    let stop = false;
    setSt({ d: null, err: null });
    const go = () => fetch(url).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { d: j, err: null } : { d: null, err: j.error ?? `HTTP ${r.status}` }); }).catch((e) => !stop && setSt((s) => (s.d ? s : { d: null, err: String(e) })));
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, everyMs);
    return () => { stop = true; clearInterval(id); };
  }, [url, everyMs]);
  return st;
}
const liveOnly = (what: string) => <p className="hw-pad small muted">{what} needs the live desk; nothing is shown in demo mode.</p>;
const pctTxt = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;

/* ---------------- indices / futures / FX ---------------- */
type Set = 'indices' | 'futures' | 'fx';
interface WorldData { set: Set; rows: (Px & { label: string; region?: string })[]; strength?: { ccy: string; score: number; n: number }[]; asOf: number; source: string }
export function WorldMktW({ mode, cfg, set: setCfg }: { mode: DataMode; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const tab: Set = cfg.tab ?? 'indices';
  const { d, err } = useJson<WorldData>(mode.kind === 'live' ? `/api/research?fn=world&set=${tab}` : null, 60_000);
  const digits = (r: { last: number; sym: string }) => (tab === 'fx' ? (r.last > 20 ? 2 : 4) : r.last > 1000 ? 0 : 2);
  return (
    <div className="wm">
      <div className="wm-h"><Seg<Set> value={tab} onChange={(t) => setCfg({ ...cfg, tab: t })} options={[{ id: 'indices', label: 'World indices' }, { id: 'futures', label: 'Futures' }, { id: 'fx', label: 'FX' }]} />{d && <Fresh kind="delayed" at={d.asOf} src={d.source} />}</div>
      {mode.kind !== 'live' ? liveOnly('World markets') : err ? <p className="hw-pad small down">{err}</p> : !d ? <p className="hw-pad small muted">Loading…</p> : (
        <>
          {tab === 'fx' && d.strength && d.strength.length > 2 && (
            <div className="wm-str small" title="Each currency's average move today against the others listed (positive = stronger)">
              {d.strength.map((s) => <span key={s.ccy} className={s.score >= 0 ? 'up' : 'down'}><b>{s.ccy}</b> {pctTxt(s.score)}</span>)}
            </div>
          )}
          <div className="wm-list">
            {d.rows.map((r, i) => (
              <div key={r.sym} className="wm-row">
                {tab === 'indices' && (i === 0 || d.rows[i - 1].region !== r.region) ? <div className="wm-reg small muted">{r.region}</div> : null}
                <span className="wm-l">{r.label}</span>
                <b className="num">{r.last.toLocaleString('en-US', { minimumFractionDigits: digits(r), maximumFractionDigits: digits(r) })}</b>
                <span className={`num ${r.chgPct >= 0 ? 'up' : 'down'}`}>{pctTxt(r.chgPct)}</span>
                {r.spark.length > 2 ? <Spark v={r.spark} w={64} h={14} /> : <span />}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- trading halts ---------------- */
export function HaltsW({ mode, onChart, mine }: { mode: DataMode; onChart: (s: string) => void; mine: Set2 }) {
  const { d, err } = useJson<{ halts: Halt[]; asOf: number; source: string }>(mode.kind === 'live' ? '/api/research?fn=halts' : null, 60_000);
  const [only, setOnly] = useState<'all' | 'open' | 'news'>('open');
  if (mode.kind !== 'live') return liveOnly('Trading halts');
  if (err) return <p className="hw-pad small down">{err}</p>;
  if (!d) return <p className="hw-pad small muted">Loading halts…</p>;
  const tm = (ms: number | null) => (ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '');
  const rows = d.halts.filter((h) => only === 'all' || (only === 'open' ? h.resumedAt == null || h.resumedAt > Date.now() : /^T[1-3]$/.test(h.code)));
  return (
    <div className="hl">
      <div className="wm-h"><Seg value={only} onChange={setOnly} options={[{ id: 'open', label: 'Still halted' }, { id: 'news', label: 'News halts' }, { id: 'all', label: 'All today' }]} /><Fresh kind="live" at={d.asOf} src={d.source} /></div>
      <div className="hl-list">
        {rows.slice(0, 80).map((h) => (
          <div key={`${h.sym}${h.haltedAt}`} className={`hl-row ${mine.has(h.sym) ? 'mine' : ''}`} title={`${h.name} · ${h.market}${h.pausePrice ? ` · pause price ${h.pausePrice}` : ''}`}>
            <span><Star sym={h.sym} /><button className="wl-sym" onClick={() => onChart(h.sym)}>{h.sym}</button></span>
            <span className="small" title={`${h.reason} (${h.code})`}>{h.reason}</span>
            <span className="num small muted" title="Halted at (ET)">{tm(h.haltedAt)}</span>
            <span className="num small" title={h.resumedAt ? `Resumed ${tm(h.resumedAt)} ET` : 'Still halted'}>{h.resumedAt ? <span className="up">▶ {tm(h.resumedAt)}</span> : <span className="down">halted</span>}</span>
          </div>
        ))}
        {!rows.length && <p className="hw-pad small muted">No {only === 'open' ? 'stocks are halted right now' : 'halts'}.</p>}
      </div>
      <p className="note small">T1 = news pending, T2/T3 = news out and resumption times set, LUDP = 5-minute volatility pause. Halts on SPACs, warrants and funds are included.</p>
    </div>
  );
}
type Set2 = globalThis.Set<string>;

/* ---------------- index movers ---------------- */
interface MoversData { index: 'spx' | 'ndx'; up: Mover[]; down: Mover[]; total: number | null; covered: number; members: number; asOf: number; source: string }
export function IndexMoversW({ mode, onChart, cfg, set }: { mode: DataMode; onChart: (s: string) => void; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const index: 'spx' | 'ndx' = cfg.index ?? 'spx';
  const { d, err } = useJson<MoversData>(mode.kind === 'live' ? `/api/research?fn=idxmovers&index=${index}` : null, 120_000);
  const row = (m: Mover) => (
    <div key={m.sym} className="im-row">
      <button className="wl-sym" onClick={() => onChart(m.sym)} title={m.name}>{m.sym}</button>
      <span className={`num small ${m.chgPct >= 0 ? 'up' : 'down'}`}>{pctTxt(m.chgPct, 1)}</span>
      <span className="num small muted" title="Approximate index weight">{(m.weight * 100).toFixed(1)}%</span>
      <b className={`num small ${m.contrib >= 0 ? 'up' : 'down'}`} title="Percentage points of the index's move">{m.contrib >= 0 ? '+' : ''}{m.contrib.toFixed(2)}</b>
    </div>
  );
  return (
    <div className="im">
      <div className="wm-h"><Seg value={index} onChange={(i) => set({ ...cfg, index: i })} options={[{ id: 'spx', label: 'S&P 500' }, { id: 'ndx', label: 'Nasdaq-100' }]} />{d && <Fresh kind="delayed" at={d.asOf} src={d.source} />}</div>
      {mode.kind !== 'live' ? liveOnly('Index movers') : err ? <p className="hw-pad small down">{err}</p> : !d ? <p className="hw-pad small muted">Loading…</p> : (
        <>
          {d.total != null && <p className="small hw-pad">Index move from priced members: <b className={`num ${d.total >= 0 ? 'up' : 'down'}`}>{pctTxt(d.total)}</b> <span className="muted">({d.covered} of {d.members} stocks priced)</span></p>}
          <div className="im-cols">
            <div><div className="small muted im-h">Added the most</div>{d.up.map(row)}</div>
            <div><div className="small muted im-h">Took away the most</div>{d.down.map(row)}</div>
          </div>
          <p className="note small">Points = weight × today's % change, in percentage points of the index. Weights are each company's share of total market cap, close to but not exactly the index's float-adjusted weights.</p>
        </>
      )}
    </div>
  );
}
