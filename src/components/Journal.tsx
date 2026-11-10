// Full journal (trades, stats, violations, import) and the account drawer.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import {
  EMOTIONS, VIOLATION_LABEL, equityByDay, etDay, stats, timeOfDay, unrealized,
  type AccountSettings, type Fill, type Guard, type Trade, type TradeView, type Transfer, type Violation, type ViolationType,
} from '../lib/journal';
import { detect, detectAll, fillsReady, mergeFills, parseCsv, toFills, transfersReady, trimToHeader, toTransfers, type FillField, type Mapping, type TransferField } from '../lib/csv';
import { etTime } from '../lib/clock';
import { rng } from '../lib/demo';
import { px, sUsd, tone, usd } from '../lib/format';
import { Fresh } from './common';
import { load, save } from '../lib/store';
import { ScreenshotInput, uid } from './Trading';
import { realized } from '../../shared/webull';

type Tab = 'trades' | 'stats' | 'violations' | 'import';
const fmtDate = (ms: number) => { const d = etDay(ms); return `${d.slice(5, 7)}/${d.slice(8)} ${etTime(ms)}`; };
const r2 = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`);

export interface JournalProps {
  views: TradeView[];
  setTrades: (f: (t: Trade[]) => Trade[]) => void;
  transfers: Transfer[];
  setTransfers: (f: (t: Transfer[]) => Transfer[]) => void;
  /** set the account to start at $0 on this date (used when a CSV import arrives before any starting balance) */
  onAutoStart?: (startDate: number) => void;
  violations: Violation[];
  lastPx: (s: string) => number | undefined;
  settings: AccountSettings;
  onClose: () => void;
  onSelect: (s: string) => void;
  onReplay: (id: string) => void;
  canSample: boolean;
}

export function JournalOverlay(p: JournalProps) {
  // the Daily recap's "Import history" link lands here on the Import tab (one-shot hint in the browser store)
  const [tab, setTab] = useState<Tab>(() => { const t = load<Tab | null>('journalTab', null); if (t) save('journalTab', null); return t ?? 'trades'; });
  const hasDemo = p.views.some((v) => v.t.demo);
  return (
    <div className="overlay" role="dialog" aria-label="Journal">
      <div className="overlay-in jn">
        <div className="phead">
          <div className="phead-title">
            <div className="tabs">
              {(['trades', 'stats', 'violations', 'import'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
            </div>
          </div>
          <div className="phead-ctl">
            {hasDemo && <><Fresh kind="demo" /><button className="chip sm" onClick={() => p.setTrades((ts) => ts.map((t) => (t.demo ? { ...t, deleted: true, updated: Date.now() } : t)))}>Remove sample trades</button></>}
          </div>
          <button className="icon-btn" onClick={p.onClose} aria-label="Close">×</button>
        </div>
        <div className="jn-body">
          {tab === 'trades' && <Trades {...p} />}
          {tab === 'stats' && <StatsTab views={p.views} />}
          {tab === 'violations' && <ViolationsTab v={p.violations} />}
          {tab === 'import' && <ImportTab {...p} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- trades ---------------- */
function Trades(p: JournalProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const vcount = useMemo(() => { const m = new Map<string, number>(); for (const v of p.violations) m.set(v.tradeId, (m.get(v.tradeId) ?? 0) + 1); return m; }, [p.violations]);
  const list = p.views
    .filter((v) => (filter === 'all' || v.status === filter || (filter === 'open' && v.status === 'planned')) && (!q || v.t.sym.includes(q.toUpperCase()) || v.t.setup.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.openedAt ?? b.t.created) - (a.openedAt ?? a.t.created));
  const update = (id: string, f: (t: Trade) => Trade) => p.setTrades((ts) => ts.map((t) => (t.id === id ? { ...f(t), updated: Date.now() } : t)));

  if (!p.views.length) return <EmptyJournal {...p} />;
  return (
    <>
      <div className="jn-tools">
        <div className="chips">{(['all', 'open', 'closed'] as const).map((x) => <button key={x} className={`chip ${filter === x ? 'on' : ''}`} onClick={() => setFilter(x)}>{x}</button>)}</div>
        <input className="jn-search" placeholder="Ticker or setup" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="muted small">{list.length} trades</span>
      </div>
      <div className="jn-scroll">
        <table className="grid jn-t">
          <thead><tr><th>Opened</th><th>Sym</th><th>Side</th><th>Setup</th><th>Grade</th><th>Emotion</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th>R</th><th /></tr></thead>
          <tbody>
            {list.map((v) => {
              const t = v.t, isOpen = open === t.id;
              const lp = v.status === 'open' ? p.lastPx(t.sym) : undefined;
              const u = lp != null && Number.isFinite(lp) ? unrealized(v, lp) : 0;
              return (
                <Fragment key={t.id}>
                  <tr className={isOpen ? 'open' : ''} onClick={() => setOpen(isOpen ? null : t.id)}>
                    <td className="num">{v.openedAt ? fmtDate(v.openedAt) : fmtDate(t.created)}</td>
                    <td className="wl-sym">{t.sym}</td>
                    <td className={t.side === 'long' ? 'up' : 'down'}>{t.side}</td>
                    <td>{t.setup || <span className="muted">—</span>}</td>
                    <td>{t.grade ? <span title={`${t.grade.playbook} · ${t.grade.score}%`}>{t.grade.grade}</span> : '—'}</td>
                    <td>{t.emotion ?? '—'}</td>
                    <td className="num">{v.maxQty || t.plannedSize || '—'}</td>
                    <td className="num">{v.avgEntry ? px(v.avgEntry) : '—'}</td>
                    <td className="num">{v.avgExit ? px(v.avgExit) : v.status === 'open' ? <span className="muted">open</span> : '—'}</td>
                    <td className={`num ${tone(v.realized + u)}`}>{v.status === 'open' && lp == null && !v.realized ? <span className="muted small" title="No live quote for this contract, so the open P&L is not shown">open</span> : sUsd(v.realized + u)}{v.status === 'open' && lp != null && <span className="muted small"> u</span>}</td>
                    <td className={`num ${tone(v.r ?? 0)}`}>{r2(v.r)}</td>
                    <td className="jn-flags">
                      {t.imported && <span className="tag" title="Imported from the broker with no plan">import</span>}
                      {t.demo && <span className="tag t-NEWS">demo</span>}
                      {vcount.get(t.id) ? <span className="tag t-SQZ" title="Rule violations">{vcount.get(t.id)}!</span> : null}
                    </td>
                  </tr>
                  {isOpen && <tr className="sc-detail"><td colSpan={12}><TradeDetail v={v} update={(f) => update(t.id, f)} remove={() => update(t.id, (x) => ({ ...x, deleted: true }))} violations={p.violations.filter((x) => x.tradeId === t.id)} onSelect={p.onSelect} onReplay={p.onReplay} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TradeDetail({ v, update, remove, violations, onSelect, onReplay }: { v: TradeView; update: (f: (t: Trade) => Trade) => void; remove: () => void; violations: Violation[]; onSelect: (s: string) => void; onReplay: (id: string) => void }) {
  const t = v.t;
  const [fill, setFill] = useState({ action: t.side === 'long' ? 'sell' : 'buy', qty: '', price: '', time: '' });
  const [confirmDel, setConfirmDel] = useState(false);
  const addFill = () => {
    const qty = +fill.qty, price = +fill.price;
    if (!(qty > 0) || !(price > 0)) return;
    const when = fill.time ? Date.parse(fill.time) : Date.now();
    const f: Fill = { id: uid(), t: Number.isFinite(when) ? when : Date.now(), action: fill.action as Fill['action'], qty, price, src: 'manual' };
    update((x) => ({ ...x, fills: [...x.fills, f] }));
    setFill({ ...fill, qty: '', price: '' });
  };
  return (
    <div className="td">
      <div className="td-col">
        <div className="kv">
          <span>Stop (initial → now)</span><b className="num">{t.initialStop ?? '—'} → {t.stop ?? '—'}</b>
          <span>Target</span><b className="num">{t.target ?? '—'}</b>
          <span>Initial risk</span><b className="num">{v.risk ? usd(v.risk) : '— (no stop)'}</b>
          <span>Fees</span><b className="num">{usd(v.fees, 2)}</b>
          {t.grade && <><span>Grade at entry</span><b>{t.grade.grade} · {t.grade.score}% · {t.grade.playbook}</b></>}
        </div>
        {t.thesis && <p className="td-thesis">{t.thesis}</p>}
        {t.checklist.length > 0 && (
          <ul className="crit">{t.checklist.map((c, i) => <li key={i} className={`c-${c.auto}`}><span className="c-mark">☑</span><span>{c.label}</span><span className="small muted">{c.auto === 'na' ? '' : `data: ${c.auto}`}</span><span /></li>)}</ul>
        )}
        {violations.length > 0 && <ul className="viol">{violations.map((x, i) => <li key={i}><b className="down small">{VIOLATION_LABEL[x.type]}</b><span className="small muted">{x.detail}</span><span className="num down">{usd(-x.cost)}</span></li>)}</ul>}
        <label className="td-notes">Notes<textarea rows={2} defaultValue={t.notes} onBlur={(e) => e.target.value !== (t.notes ?? '') && update((x) => ({ ...x, notes: e.target.value }))} /></label>
        <div className="td-emo">
          {EMOTIONS.map((e) => <button key={e} className={`chip sm ${t.emotion === e ? 'on' : ''}`} onClick={() => update((x) => ({ ...x, emotion: x.emotion === e ? null : e }))}>{e}</button>)}
        </div>
      </div>
      <div className="td-col">
        <table className="grid td-fills">
          <thead><tr><th>Fill</th><th>Side</th><th>Qty</th><th>Price</th><th>Src</th></tr></thead>
          <tbody>{[...t.fills].sort((a, b) => a.t - b.t).map((f) => <tr key={f.id}><td className="num">{fmtDate(f.t)}</td><td>{f.action}</td><td className="num">{f.qty}</td><td className="num">{px(f.price)}</td><td className="muted small">{f.src}</td></tr>)}</tbody>
        </table>
        <div className="fb-row td-add">
          <select value={fill.action} onChange={(e) => setFill({ ...fill, action: e.target.value })}><option value="buy">buy</option><option value="sell">sell</option></select>
          <input placeholder="qty" inputMode="numeric" value={fill.qty} onChange={(e) => setFill({ ...fill, qty: e.target.value })} />
          <input placeholder="price" inputMode="decimal" value={fill.price} onChange={(e) => setFill({ ...fill, price: e.target.value })} />
          <input type="datetime-local" value={fill.time} onChange={(e) => setFill({ ...fill, time: e.target.value })} title="Blank = now (your computer's time zone)" />
          <button className="btn" onClick={addFill}>Add fill</button>
        </div>
        <ScreenshotInput value={t.screenshot} onChange={(s) => update((x) => ({ ...x, screenshot: s }))} />
        <div className="fb-row">
          {v.openedAt != null && <button className="btn primary" onClick={() => onReplay(t.id)}>Replay with ghost exit</button>}
          <button className="btn" onClick={() => onSelect(t.sym)}>Show {t.sym} chart</button>
          <button className={`btn ${confirmDel ? 'danger' : ''}`} onClick={() => (confirmDel ? remove() : setConfirmDel(true))}>{confirmDel ? 'Click again to delete' : 'Delete trade'}</button>
        </div>
      </div>
    </div>
  );
}

function EmptyJournal(p: JournalProps) {
  return (
    <div className="ph-body">
      <p><b>No trades yet.</b></p>
      <p className="muted">Log entries from the Quick Journal tab (Q). Each one has to pass your playbook checklist. Or import your broker’s CSV in the Import tab.</p>
      {p.canSample && (
        <p>
          <button className="btn" disabled={p.settings.startBalance == null} onClick={() => p.setTrades((ts) => [...ts, ...sampleTrades()])}>Load 30 sample trades (DEMO)</button>
          {p.settings.startBalance == null && <span className="small muted"> Set a starting balance in the account drawer first.</span>}
        </p>
      )}
    </div>
  );
}

/** Preview-only sample journal, flagged demo:true and badged. */
export function sampleTrades(): Trade[] {
  const r = rng(424242);
  const syms = ['NVDA', 'AMD', 'TSLA', 'PLTR', 'COIN', 'SPY', 'QQQ', 'MU', 'HOOD'];
  const setups = ['ORB', 'bull flag', 'gap-and-go', 'VWAP reclaim', 'breakout'];
  const out: Trade[] = [];
  const now = Date.now();
  for (let i = 0; i < 30; i++) {
    const day = Math.floor(i / 2) + 1;
    let base = now - day * 86400_000;
    while ([0, 6].includes(new Date(base).getUTCDay())) base -= 86400_000;
    const d = new Date(base);
    const open = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 14, 30) + Math.floor(r() * 300) * 60_000;
    const price = 20 + r() * 200, stopDist = price * (0.005 + r() * 0.015), qty = Math.max(1, Math.floor(125 / stopDist));
    const rMult = r() < 0.48 ? -(0.4 + r() * 0.7) : 0.5 + r() * 2.5;
    const exit = price + rMult * stopDist;
    out.push({
      id: `demo-${i}`, created: open - 120_000, updated: now, sym: syms[Math.floor(r() * syms.length)], side: 'long', initialStop: +(price - stopDist).toFixed(2), stop: +(price - stopDist).toFixed(2),
      stopHistory: [], target: +(price + 2 * stopDist).toFixed(2), plannedSize: qty, thesis: 'Sample trade', setup: setups[Math.floor(r() * setups.length)],
      emotion: (['calm', 'confident', 'fomo', 'anxious'] as const)[Math.floor(r() * 4)], grade: { grade: ['A+', 'A', 'B', 'C'][Math.floor(r() * 4)], score: 70, playbook: 'Momentum A+' },
      checklist: [], demo: true,
      fills: [
        { id: `demo-${i}-a`, t: open, action: 'buy', qty, price: +price.toFixed(2), src: 'manual' },
        { id: `demo-${i}-b`, t: open + (5 + Math.floor(r() * 90)) * 60_000, action: 'sell', qty, price: +exit.toFixed(2), src: 'manual' },
      ],
    });
  }
  return out;
}

/* ---------------- stats ---------------- */
function StatsTab({ views }: { views: TradeView[] }) {
  const s = stats(views);
  const group = (key: (v: TradeView) => string) => {
    const m = new Map<string, TradeView[]>();
    for (const v of views) if (v.status === 'closed') { const k = key(v) || '—'; m.set(k, [...(m.get(k) ?? []), v]); }
    return [...m.entries()].map(([k, vs]) => ({ k, s: stats(vs) })).sort((a, b) => b.s.net - a.s.net);
  };
  const tod = timeOfDay(views);
  const maxAbs = Math.max(1, ...tod.map((b) => Math.abs(b.net)));
  const Card = ({ l, v, c }: { l: string; v: string; c?: string }) => <div className="card"><span className="muted small">{l}</span><b className={`num ${c ?? ''}`}>{v}</b></div>;
  const G = ({ title, rows }: { title: string; rows: { k: string; s: ReturnType<typeof stats> }[] }) => (
    <div>
      <h4>{title}</h4>
      <table className="grid"><thead><tr><th>{title.replace('By ', '')}</th><th>Trades</th><th>Win %</th><th>Exp R</th><th>Net</th></tr></thead>
        <tbody>{rows.map(({ k, s }) => <tr key={k}><td>{k}</td><td className="num">{s.trades}</td><td className="num">{s.winRate?.toFixed(0) ?? '—'}</td><td className={`num ${tone(s.expectancyR ?? 0)}`}>{r2(s.expectancyR)}</td><td className={`num ${tone(s.net)}`}>{sUsd(s.net)}</td></tr>)}</tbody>
      </table>
    </div>
  );
  return (
    <div className="jn-scroll stats">
      <div className="cards">
        <Card l="Closed trades" v={String(s.trades)} />
        <Card l="Win rate" v={s.winRate == null ? '—' : `${s.winRate.toFixed(1)}%`} />
        <Card l="Expectancy" v={r2(s.expectancyR)} c={tone(s.expectancyR ?? 0)} />
        <Card l="Expectancy $" v={s.expectancy$ == null ? '—' : sUsd(s.expectancy$)} c={tone(s.expectancy$ ?? 0)} />
        <Card l="Avg win / loss" v={`${r2(s.avgWinR)} / ${r2(s.avgLossR)}`} />
        <Card l="Profit factor" v={s.profitFactor == null ? '—' : Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : '∞'} />
        <Card l="Net" v={sUsd(s.net)} c={tone(s.net)} />
      </div>
      <h4>Time of day (entry, ET)</h4>
      <table className="grid tod">
        <thead><tr><th>Bucket</th><th>Trades</th><th>Win %</th><th>Avg R</th><th>Net</th><th /></tr></thead>
        <tbody>{tod.filter((b) => b.trades).map((b) => (
          <tr key={b.label}><td>{b.label}</td><td className="num">{b.trades}</td><td className="num">{((b.wins / b.trades) * 100).toFixed(0)}</td><td className={`num ${tone(b.avgR ?? 0)}`}>{r2(b.avgR)}</td><td className={`num ${tone(b.net)}`}>{sUsd(b.net)}</td>
            <td className="tod-bar"><span className={b.net >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(b.net) / maxAbs) * 100}%` }} /></td></tr>
        ))}</tbody>
      </table>
      <div className="stats-grid">
        <G title="By setup" rows={group((v) => v.t.setup)} />
        <G title="By grade" rows={group((v) => v.t.grade?.grade.replace('*', '') ?? '')} />
        <G title="By emotion" rows={group((v) => v.t.emotion ?? '')} />
      </div>
    </div>
  );
}

