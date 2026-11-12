// Private widgets: Webull account (read-only) and the Discord bot's channels. Both need the desk password.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HomeData } from './HomeWidgets';
import type { WbBalance, WbClosed, WbDay, WbFill, WbPosition } from '../../shared/webull';
import { cleanDiscord, type DcMessage } from '../../shared/discord';
import { getDeskKey, privateFetch, privatePost, setDeskKey, usePrivate } from '../data/private';
import type { WbOpenOrder } from '../../shared/webull';
import { useDesk } from '../lib/deskctx';
import { DEMO_AT, rng } from '../lib/demo';
import { pct, px, sUsd, tone } from '../lib/format';
import { etTime } from '../lib/clock';
import { daysLate } from '../../shared/extras';
import { CoName, Fresh, Seg, Star, SymInfo } from './common';
import { usePersisted } from '../lib/store';
import { tokenMessage } from '../../shared/webull';

type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }

/* ---------------- desk password ---------------- */
export function DeskLock({ code, error }: { code?: string; error?: string }) {
  const [v, setV] = useState('');
  if (code === 'no-password-set') return (
    <div className="hw-pad small">
      <p><b>Locked.</b> This panel shows your own account, and the desk is a public link, so it needs a password first.</p>
      <ol className="steps-ol"><li>Vercel → your project → Settings → Environment Variables</li><li>Add <code>DESK_PASSWORD</code> = any long phrase only you know</li><li>Redeploy, then type it here</li></ol>
    </div>
  );
  return (
    <form className="hw-pad lock" onSubmit={(e) => { e.preventDefault(); setDeskKey(v); setV(''); }}>
      <p className="small">{code === 'bad-password' && getDeskKey() ? <span className="down">{error} </span> : null}Type your desk password to open this panel. It stays in this browser.</p>
      <div className="hw-bar lock-bar"><input type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="Desk password" aria-label="Desk password" autoComplete="current-password" /><button className="btn primary" type="submit">Unlock</button></div>
    </form>
  );
}
const locked = (code?: string) => code === 'bad-password' || code === 'no-password-set';

/* ---------------- Webull ---------------- */
interface Acct { account: { id: string; count: number; type: string }; balance: WbBalance; positions: WbPosition[]; asOf: number; source: string; stale?: boolean }
interface Pnl { from: string; range: number; fills: WbFill[]; closed: WbClosed[]; unmatched: { sym: string; qty: number }[]; asOf: number; source: string; dayRows: WbDay[] }
interface Status { configured: boolean; host: string; tokenRequired: boolean | null; tokenSet: boolean; configError?: string }

function demoWebull(): { acct: Acct; pnl: Pnl } {
  const r = rng(42), syms = ['NVDA', 'AMD', 'MU', 'TSLA', 'META'];
  const positions: WbPosition[] = syms.slice(0, 4).map((s) => { const c = 50 + r() * 300, l = c * (0.92 + r() * 0.18), q = Math.round(5 + r() * 40); return { sym: s, qty: q, avgCost: c, last: l, value: l * q, unreal: (l - c) * q, unrealPct: (l / c - 1) * 100, option: false }; });
  const dayRows: WbDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const t = DEMO_AT - i * 86400_000, dow = new Date(t).getDay();
    if (dow === 0 || dow === 6 || r() < 0.35) continue;
    const pnl = (r() - 0.42) * 900, trades = 1 + Math.floor(r() * 4);
    dayRows.push({ day: new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), pnl, trades, wins: pnl > 0 ? trades : 0, losses: pnl > 0 ? 0 : trades, syms: [syms[Math.floor(r() * 5)]] });
  }
  return {
    acct: { account: { id: '…0000', count: 1, type: 'CASH' }, balance: { total: 25840, cash: 6120, buyingPower: 6120, dayPnl: 212, unreal: positions.reduce((a, p) => a + (p.unreal ?? 0), 0) }, positions, asOf: DEMO_AT, source: 'Sample data' },
    pnl: { from: '', range: 30, fills: [], closed: [], unmatched: [], asOf: DEMO_AT, source: 'Sample data', dayRows },
  };
}

