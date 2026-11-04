// Full journal (trades, stats, violations, import) and the account drawer.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import {
  EMOTIONS, VIOLATION_LABEL, equityByDay, etDay, stats, timeOfDay, unrealized,
  type AccountSettings, type Fill, type Guard, type Trade, type TradeView, type Transfer, type Violation, type ViolationType,
} from '../lib/journal';
import { detect, mergeFills, parseCsv, toFills, toTransfers, type FillField, type Mapping, type TransferField } from '../lib/csv';
import { etTime } from '../lib/clock';
import { rng } from '../lib/demo';
import { px, sUsd, tone, usd } from '../lib/format';
import { Fresh } from './common';
import { ScreenshotInput, uid } from './Trading';

type Tab = 'trades' | 'stats' | 'violations' | 'import';
const fmtDate = (ms: number) => { const d = etDay(ms); return `${d.slice(5, 7)}/${d.slice(8)} ${etTime(ms)}`; };
const r2 = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`);

export interface JournalProps {
  views: TradeView[];
  setTrades: (f: (t: Trade[]) => Trade[]) => void;
  transfers: Transfer[];
  setTransfers: (f: (t: Transfer[]) => Transfer[]) => void;
  violations: Violation[];
  lastPx: (s: string) => number | undefined;
  settings: AccountSettings;
  onClose: () => void;
  onSelect: (s: string) => void;
  canSample: boolean;
}

export function JournalOverlay(p: JournalProps) {
  const [tab, setTab] = useState<Tab>('trades');
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
              const u = v.status === 'open' ? unrealized(v, p.lastPx(t.sym)) : 0;
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
                    <td className={`num ${tone(v.realized + u)}`}>{sUsd(v.realized + u)}{v.status === 'open' && <span className="muted small"> u</span>}</td>
                    <td className={`num ${tone(v.r ?? 0)}`}>{r2(v.r)}</td>
                    <td className="jn-flags">
                      {t.imported && <span className="tag" title="Imported from the broker with no plan">import</span>}
                      {t.demo && <span className="tag t-NEWS">demo</span>}
                      {vcount.get(t.id) ? <span className="tag t-SQZ" title="Rule violations">{vcount.get(t.id)}!</span> : null}
                    </td>
                  </tr>
                  {isOpen && <tr className="sc-detail"><td colSpan={12}><TradeDetail v={v} update={(f) => update(t.id, f)} remove={() => update(t.id, (x) => ({ ...x, deleted: true }))} violations={p.violations.filter((x) => x.tradeId === t.id)} onSelect={p.onSelect} /></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TradeDetail({ v, update, remove, violations, onSelect }: { v: TradeView; update: (f: (t: Trade) => Trade) => void; remove: () => void; violations: Violation[]; onSelect: (s: string) => void }) {
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
          <ul className="crit">{t.checklist.map((c, i) => <li key={i} className={`c-${c.auto}`}><span className="c-mark">☑</span><span>{c.label}</span><span className="small muted">{c.auto === 'na' ? 'no data' : `data: ${c.auto}`}</span><span /></li>)}</ul>
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

function ImportTab(p: JournalProps) {
  const [files, setFiles] = useState<Pending[]>([]);
  const [msg, setMsg] = useState('');
  const read = async (list: FileList | File[]) => {
    const out: Pending[] = [];
    for (const f of [...list]) { const rows = parseCsv(await f.text()); if (rows.length > 1) out.push({ name: f.name, rows, map: detect(rows) }); }
    setFiles((x) => [...x, ...out]);
  };
  const doImport = (i: number) => {
    const f = files[i];
    if (f.map.kind === 'fills') {
      const r = toFills(f.rows, f.map);
      let res = { added: 0, matched: 0, created: 0, duplicate: 0 };
      p.setTrades((ts) => { const m = mergeFills(ts, r.items); res = m; return m.trades; });
      setTimeout(() => setMsg(`${f.name}: ${res.added} new fills (${res.duplicate} already imported). ${res.matched} matched journal entries, ${res.created} new imported trades. ${r.skipped.length} rows skipped.`), 0);
    } else {
      const r = toTransfers(f.rows, f.map);
      p.setTransfers((ts) => { const ids = new Set(ts.map((x) => x.id)); return [...ts, ...r.items.filter((x) => !ids.has(x.id))]; });
      setMsg(`${f.name}: ${r.items.length} deposits/withdrawals, ${r.skipped.length} other rows skipped.`);
    }
    setFiles((x) => x.filter((_, j) => j !== i));
  };
  const live = p.transfers.filter((t) => !t.deleted).sort((a, b) => b.t - a.t);
  return (
    <div className="jn-scroll imp">
      <label
        className="drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); read(e.dataTransfer.files); }}
      >
        <b>Drop broker CSVs here</b> or click to choose. Fills and cash transfers are detected automatically.
        <input type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => e.target.files && read(e.target.files)} />
      </label>
      {msg && <div className="banner">{msg}</div>}
      {files.map((f, i) => <MapFile key={f.name + i} f={f} setMap={(map) => setFiles((x) => x.map((y, j) => (j === i ? { ...y, map } : y)))} onImport={() => doImport(i)} onDrop={() => setFiles((x) => x.filter((_, j) => j !== i))} />)}
      <h4>Deposits and withdrawals</h4>
      <table className="grid"><thead><tr><th>Date</th><th>Amount</th><th>Note</th><th /></tr></thead>
        <tbody>
          {live.map((t) => <tr key={t.id}><td className="num">{etDay(t.t)}</td><td className={`num ${tone(t.amount)}`}>{sUsd(t.amount)}</td><td className="small muted">{t.note}</td>
            <td><button className="wl-x vis" onClick={() => p.setTransfers((ts) => ts.map((x) => (x.id === t.id ? { ...x, deleted: true, updated: Date.now() } : x)))} aria-label="Delete">×</button></td></tr>)}
          {!live.length && <tr><td colSpan={4} className="muted">None imported. Deposits are never typed in by hand; they come from your broker’s CSV.</td></tr>}
        </tbody>
      </table>
      <details className="note">
        <summary>Webull export steps</summary>
        In the Webull app: Account → History (not Orders) → Filter: Fully Filled and a date range → download icon. Webull emails the CSV and allows one export a day.
        It doesn’t include fees or cash transfers; export transfers separately and drop that file here too. Times are read as US Eastern.
        Column names differ between Webull versions, so check the mapping before importing.
      </details>
    </div>
  );
}

const FILL_FIELDS: FillField[] = ['symbol', 'side', 'qty', 'price', 'time', 'status', 'fee'];
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