function ViolationsTab({ v }: { v: Violation[] }) {
  const total = v.reduce((a, x) => a + x.cost, 0);
  const by = new Map<ViolationType, { n: number; cost: number }>();
  for (const x of v) { const c = by.get(x.type) ?? { n: 0, cost: 0 }; c.n++; c.cost += x.cost; by.set(x.type, c); }
  return (
    <div className="jn-scroll">
      <div className="cards"><div className="card"><span className="muted small">Cost of broken rules</span><b className={`num ${total ? 'down' : ''}`}>{usd(-total)}</b></div><div className="card"><span className="muted small">Violations</span><b className="num">{v.length}</b></div></div>
      <table className="grid"><thead><tr><th>Rule</th><th>Times</th><th>Cost</th></tr></thead>
        <tbody>{[...by.entries()].sort((a, b) => b[1].cost - a[1].cost).map(([k, c]) => <tr key={k}><td>{VIOLATION_LABEL[k]}</td><td className="num">{c.n}</td><td className="num down">{usd(-c.cost)}</td></tr>)}</tbody>
      </table>
      <h4>Log</h4>
      <table className="grid"><thead><tr><th>When</th><th>Sym</th><th>Rule</th><th>Detail</th><th>Cost</th></tr></thead>
        <tbody>{v.map((x, i) => <tr key={i}><td className="num">{fmtDate(x.t)}</td><td className="wl-sym">{x.sym}</td><td>{VIOLATION_LABEL[x.type]}</td><td className="small muted">{x.detail}</td><td className="num down">{usd(-x.cost)}</td></tr>)}</tbody>
      </table>
      <p className="note">Cost is what the broken rule lost: the full loss for trades you shouldn’t have taken, or the part of the loss beyond your plan for oversizing and widened stops. Winners that broke a rule are logged at $0.</p>
    </div>
  );
}