function WebullSetup({ st, reload, loading }: { st: Status; reload: () => void; loading: boolean }) {
  // Setup progress lives in the browser store so closing and reopening the widget never restarts it.
  const [tok, setTok] = usePersisted<{ token?: string; status?: string; at?: number; checked?: number; fields?: string[] } | null>('wbTok', null);
  const [busy, setBusy] = useState<'' | 'create' | 'check'>('');
  const [err, setErr] = useState('');
  const create = async () => {
    setBusy('create'); setErr('');
    try { const { ok, j } = await privateFetch({ fn: 'webull', op: 'token-create' }); if (ok && j.token) setTok({ token: j.token, status: j.status ?? 'PENDING', at: Date.now() }); else setErr(j.error ?? 'Webull sent no token. Try again in a minute.'); }
    catch { setErr('Network error. Try again.'); }
    setBusy('');
  };
  const check = async () => {
    if (!tok?.token) return;
    setBusy('check'); setErr('');
    try { const { ok, j } = await privateFetch({ fn: 'webull', op: 'token-check', token: tok.token }); if (ok) setTok({ ...tok, status: j.status ?? undefined, checked: Date.now(), fields: j.fields }); else setErr(j.error ?? 'Webull could not check the token.'); }
    catch { setErr('Network error. Try again.'); }
    setBusy('');
  };
  // Webull's phone approval is its own rule and stays; the desk now checks for it by itself every 6 seconds (up to 6 minutes),
  // so after Create token the only step left is approving on the phone.
  const pending = !!tok?.token && tok.status === 'PENDING';
  const tokRef = useRef(tok); tokRef.current = tok;
  useEffect(() => {
    if (!pending) return;
    const since = Date.now();
    let stop = false;
    const id = setInterval(async () => {
      const cur = tokRef.current;
      if (stop || !cur?.token) return;
      if (Date.now() - since > 6 * 60_000) { clearInterval(id); return; }
      try {
        const { ok, j } = await privateFetch({ fn: 'webull', op: 'token-check', token: cur.token });
        if (!stop && ok) setTok({ ...cur, status: j.status ?? undefined, checked: Date.now(), fields: j.fields });
      } catch { /* try again on the next beat */ }
    }, 6000);
    return () => { stop = true; clearInterval(id); };
  }, [pending, tok?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(tok?.token ?? ''); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr('Copy failed: select the token and copy it by hand.'); } };
  const msg = tok?.token ? tokenMessage(tok.status) : null;
  const age = tok?.at ? Math.round((Date.now() - tok.at) / 60000) : 0;
  if (!st.configured) return (
    <div className="hw-pad small">
      <p><b>Connect Webull (read-only).</b> In Vercel → Settings → Environment Variables add:</p>
      <ol className="steps-ol"><li><code>WEBULL_APP_KEY</code> = the App Key from Webull’s Developer Console</li><li><code>WEBULL_APP_SECRET</code> = its App Secret</li><li>Redeploy</li></ol>
      <p className="muted">The desk only calls Webull’s read endpoints (accounts, balance, positions, order history). It has no code that places, changes or cancels orders.</p>
    </div>
  );
  return (
    <div className="hw-pad small">
      {st.configError && <p className="down">Webull answered: {st.configError}</p>}
      <p><b>Webull needs a one-time access token</b> because your account has 2-step security. This is Webull's own rule, so the phone approval can't be skipped, but it only happens once.</p>
      <ol className="steps-ol">
        <li><button className="btn" onClick={create} disabled={busy !== ''}>{busy === 'create' ? 'Creating…' : tok?.token ? 'Create a new token' : 'Create token'}</button> then approve the request on your phone within 5 minutes. The desk checks by itself{pending ? ' (checking now…)' : ''}.</li>
        <li>When it says <b>NORMAL</b>, <button className="btn" onClick={copy} disabled={tok?.status !== 'NORMAL'}>{copied ? 'Copied' : 'Copy token'}</button> and paste it into Vercel as <code>WEBULL_ACCESS_TOKEN</code>, then redeploy. It stays valid while used at least every 15 days.</li>
      </ol>
      {tok?.token && <p className="tok">Token: <code className="sel-all">{tok.token}</code> · status <b className={tok.status === 'NORMAL' ? 'up' : ''}>{tok.status ?? 'not checked'}</b>{age > 0 && <span className="muted"> · created {age} min ago</span>}</p>}
      {msg && <p className={msg.ok ? 'up' : 'muted'}>{msg.text}</p>}
      {tok?.checked && <p className="small muted">Last checked {new Date(tok.checked).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}: Webull answered {tok.status ?? 'with no status'}{!tok.status && tok.fields?.length ? ` (fields: ${tok.fields.join(', ')})` : ''}.</p>}
      {tok?.status === 'PENDING' && <p className="small muted">Still pending? Webull sends the approval to the phone number on the account, as a text message or an alert in the Webull app (Messages / notifications). It expires after 5 minutes, then press Create a new token and approve the newest request only.</p>}
      {err && <p className="down">{err}</p>}
      <div className="hw-bar">
        <button className="btn" disabled={loading} onClick={reload}>{loading ? 'Rechecking…' : 'Recheck setup'}</button>
        {st.tokenSet ? <span className="up small">WEBULL_ACCESS_TOKEN is set on the server. Redeploy if the account still does not load.</span> : <span className="muted small">Server has no access token yet.</span>}
        {tok?.token && tok.status !== 'NORMAL' && <button className="link small" onClick={check} disabled={busy !== ''}>{busy === 'check' ? 'Checking…' : 'Check now'}</button>}
        {tok && <button className="link small" onClick={() => { setTok(null); setErr(''); }}>Start over</button>}
      </div>
    </div>
  );
}