/* ---------------- import ---------------- */
interface Pending { name: string; rows: string[][]; map: Mapping }
/** One file's result. fillIds / transferIds are what this file added, so Undo can take exactly those back out. */
export interface FileResult {
  id: string; name: string; at: number; ok: boolean; why?: string; via: string;
  added: number; dup: number; options: number; deposits: number; withdrawals: number; depositSum: number; withdrawSum: number; other: number;
  pnl: number; closed: number; wins: number; trades: { sym: string; side: string; pnl: number | null; day: string }[];
  fillIds: string[]; transferIds: string[]; undone?: boolean; started?: boolean; first?: number;
}

/** Ask the server's free AI to name the columns. Only the header row leaves this browser. */
async function aiColumns(headers: string[]): Promise<Partial<Record<FillField | TransferField, number>> | null> {
  try {
    const r = await fetch('/api/research?fn=csvmap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ headers }) });
    const j = await r.json();
    return r.ok ? j.cols : null;
  } catch { return null; }
}
const fid = () => Math.random().toString(36).slice(2, 9);

export interface ImportDeps { setTrades: JournalProps['setTrades']; setTransfers: JournalProps['setTransfers']; settings: AccountSettings; onAutoStart?: (startDate: number) => void }
export type PendingFile = Pending & { id: string };

/** Add one file's rows to the journal and return what happened. Shared by the Import tab and the Daily recap's "Add CSV". */
export function applyImport(p: ImportDeps, name: string, rows: string[][], fills: Mapping, transfers: Mapping, via: string): FileResult {
  const fr = fillsReady(fills) ? toFills(rows, fills) : { items: [], skipped: [] };
  const tr = transfersReady(transfers) ? toTransfers(rows, transfers) : { items: [], skipped: [] };
  const res: FileResult = { id: fid(), name, at: Date.now(), ok: true, via, added: 0, dup: 0, options: 0, deposits: 0, withdrawals: 0, depositSum: 0, withdrawSum: 0, other: 0, pnl: 0, closed: 0, wins: 0, trades: [], fillIds: [], transferIds: [] };
  if (fr.items.length) {
    p.setTrades((ts) => {
      const have = new Set(ts.flatMap((t) => t.fills.map((f) => f.id)));
      const fresh = fr.items.filter((f) => !have.has(f.id));
      res.fillIds = fresh.map((f) => f.id); res.added = fresh.length; res.dup = fr.items.length - fresh.length;
      return mergeFills(ts, fr.items).trades;
    });
    res.options = fr.items.filter((f) => f.opt).length;
    const rz = realized(fr.items.map((f) => ({ id: f.id, sym: f.sym, side: f.action === 'buy' ? 'BUY' as const : 'SELL' as const, qty: f.qty, price: f.price, t: f.t, mult: f.mult ?? 1 })));
    res.pnl = rz.closed.reduce((a, c) => a + c.pnl, 0) - fr.items.reduce((a, f) => a + (f.fee ?? 0), 0);
    res.closed = rz.closed.length; res.wins = rz.closed.filter((c) => c.pnl > 0).length;
    res.trades = rz.closed.slice(-40).reverse().map((c) => ({ sym: c.sym, side: c.side, pnl: c.pnl, day: c.day }));
  }
  if (tr.items.length) {
    p.setTransfers((ts) => { const ids = new Set(ts.map((x) => x.id)); const fresh = tr.items.filter((x) => !ids.has(x.id)); res.transferIds = fresh.map((x) => x.id); return [...ts, ...fresh]; });
    const dep = tr.items.filter((t) => t.amount > 0), wd = tr.items.filter((t) => t.amount < 0);
    res.deposits = dep.length; res.withdrawals = wd.length;
    res.depositSum = dep.reduce((a, t) => a + t.amount, 0); res.withdrawSum = wd.reduce((a, t) => a + t.amount, 0);
  }
  res.other = Math.max(0, rows.length - 1 - fr.items.length - tr.items.length);
  const ts = [...fr.items.map((f) => f.t), ...tr.items.map((t) => t.t)];
  if (ts.length) res.first = Math.min(...ts);
  if (!fr.items.length && !tr.items.length) { res.ok = false; res.why = fr.skipped[0]?.why ? `no trade, deposit or withdrawal rows (first skipped row: ${fr.skipped[0].why})` : 'no trade, deposit or withdrawal rows found'; }
  return res;
}

/** Read broker CSV files into the journal: built-in column rules first, then the free AI column match (header row only). Files that still
 *  cannot be read come back in `pending` so the Import tab can offer the match-by-hand form. */
export async function importFiles(p: ImportDeps, list: FileList | File[], onBusy: (s: string) => void = () => {}): Promise<{ out: FileResult[]; pending: PendingFile[] }> {
  const arr = [...list].filter((f) => /\.(csv|txt)$/i.test(f.name) || /csv|excel|text/i.test(f.type));
  const out: FileResult[] = [], pending: PendingFile[] = [];
  for (let i = 0; i < arr.length; i++) {
    const f = arr[i];
    onBusy(`Reading ${f.name}${arr.length > 1 ? ` (${i + 1} of ${arr.length})` : ''}…`);
    const rows = trimToHeader(parseCsv(await f.text()));
    if (rows.length < 2) { out.push({ ...applyImport(p, f.name, rows, { kind: 'fills', cols: {} }, { kind: 'transfers', cols: {} }, '—'), ok: false, why: 'the file is empty' }); continue; }
    let { fills, transfers } = detectAll(rows);
    let via = 'built-in rules';
    let r = applyImport(p, f.name, rows, fills, transfers, via);
    if (!r.ok) {
      onBusy(`Matching the columns of ${f.name} with AI (column names only)…`);
      const ai = await aiColumns(rows[0]);
      if (ai) {
        fills = { kind: 'fills', cols: { ...ai } };
        transfers = { kind: 'transfers', cols: { time: ai.time, amount: (ai as Record<string, number | undefined>).amount, type: ai.type } };
        via = 'AI column match';
        const r2 = applyImport(p, f.name, rows, fills, transfers, via);
        if (r2.ok) r = r2;
      }
    }
    if (!r.ok) pending.push({ id: r.id, name: f.name, rows, map: fillsReady(fills) || !transfersReady(transfers) ? fills : transfers });
    out.push(r);
  }
  // no starting balance yet: start the account at $0 on the first date in these files
  const firsts = out.filter((r) => r.ok && r.first != null).map((r) => r.first!);
  if (p.settings.startBalance == null && firsts.length && p.onAutoStart) {
    p.onAutoStart(Math.min(...firsts) - 1000);
    out.forEach((r) => { if (r.ok) r.started = true; });
  }
  onBusy('');
  return { out, pending };
}
const IMPORT_LOG = 'td.importLog';
export const readImportLog = (): FileResult[] => { try { return JSON.parse(localStorage.getItem(IMPORT_LOG) ?? '[]'); } catch { return []; } };
export const writeImportLog = (l: FileResult[]) => { try { localStorage.setItem(IMPORT_LOG, JSON.stringify(l.slice(0, 15))); } catch { /* storage full */ } };

function ImportTab(p: JournalProps) {
  const [log, setLog] = useState<FileResult[]>(readImportLog);
  const saveLog = (f: (l: FileResult[]) => FileResult[]) => setLog((l) => { const n = f(l).slice(0, 15); writeImportLog(n); return n; });
  const [manual, setManual] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const apply = (name: string, rows: string[][], fills: Mapping, transfers: Mapping, via: string) => applyImport(p, name, rows, fills, transfers, via);
  const read = async (list: FileList | File[]) => {
    const { out, pending } = await importFiles(p, list, setBusy);
    if (!out.length) return;
    setManual((m) => [...m, ...pending]);
    saveLog((l) => [...out.reverse(), ...l]);
  };

  const undo = (r: FileResult) => {
    const fids = new Set(r.fillIds), tids = new Set(r.transferIds);
    if (fids.size) p.setTrades((ts) => ts.map((t) => (t.fills.some((f) => fids.has(f.id)) ? { ...t, fills: t.fills.filter((f) => !fids.has(f.id)), updated: Date.now() } : t)).filter((t) => !(t.imported && t.fills.length === 0)));
    if (tids.size) p.setTransfers((ts) => ts.filter((x) => !tids.has(x.id)));
    saveLog((l) => l.map((x) => (x.id === r.id ? { ...x, undone: true } : x)));
  };
  const importManual = (i: number) => {
    const f = manual[i];
    const r = f.map.kind === 'fills' ? apply(f.name, f.rows, f.map, { kind: 'transfers', cols: {} }, 'your column match') : apply(f.name, f.rows, { kind: 'fills', cols: {} }, f.map, 'your column match');
    saveLog((l) => [r, ...l.filter((x) => x.id !== f.id)]);
    if (r.ok) setManual((m) => m.filter((_, j) => j !== i));
  };
  const live = p.transfers.filter((t) => !t.deleted).sort((a, b) => b.t - a.t);
  return (
    <div className="jn-scroll imp">
      <div className={`drop2 ${over ? 'over' : ''}`} role="button" tabIndex={0}
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>
        <b>Drop broker CSVs here</b>
        <span className="muted small">or click to choose. Stocks and options, any number of files: trades, deposits and withdrawals are added to your journal and balance right away.</span>
        <input ref={input} type="file" accept=".csv,.txt,text/csv" multiple hidden onChange={(e) => { if (e.target.files) read(e.target.files); e.target.value = ''; }} />
      </div>
      {busy && <div className="imp-busy small"><span className="spin" />{busy}</div>}

      {log.length > 0 && <div className="imp-list">
        {log.map((r) => (
          <div key={r.id} className={`imp-card ${r.ok ? (r.undone ? 'undone' : 'ok') : 'bad'}`}>
            <div className="imp-card-h">
              <span className="imp-ic" aria-hidden="true">{r.ok ? (r.undone ? '↺' : '✓') : '!'}</span>
              <b className="imp-name" title={r.name}>{r.name}</b>
              <span className="muted small">{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
              {r.ok && !r.undone && <button className="btn sm" onClick={() => undo(r)} title="Take this file's trades and transfers back out">Undo</button>}
              <button className="hw-btn" onClick={() => saveLog((l) => l.filter((x) => x.id !== r.id))} aria-label="Remove from this list" title="Remove from this list (keeps the data)">×</button>
            </div>
            {r.ok ? (
              <div className="imp-card-b">
                {r.undone ? <span className="muted small">Undone: nothing from this file is in your journal.</span> : <>
                  <span className="imp-stat"><b className="num">{r.added}</b> trade fills{r.options ? ` (${r.options} options)` : ''}{r.dup ? <span className="muted"> · {r.dup} already there</span> : null}</span>
                  {r.closed > 0 && <span className="imp-stat">Realized <b className={`num ${tone(r.pnl)}`}>{sUsd(r.pnl)}</b> <span className="muted">on {r.closed} closed · {r.wins} wins</span></span>}
                  {r.deposits > 0 && <span className="imp-stat">Deposits <b className="num up">{sUsd(r.depositSum)}</b></span>}
                  {r.withdrawals > 0 && <span className="imp-stat">Withdrawals <b className="num down">{sUsd(r.withdrawSum)}</b></span>}
                  {r.started && <span className="imp-stat small muted">Balance now built from your deposits and trades</span>}
                </>}
                {!r.undone && r.trades.length > 0 && (
                  <details className="imp-tr"><summary className="small">Closed trades in this file</summary>
                    {r.trades.map((t, i) => <div key={i} className="imp-tr-r small"><span className="num muted">{t.day}</span><b>{t.sym}</b><span className="muted">{t.side}</span><span className={`num ${tone(t.pnl ?? 0)}`}>{t.pnl != null ? sUsd(t.pnl) : ''}</span></div>)}
                  </details>
                )}
                <span className="muted small imp-via">Read by {r.via}{r.other ? ` · ${r.other} other rows (cancelled orders, dividends, fees) left out` : ''}</span>
              </div>
            ) : (
              <div className="imp-card-b"><span className="small down">Couldn’t read it: {r.why}.</span>
                {manual.some((m) => m.id === r.id) && <details className="imp-fix"><summary className="small">Match the columns by hand</summary>
                  {manual.map((f, i) => f.id === r.id && <MapFile key={f.id} f={f} setMap={(map) => setManual((x) => x.map((y, j) => (j === i ? { ...y, map } : y)))} onImport={() => importManual(i)} onDrop={() => setManual((x) => x.filter((_, j) => j !== i))} />)}
                </details>}
              </div>
            )}
          </div>
        ))}
      </div>}

      <h4>Deposits and withdrawals</h4>
      <table className="grid"><thead><tr><th>Date</th><th>Amount</th><th>Note</th><th /></tr></thead>
        <tbody>
          {live.map((t) => <tr key={t.id}><td className="num">{etDay(t.t)}</td><td className={`num ${tone(t.amount)}`}>{sUsd(t.amount)}</td><td className="small muted">{t.note}</td>
            <td><button className="wl-x vis" onClick={() => p.setTransfers((ts) => ts.map((x) => (x.id === t.id ? { ...x, deleted: true, updated: Date.now() } : x)))} aria-label="Delete">×</button></td></tr>)}
          {!live.length && <tr><td colSpan={4} className="muted">None yet. They come in with your broker’s CSV.</td></tr>}
        </tbody>
      </table>
      <details className="note">
        <summary>Where to export from</summary>
        Webull: Account → Orders → Order History → export (stocks and options are separate files; drop both). Robinhood: Account → Reports and statements → account activity CSV. Schwab: History → Export. Fidelity: Activity & Orders → History → Download. IBKR: Reports → Statements → Activity → CSV. Times are read as US Eastern.
      </details>
    </div>
  );
}

const FILL_FIELDS: FillField[] = ['symbol', 'side', 'qty', 'price', 'time', 'status', 'fee', 'desc'];
const TRANSFER_FIELDS: TransferField[] = ['time', 'amount', 'type'];

function MapFile({ f, setMap, onImport, onDrop }: { f: Pending; setMap: (m: Mapping) => void; onImport: () => void; onDrop: () => void }) {
  const h = f.rows[0];
  const fields = f.map.kind === 'fills' ? FILL_FIELDS : TRANSFER_FIELDS;
  const preview = f.map.kind === 'fills' ? toFills(f.rows, f.map) : toTransfers(f.rows, f.map);
  const required = f.map.kind === 'fills' ? ['symbol', 'side', 'qty', 'price', 'time'] : ['time', 'amount'];
  const missing = required.filter((k) => f.map.cols[k as FillField] == null);
  return (
    <div className="mapf">
      <div className="fb-row">
        <b>{f.name}</b>
        <select value={f.map.kind} onChange={(e) => setMap({ ...detect(f.rows), kind: e.target.value as Mapping['kind'] })}>
          <option value="fills">Fills (orders)</option><option value="transfers">Cash transfers</option>
        </select>
        <span className="muted small">{f.rows.length - 1} rows · {preview.items.length} usable · {preview.skipped.length} skipped</span>
      </div>
      <div className="mapf-cols">
        {fields.map((k) => (
          <label key={k} className={required.includes(k) && f.map.cols[k as FillField] == null ? 'down' : ''}>
            {k}
            <select value={f.map.cols[k as FillField] ?? ''} onChange={(e) => setMap({ ...f.map, cols: { ...f.map.cols, [k]: e.target.value === '' ? undefined : +e.target.value } })}>
              <option value="">—</option>
              {h.map((c, i) => <option key={i} value={i}>{c}</option>)}
            </select>
          </label>
        ))}
      </div>
      {preview.skipped.length > 0 && <div className="small muted">Skipped: {preview.skipped.slice(0, 4).map((s) => `row ${s.row} (${s.why})`).join(', ')}{preview.skipped.length > 4 ? '…' : ''}</div>}
      <div className="fb-row">
        <button className="btn primary" disabled={missing.length > 0 || !preview.items.length} onClick={onImport}>Import {preview.items.length}</button>
        <button className="btn" onClick={onDrop}>Discard</button>
        {missing.length > 0 && <span className="small down">Map: {missing.join(', ')}</span>}
      </div>
    </div>
  );
}

/* ---------------- account drawer ---------------- */
export function AccountDrawer({ open, onClose, theme, views, transfers, settings, setSettings, guard: g, onImport }: {
  open: boolean; onClose: () => void; theme: string; views: TradeView[]; transfers: Transfer[];
  settings: AccountSettings; setSettings: (s: AccountSettings) => void; guard: Guard; onImport: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const [bal, setBal] = useState('');
  const [reset, setReset] = useState('');
  const days = useMemo(() => (settings.startBalance == null ? [] : equityByDay(views, transfers, settings.startBalance)), [views, transfers, settings.startBalance]);
  useEffect(() => {
    if (!open || !el.current || days.length < 2) return;
    const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: v('--panel') }, textColor: v('--muted'), fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } }, rightPriceScale: { borderColor: v('--line') }, timeScale: { borderColor: v('--line') },
      handleScroll: false, handleScale: false,
    });
    c.addSeries(LineSeries, { color: v('--accent'), lineWidth: 2, priceLineVisible: false }).setData(days.map((d) => ({ time: d.time as UTCTimestamp, value: d.equity })));
    c.timeScale().fitContent();
    return () => c.remove();
  }, [open, theme, days]);
  if (!open) return null;

  const s = stats(views);
  const net = days.reduce((a, d) => a + d.transfers, 0);
  const pnlDays = days.filter((d) => d.pnl !== 0).slice(-60);
  const max = Math.max(1, ...pnlDays.map((d) => Math.abs(d.pnl)));
  const weeks: (typeof pnlDays[number] | null)[][] = [];
  for (const d of pnlDays) {
    const wd = new Date(d.time * 1000).getUTCDay();
    if (wd < 1 || wd > 5) continue;
    if (!weeks.length || wd === 1 || weeks[weeks.length - 1].slice(wd - 1).some(Boolean)) weeks.push([null, null, null, null, null]);
    weeks[weeks.length - 1][wd - 1] = d;
  }
  const demo = views.some((v) => v.t.demo);
  return (
    <div className="drawer-scrim" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Account">
        <div className="phead">
          <div className="phead-title">Account</div><div className="phead-ctl" />
          {demo && <Fresh kind="demo" src="Includes sample trades" />}
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {settings.startBalance == null ? (
          <form className="fb" onSubmit={(e) => { e.preventDefault(); if (+bal > 0) setSettings({ ...settings, startBalance: +bal, startDate: Date.now() }); }}>
            <b>Set your starting balance once.</b>
            <span className="small muted">Equity is then computed from your journal plus deposits and withdrawals from your broker CSV. There is no manual deposit button.</span>
            <div className="fb-row"><input inputMode="decimal" placeholder="25000" value={bal} onChange={(e) => setBal(e.target.value)} /><button className="btn primary">Set</button></div>
          </form>
        ) : (
          <>
            <div className="kv wide">
              <span>Starting balance</span><b className="num">{usd(settings.startBalance)}</b>
              <span>Equity</span><b className="num">{usd(g.equity)}</b>
              <span>Net trading</span><b className={`num ${tone(s.net)}`}>{sUsd(s.net)}</b>
              <span>Deposits − withdrawals</span><b className="num">{sUsd(net)}</b>
              <span>Today</span><b className={`num ${tone(g.todayRealized + g.todayUnrealized)}`}>{sUsd(g.todayRealized + g.todayUnrealized)}</b>
              <span>R today</span><b className={`num ${tone(g.rToday)}`}>{r2(g.rToday)}</b>
              <span>Win rate</span><b className="num">{s.winRate == null ? '—' : `${s.winRate.toFixed(0)}%`}</b>
              <span>Expectancy</span><b className="num">{r2(s.expectancyR)}</b>
            </div>
            <h4>Equity curve</h4>
            {days.length >= 2 ? <div className="eq" ref={el} /> : <p className="note">The curve appears after two days with closed trades or transfers.</p>}
            <h4>P&amp;L calendar <span className="muted small">last {pnlDays.length} trading days</span></h4>
            <div className="cal">
              <div className="cal-days">{['M', 'T', 'W', 'T', 'F'].map((x, i) => <span key={i}>{x}</span>)}</div>
              {weeks.map((w, i) => (
                <div key={i} className="cal-wk">
                  {w.map((d, j) => <span key={j} className={`cal-c ${d ? (d.pnl >= 0 ? 'pos' : 'neg') : 'nil'}`} style={d ? { opacity: 0.25 + 0.75 * (Math.abs(d.pnl) / max) } : undefined} title={d ? `${d.day}: ${sUsd(d.pnl)}` : ''} />)}
                </div>
              ))}
            </div>
            <div className="fb-row drawer-foot">
              <button className="btn" onClick={onImport}>Import broker CSV</button>
              <span className="muted small">Started {settings.startDate ? etDay(settings.startDate) : '—'}</span>
              <input className="reset" placeholder='Type RESET to change the starting balance' value={reset} onChange={(e) => setReset(e.target.value)} />
              <button className="btn" disabled={reset !== 'RESET'} onClick={() => { setSettings({ ...settings, startBalance: null, startDate: null }); setReset(''); }}>Reset</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