function PnlCalendar({ rows, days, onPick, pick }: { rows: WbDay[]; days: number; onPick: (d: string | null) => void; pick: string | null }) {
  const by = new Map(rows.map((r) => [r.day, r]));
  const end = new Date(), cells: { day: string; dow: number }[] = [];
  for (let i = days - 1; i >= 0; i--) { const t = new Date(end.getTime() - i * 86400_000); const day = t.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); if (dow > 0 && dow < 6) cells.push({ day, dow }); }
  const lead = cells.length ? cells[0].dow - 1 : 0;
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
  const tot = rows.reduce((a, r) => a + r.pnl, 0), win = rows.filter((r) => r.pnl > 0), loss = rows.filter((r) => r.pnl < 0);
  const gw = win.reduce((a, r) => a + r.pnl, 0), gl = -loss.reduce((a, r) => a + r.pnl, 0);
  return (
    <div className="pnl">
      <div className="pnl-sum">
        <span>Realized <b className={`num ${tone(tot)}`}>{sUsd(tot)}</b></span>
        <span>Green days <b className="num">{win.length}/{rows.length}</b></span>
        <span>Avg green <b className="num up">{win.length ? sUsd(gw / win.length) : '—'}</b></span>
        <span>Avg red <b className="num down">{loss.length ? sUsd(-gl / loss.length) : '—'}</b></span>
        <span title="gross profit ÷ gross loss">Profit factor <b className="num">{gl ? (gw / gl).toFixed(2) : '—'}</b></span>
      </div>
      <div className="pnl-grid">
        {['M', 'T', 'W', 'T', 'F'].map((d, i) => <span key={i} className="pnl-dow">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
        {cells.map((c) => {
          const r = by.get(c.day), a = r ? 0.18 + 0.6 * Math.min(1, Math.abs(r.pnl) / max) : 0;
          return (
            <button key={c.day} className={`pnl-cell ${r ? (r.pnl >= 0 ? 'g' : 'r') : ''} ${pick === c.day ? 'sel' : ''}`} style={r ? { ['--a' as string]: a } : undefined}
              onClick={() => onPick(pick === c.day ? null : c.day)} title={r ? `${c.day}: ${sUsd(r.pnl)} · ${r.trades} closed · ${r.syms.join(', ')}` : `${c.day}: no closed trades`}>
              <span className="pnl-d">{+c.day.slice(8)}</span>{r && <span className="pnl-v num">{Math.abs(r.pnl) >= 1000 ? `${(r.pnl / 1000).toFixed(1)}k` : Math.round(r.pnl)}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Resting orders with Cancel (needs the order PIN, typed here, never saved). */
function OpenOrders({ d }: { d: HomeData }) {
  const q = usePrivate<{ orders: WbOpenOrder[]; asOf: number }>({ fn: 'webull-orders', op: 'open' }, d.mode, 15_000);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const cancel = async (id: string) => {
    const { ok, j } = await privatePost({ fn: 'webull-order', op: 'cancel' }, { clientOrderId: id }, { 'x-order-pin': pin }).catch(() => ({ ok: false, j: { error: 'network error' } }));
    setPin(''); setPinFor(null); setMsg(ok ? 'Cancel sent. Webull confirms it in a few seconds.' : j.error ?? 'Cancel failed.'); q.reload();
  };
  if (q.error && !q.data) return <p className="hw-pad small down">{q.error}</p>;
  if (!q.data) return <p className="hw-pad small muted">Loading open orders…</p>;
  return (
    <div className="wb-tbl">
      {q.data.orders.map((o) => (
        <div key={o.id} className="wb-r wb-oo">
          <span className="wb-sym"><b>{o.sym}</b><span className="small">{o.side} {o.type.replace(/_/g, ' ').toLowerCase()}</span><span className="num muted small">×{o.qty ?? '?'}{o.filled ? ` (${o.filled} filled)` : ''}</span></span>
          <span className="num">{o.limit != null ? `L ${px(o.limit)}` : ''}{o.stop != null ? ` S ${px(o.stop)}` : ''}</span>
          <span className="small muted">{o.status.toLowerCase()}</span>
          {pinFor === o.id
            ? <span className="wb-ord"><input type="password" autoComplete="off" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-label="Order PIN" /><button className="link small down" disabled={!pin} onClick={() => cancel(o.id)}>Cancel order</button></span>
            : <button className="link small" onClick={() => { setPinFor(o.id); setPin(''); }}>Cancel…</button>}
        </div>
      ))}
      {!q.data.orders.length && <p className="small muted hw-pad">No open orders. (Only orders placed through the desk can be cancelled here.)</p>}
      {msg && <p className="small hw-pad">{msg}</p>}
    </div>
  );
}

export function WebullW({ d, cfg, set }: P) {
  const tab: 'pos' | 'pnl' | 'orders' = cfg.tab ?? 'pos';
  const { openOrder } = useDesk();
  const days: number = cfg.days ?? 30;
  const live = d.mode.kind === 'live';
  const st = usePrivate<Status>({ fn: 'webull', op: 'status' }, d.mode, 0);
  const ready = !!st.data?.configured && (st.data.tokenRequired === false || (st.data.tokenRequired === null && !st.data.configError) || st.data.tokenSet);
  const acct = usePrivate<Acct>(ready && tab === 'pos' ? { fn: 'webull', op: 'account' } : null, d.mode, 60_000);
  const pnlQ = usePrivate<Pnl>(ready && tab === 'pnl' ? { fn: 'webull', op: 'pnl', days: String(days) } : null, d.mode, 5 * 60_000);
  const [pick, setPick] = useState<string | null>(null);
  const demo = useMemo(() => (live ? null : demoWebull()), [live]);
  const a = demo?.acct ?? acct.data;
  const pnlRaw: Pnl | null = demo?.pnl ?? pnlQ.data;
  const dayRows: WbDay[] = pnlRaw?.dayRows ?? [];
  const closedPick: WbClosed[] = (pnlRaw?.closed ?? []).filter((c: WbClosed) => c.day === pick);

  const head = (
    <div className="hw-bar">
      <Seg value={tab} options={[{ id: 'pos', label: 'Positions' }, { id: 'orders', label: 'Orders' }, { id: 'pnl', label: 'P&L calendar' }]} onChange={(v) => set({ ...cfg, tab: v })} />
      {openOrder && <button className="hw-btn" onClick={() => openOrder({ sym: d.sel, side: 'BUY', type: 'LIMIT' }, Number.isFinite(d.quotes[d.sel]?.last) ? d.quotes[d.sel].last : null)} title="Opens the order ticket; nothing is sent until you preview, type your PIN and confirm">New order</button>}
      {tab === 'pnl' && <Seg value={String(days) as '30'} options={[{ id: '30', label: '30d' }, { id: '60', label: '60d' }, { id: '90', label: '90d' }] as { id: '30'; label: string }[]} onChange={(v) => set({ ...cfg, days: +v })} />}
      {demo ? <Fresh kind="demo" /> : <Fresh kind={(tab === 'pnl' ? pnlQ.data : acct.data) ? 'live' : 'nodata'} at={(tab === 'pnl' ? pnlQ.at : acct.at)} src="Webull OpenAPI" />}
    </div>
  );
  if (!demo) {
    if (locked(st.code)) return <div className="hw-col">{head}<DeskLock code={st.code} error={st.error} /></div>;
    if (st.error && !st.data) return <div className="hw-col">{head}<p className="hw-pad small down">{st.error}</p></div>;
    if (!st.data) return <div className="hw-col">{head}<p className="hw-pad small muted">{live ? 'Checking Webull…' : 'Webull loads on the live desk.'}</p></div>;
    if (!ready) return <div className="hw-col">{head}<WebullSetup st={st.data} reload={st.reload} loading={st.loading} /></div>;
  }
  const err = tab === 'pos' ? acct.error : tab === 'pnl' ? pnlQ.error : undefined;
  return (
    <div className="hw-col">
      {head}
      {err && <p className="hw-pad small down">Webull: {err}</p>}
      {tab === 'pos' && a && (
        <>
          <div className="wb-bal">
            <span>Account <b className="num">{a.balance.total != null ? `$${px(a.balance.total)}` : '—'}</b></span>
            <span>Cash <b className="num">{a.balance.cash != null ? `$${px(a.balance.cash)}` : '—'}</b></span>
            <span>Buying power <b className="num">{a.balance.buyingPower != null ? `$${px(a.balance.buyingPower)}` : '—'}</b></span>
            <span>Today <b className={`num ${tone(a.balance.dayPnl ?? 0)}`}>{a.balance.dayPnl != null ? sUsd(a.balance.dayPnl) : '—'}</b></span>
            <span>Open P&L <b className={`num ${tone(a.balance.unreal ?? 0)}`}>{a.balance.unreal != null ? sUsd(a.balance.unreal) : '—'}</b></span>
          </div>
          <div className="wb-tbl">
            <div className="wb-r wb-h"><span>Symbol × qty</span><span>Avg</span><span>Last</span><span>Open P&L</span></div>
            {a.positions.map((p) => (
              <div key={p.sym} className="wb-r" onClick={() => d.onChart(p.sym)} role="button" tabIndex={-1}>
                <span className="wb-sym"><Star sym={p.sym} /><b>{p.sym}</b><span className="num muted small">×{p.qty}</span>{p.option && <span className="tag">opt</span>}<CoName sym={p.sym} className="wb-name" /></span>
                <span className="num">{p.avgCost != null ? px(p.avgCost) : '—'}</span><span className="num">{p.last != null ? px(p.last) : '—'}</span>
                <span className={`num ${tone(p.unreal ?? 0)}`}>{p.unreal != null ? sUsd(p.unreal) : '—'}{p.unrealPct != null && <small> {pct(p.unrealPct, 1)}</small>}</span>
              </div>
            ))}
            {!a.positions.length && <p className="small muted hw-pad">No open positions.</p>}
          </div>
        </>
      )}
      {tab === 'orders' && (demo ? <p className="small muted hw-pad">Open orders load on the live desk.</p> : <OpenOrders d={d} />)}
      {tab === 'pnl' && pnlRaw && (
        <>
          <PnlCalendar rows={dayRows} days={days} pick={pick} onPick={setPick} />
          {pick && <div className="wb-tbl">{closedPick.length ? closedPick.map((c, i) => (
            <div key={i} className="wb-r wb-closed"><span className="wb-sym"><b>{c.sym}</b><span className="num muted small">×{c.qty}</span><span className="wb-name">{c.side} · {etTime(c.tOpen)}→{etTime(c.tClose)}</span></span><span className="num">{px(c.entry)}</span><span className="num">{px(c.exit)}</span><span className={`num ${tone(c.pnl)}`}>{sUsd(c.pnl)}</span></div>
          )) : <p className="small muted hw-pad">{demo ? 'Sample days have no trade list.' : 'No closed trades that day.'}</p>}</div>}
          {pnlRaw.unmatched.length > 0 && <p className="note hw-pad">Not counted: sells of shares bought before {pnlRaw.from} ({pnlRaw.unmatched.map((u) => `${u.sym} ×${u.qty}`).join(', ')}) — Webull’s history here doesn’t include their buy price. Pick a longer range to include them.</p>}
        </>
      )}
      <p className="note hw-pad">The desk never trades on its own: every order goes through the ticket (preview → your PIN → Confirm), within the caps set in Vercel. Realized P&L is matched first-in-first-out from Webull’s filled orders; fees aren’t included.</p>
    </div>
  );
}

/* ---------------- Discord ---------------- */
interface DcData { messages: DcMessage[]; watchlist: { sym: string; n: number; first: number }[]; today: string; channels: { id: string; key: string; name: string }[]; errors: Record<string, string>; hint?: string; asOf: number }

function demoDiscord(): DcData {
  const t = DEMO_AT;
  const m = (id: string, ch: DcMessage['ch'], dt: number, text: string, tickers: string[]): DcMessage => ({ id, ch, t: t - dt, author: 'desk-bot', bot: true, text, tickers, url: '' });
  const messages = [
    m('1', 'before', 3600_000, 'Morning watchlist (sample): $NVDA above 140 for continuation, $AMD gap fill, $MU earnings drift.', ['NVDA', 'AMD', 'MU']),
    m('2', 'resp', 5400_000, 'Rule check (sample): max 1R per trade, stop goes in before entry.', []),
    m('3', 'review', 86400_000, 'After close (sample): 2 trades, +1.4R. NVDA followed plan; AMD chased entry.', ['NVDA', 'AMD']),
  ];
  return { messages, watchlist: [{ sym: 'NVDA', n: 1, first: t }, { sym: 'AMD', n: 1, first: t }, { sym: 'MU', n: 1, first: t }], today: '', channels: [], errors: {}, asOf: t };
}

export function DiscordW({ d, cfg, set }: P) {
  const ch: 'all' | DcMessage['ch'] = cfg.ch ?? 'all';
  const live = d.mode.kind === 'live';
  const q = usePrivate<DcData>({ fn: 'discord' }, d.mode, 60_000);
  const demo = useMemo(() => (live ? null : demoDiscord()), [live]);
  const data = demo ?? q.data;
  const msgs = (data?.messages ?? []).filter((m) => ch === 'all' || m.ch === ch || (ch === 'tom' && m.tom));
  const head = (
    <div className="hw-bar">
      <Seg value={ch} options={[{ id: 'all', label: 'All' }, { id: 'before', label: 'Before', hint: '#read-before-trading' }, { id: 'resp', label: 'Rules', hint: '#trade-responsibility' }, { id: 'review', label: 'Review', hint: '#after-close-review' }, { id: 'tom', label: 'Tom', hint: 'Tom’s messages' }]} onChange={(v) => set({ ...cfg, ch: v })} />
      {demo ? <Fresh kind="demo" /> : <Fresh kind={q.data ? 'live' : 'nodata'} at={q.at} src="Discord API via your bot (read-only)" />}
    </div>
  );
  if (!demo && locked(q.code)) return <div className="hw-col">{head}<DeskLock code={q.code} error={q.error} /></div>;
  if (!demo && q.code === 'no-token') return <div className="hw-col">{head}<div className="hw-pad small"><p>Add <code>DISCORD_BOT_TOKEN</code> in Vercel (Discord Developer Portal → your bot → Bot → Reset Token), turn on <b>Message Content Intent</b> on that page, and make sure the bot can see the three channels. Then redeploy.</p></div></div>;
  return (
    <div className="hw-col">
      {head}
      {q.error && !demo && <p className="hw-pad small down">{q.error}</p>}
      {data?.hint && <p className="hw-pad small down">{data.hint}</p>}
      {data && Object.entries(data.errors).map(([k, v]) => <p key={k} className="hw-pad small down">#{k}: {v}</p>)}
      {data && (
        <div className="dc-wl">
          <span className="muted small">Bot’s list today</span>
          {data.watchlist.length ? data.watchlist.map((w) => <button key={w.sym} className="chip" onClick={() => d.onChart(w.sym)} title={`named ${w.n}× in #read-before-trading today`}>{w.sym}</button>) : <span className="small muted">no tickers posted in #read-before-trading today</span>}
        </div>
      )}
      <div className="dc-list">
        {msgs.map((m) => (
          <div key={m.id} className={`dc-m ch-${m.ch}`}>
            <div className="dc-mh"><b>{m.tom ? `Tom (${m.author})` : m.author}</b>{m.bot && <span className="tag">bot</span>}<span className="muted small">#{(data?.channels.find((c) => c.key === m.ch)?.name) ?? m.ch} · {new Date(m.t).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>{m.url && <a className="small" href={m.url} target="_blank" rel="noreferrer noopener">open</a>}</div>
            <div className="dc-t">{cleanDiscord(m.text)}</div>
            {m.tickers.length > 0 && <div className="dc-tk">{m.tickers.map((s) => <button key={s} className="chip" onClick={() => d.onChart(s)}>{s}</button>)}</div>}
          </div>
        ))}
        {data && !msgs.length && <p className="small muted hw-pad">No messages.</p>}
        {!data && !q.error && <p className="small muted hw-pad">{live ? 'Reading your channels…' : 'Discord loads on the live desk.'}</p>}
      </div>
    </div>
  );
}

/* ---------------- Congress trades ---------------- */
interface CgTrade { who: string; party: string; state: string; chamber: string; type: string; traded: string; filed: string; min: number | null; max: number | null; owner: string }
const range = (a: number | null, b: number | null) => { const k = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M` : `$${Math.round(v / 1000)}K`); return a == null ? '—' : b == null ? `${k(a)}+` : `${k(a)}–${k(b)}`; };
const congressCache = new Map<string, { trades: CgTrade[]; asOf: number }>();

export function CongressW({ d, cfg, set }: P) {
  const sym: string = (cfg.sym ?? d.sel ?? 'NVDA').toUpperCase();
  const [draft, setDraft] = useState(sym);
  const [st, setSt] = useState<{ trades: CgTrade[]; asOf?: number; error?: string; loading?: boolean }>({ trades: [] });
  const live = d.mode.kind === 'live';
  useEffect(() => setDraft(sym), [sym]);
  useEffect(() => {
    if (!live) {
      const r = rng(sym.length * 13);
      setSt({ trades: Array.from({ length: 6 }, (_, i) => ({ who: `Member ${String.fromCharCode(65 + i)} (sample)`, party: r() < 0.5 ? 'D' : 'R', state: 'XX', chamber: r() < 0.6 ? 'HOUSE' : 'SENATE', type: r() < 0.6 ? 'BUY' : 'SELL', traded: new Date(DEMO_AT - i * 9 * 86400_000).toISOString().slice(0, 10), filed: '', min: 1001, max: 15000, owner: 'SELF' })), asOf: DEMO_AT });
      return;
    }
    const hit = congressCache.get(sym);
    if (hit) { setSt(hit); return; }
    let stop = false;
    setSt({ trades: [], loading: true });
    fetch(`/api/research?fn=congress&symbol=${encodeURIComponent(sym)}`).then(async (r) => {
      const j = await r.json(); if (stop) return;
      if (r.ok) { congressCache.set(sym, { trades: j.trades, asOf: j.asOf }); setSt({ trades: j.trades, asOf: j.asOf }); } else setSt({ trades: [], error: j.error });
    }).catch((e) => !stop && setSt({ trades: [], error: String(e) }));
    return () => { stop = true; };
  }, [sym, live]);
  const recent = st.trades.filter((t) => Date.parse(t.traded) > Date.now() - 90 * 86400_000);
  const buys = recent.filter((t) => /BUY|PURCHASE/i.test(t.type)).length, sells = recent.filter((t) => /SELL|SALE/i.test(t.type)).length;
  return (
    <div className="hw-col">
      <form className="hw-bar" onSubmit={(e) => { e.preventDefault(); set({ ...cfg, sym: draft.trim().toUpperCase() }); }}>
        <input className="cg-in" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" />
        <button className="btn" type="submit">Look up</button>
        <SymInfo sym={sym} className="small">what is {sym}?</SymInfo>
        {live ? <Fresh kind={st.trades.length ? 'delayed' : 'nodata'} at={st.asOf} src="Alpha Vantage CONGRESS_TRADES: STOCK Act filings (House Clerk + Senate eFD). Filed up to 45 days after the trade." /> : <Fresh kind="demo" />}
      </form>
      <div className="cg-sum small">Last 90 days: <b className="up">{buys} buys</b> · <b className="down">{sells} sells</b> <span className="muted">by members of Congress or their families</span></div>
      {st.error && <p className="hw-pad small down">{st.error}</p>}
      {st.loading && <p className="hw-pad small muted">Loading disclosures…</p>}
      <div className="wb-tbl">
        {st.trades.slice(0, 80).map((t, i) => (
          <div key={i} className="cg-r">
            <span className="num small muted">{t.traded}</span>
            <span className="cg-who"><b>{t.who}</b> <span className={`tag p-${t.party}`}>{t.party}-{t.state}</span>{t.owner && t.owner !== 'SELF' && <span className="muted small"> · {t.owner.toLowerCase()}</span>}</span>
            <span className={/BUY|PURCHASE/i.test(t.type) ? 'up' : 'down'}>{/BUY|PURCHASE/i.test(t.type) ? 'BUY' : 'SELL'}</span>
            <span className="num small">{range(t.min, t.max)}{t.filed && daysLate(t.traded, t.filed) > 0 && <span className="tag cg-late" title={`Traded ${t.traded}, disclosed ${t.filed}: ${daysLate(t.traded, t.filed)} days past the STOCK Act's 45-day deadline`}>LATE {daysLate(t.traded, t.filed)}d</span>}</span>
          </div>
        ))}
        {!st.loading && !st.error && !st.trades.length && <p className="hw-pad small muted">No disclosed congressional trades in {sym}.</p>}
      </div>
      <p className="note hw-pad">Amounts are the ranges members must report, not exact sizes. Trades show up when filed, often weeks later, so treat this as background, not a signal to chase. Each ticker uses one of the desk’s 25 free Alpha Vantage calls a day (cached 12 h).</p>
    </div>
  );
}
