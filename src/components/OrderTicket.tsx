// Webull order ticket: you fill it in (or it comes prefilled from a setup), press Preview, read what Webull says,
// type your order PIN and press Confirm. Nothing is sent without all three. The PIN is never saved.
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CAPS, describe, orderProblems, parseDraft, type OrderCaps, type OrderDraft } from '../../shared/orders';
import { privateFetch, privatePost } from '../data/private';
import { sharesForRisk } from '../../shared/risk';
import { usePersisted } from '../lib/store';

interface Limits { ordersOn: boolean; pinSet: boolean; keys: boolean; caps: OrderCaps; maxPerDay: number }
type Form = Record<'sym' | 'qty' | 'limit' | 'stop' | 'takeProfit' | 'stopLoss', string> & Pick<OrderDraft, 'side' | 'type' | 'tif' | 'session'>;
const s = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '' : String(x));

/** flat "key: value" lines from Webull's preview answer (whatever it is named), money-looking fields first */
function previewLines(raw: any): [string, string][] {
  const out: [string, string][] = [];
  const walk = (o: any, pre: string) => {
    if (out.length > 24 || o == null) return;
    if (Array.isArray(o)) { o.slice(0, 3).forEach((x, i) => walk(x, o.length > 1 ? `${pre}${i + 1}.` : pre)); return; }
    if (typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, `${pre}${k} `); return; }
    out.push([pre.trim().replace(/_/g, ' '), String(o)]);
  };
  walk(raw, '');
  return out.sort((a, b) => Number(/amount|cost|fee|commission|total/i.test(b[0])) - Number(/amount|cost|fee|commission|total/i.test(a[0])));
}

export function OrderTicket({ initial, last, live, onClose, onPlaced }: { initial: Partial<OrderDraft>; last?: number | null; live: boolean; onClose: () => void; onPlaced?: (text: string) => void }) {
  const [f, setF] = useState<Form>({ sym: initial.sym ?? '', side: initial.side ?? 'BUY', type: initial.type ?? 'LIMIT', qty: s(initial.qty), limit: s(initial.limit), stop: s(initial.stop), tif: initial.tif ?? 'DAY', session: initial.session ?? 'CORE', takeProfit: s(initial.takeProfit), stopLoss: s(initial.stopLoss) });
  const [lim, setLim] = useState<Limits | null>(null);
  const [limErr, setLimErr] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm' | 'done'>('edit');
  const [pv, setPv] = useState<{ text: string; preview: any; ticket: string } | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [riskUsd, setRiskUsd] = usePersisted<string>('ticketRiskUsd', '');

  useEffect(() => { if (!live) return; privateFetch({ fn: 'webull-orders', op: 'limits' }).then(({ ok, j }) => (ok ? setLim(j) : setLimErr(j.error ?? 'Could not reach the desk.'))).catch(() => setLimErr('Could not reach the desk.')); }, [live]);
  const draft = useMemo(() => parseDraft(f), [f]);
  useEffect(() => {
    if (!live || draft.side !== 'SELL' || !draft.sym) { setHeld(null); return; }
    privateFetch({ fn: 'webull', op: 'account' }).then(({ ok, j }) => setHeld(ok ? (j.positions ?? []).filter((p: any) => p.sym === draft.sym && !p.option).reduce((a: number, p: any) => a + p.qty, 0) : null)).catch(() => setHeld(null));
  }, [live, draft.side, draft.sym]);
  const problems = orderProblems(draft, lim?.caps ?? DEFAULT_CAPS, draft.side === 'SELL' ? held : 0, last);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => { setF((x) => ({ ...x, [k]: e.target.value })); setStep('edit'); setPv(null); setMsg(null); };
  const needLimit = draft.type === 'LIMIT' || draft.type === 'STOP_LOSS_LIMIT', needStop = draft.type === 'STOP_LOSS' || draft.type === 'STOP_LOSS_LIMIT';

  const doPreview = async () => {
    setBusy(true); setMsg(null);
    const { ok, j } = await privatePost({ fn: 'webull-order', op: 'preview' }, { order: draft, last }).catch(() => ({ ok: false, j: { error: 'network error' } }));
    setBusy(false);
    if (ok) { setPv(j); setStep('confirm'); } else setMsg({ ok: false, text: j.error ?? 'Preview failed.' });
  };
  const doPlace = async () => {
    if (!pv) return;
    setBusy(true); setMsg(null);
    const { ok, j } = await privatePost({ fn: 'webull-order', op: 'place' }, { order: draft, ticket: pv.ticket, last }, { 'x-order-pin': pin }).catch(() => ({ ok: false, j: { error: 'network error' } }));
    setBusy(false); setPin('');
    if (ok) { setStep('done'); setMsg({ ok: true, text: `Sent to Webull: ${j.text}. Order id ${j.clientOrderIds?.[0] ?? ''}. Check its status in the Webull widget → Orders or in the Webull app.` }); onPlaced?.(j.text); }
    else { setMsg({ ok: false, text: j.error ?? 'Not sent.' }); if (j.code === 'stale-preview') { setStep('edit'); setPv(null); } }
  };

  const off = live && lim && (!lim.ordersOn || !lim.keys);
  return (
    <div className="overlay co-modal" role="dialog" aria-label="Webull order ticket" onClick={onClose}>
      <div className="ot" onClick={(e) => e.stopPropagation()}>
        <div className="ot-h"><b>Webull order</b><span className="small muted">you approve every order · real money</span><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        {!live && <p className="small warn-txt">Orders only work on the live desk. This is sample mode.</p>}
        {limErr && <p className="small down">{limErr}</p>}
        {off && (
          <div className="ot-off small">
            <p><b>Orders are switched off.</b> To turn them on, add these in Vercel → Settings → Environment Variables, then redeploy:</p>
            <ul>
              {!lim!.keys && <li><code>WEBULL_APP_KEY</code> and <code>WEBULL_APP_SECRET</code></li>}
              <li><code>WEBULL_ORDERS</code> = <code>on</code> (the kill switch: delete it or set <code>off</code> to stop all orders)</li>
              {!lim!.pinSet && <li><code>WEBULL_ORDER_PIN</code> = a code only you know, typed on every order</li>}
              <li>Optional caps: <code>WEBULL_MAX_ORDER_USD</code> (default $1,000), <code>WEBULL_MAX_ORDER_QTY</code>, <code>WEBULL_MAX_ORDERS_DAY</code> (default 10)</li>
            </ul>
          </div>
        )}
        <div className="ot-grid">
          <label>Ticker<input value={f.sym} onChange={(e) => set('sym')({ target: { value: e.target.value.toUpperCase() } })} placeholder="NVDA" /></label>
          <label>Side<select value={f.side} onChange={set('side')}><option value="BUY">Buy</option><option value="SELL">Sell (shares you hold)</option></select></label>
          <label>Type<select value={f.type} onChange={set('type')}><option value="LIMIT">Limit</option><option value="STOP_LOSS">Stop</option><option value="STOP_LOSS_LIMIT">Stop limit</option>{lim?.caps.allowMarket && <option value="MARKET">Market</option>}</select></label>
          <label>Shares<input inputMode="numeric" value={f.qty} onChange={set('qty')} /></label>
          {needLimit && <label>Limit $<input inputMode="decimal" value={f.limit} onChange={set('limit')} /></label>}
          {needStop && <label>Stop $<input inputMode="decimal" value={f.stop} onChange={set('stop')} /></label>}
          <label>Good for<select value={f.tif} onChange={set('tif')}><option value="DAY">Day</option><option value="GTC">Until cancelled</option></select></label>
          <label>Hours<select value={f.session} onChange={set('session')}><option value="CORE">Regular 9:30–4</option><option value="ALL">Incl. pre/after (limit only)</option></select></label>
          {f.side === 'BUY' && f.type === 'LIMIT' && <>
            <label>Take-profit $<input inputMode="decimal" value={f.takeProfit} onChange={set('takeProfit')} placeholder="optional" /></label>
            <label>Stop-loss $<input inputMode="decimal" value={f.stopLoss} onChange={set('stopLoss')} placeholder="optional" /></label>
          </>}
        </div>
        {f.side === 'BUY' && (() => {
          // size by dollar risk: shares = risk ÷ (entry − stop). It only fills the Shares box; Preview, PIN and Confirm still apply.
          const entry = draft.type === 'LIMIT' || draft.type === 'STOP_LOSS_LIMIT' ? draft.limit ?? last ?? null : draft.type === 'STOP_LOSS' ? draft.stop ?? null : last ?? null;
          const stopPx = draft.stopLoss ?? null;
          const caps = lim?.caps ?? DEFAULT_CAPS;
          const z = entry != null && stopPx != null && stopPx < entry ? sharesForRisk(+riskUsd, entry, stopPx, caps.maxUsd, caps.maxQty) : null;
          return (
            <div className="ot-risk small">
              <label>Risk $<input inputMode="decimal" value={riskUsd} onChange={(e) => setRiskUsd(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 50" /></label>
              {!riskUsd ? <span className="muted">Type how many dollars you're willing to lose if the stop-loss hits; it works out the shares.</span>
                : stopPx == null ? <span className="muted">Set a Stop-loss $ (limit buy) to size by risk.</span>
                : stopPx >= (entry ?? 0) ? <span className="down">The stop-loss must be below the entry.</span>
                : z && z.shares > 0 ? <>
                  <span><b className="num">{z.shares}</b> shares · ${z.perShare.toFixed(2)}/share at risk · loses <b className="num">${z.risk.toFixed(0)}</b> at the stop · costs ${z.cost.toFixed(0)}{z.cappedBy ? <span className="warn-txt"> · cut to fit the {z.cappedBy}</span> : null}</span>
                  <button className="link" onClick={() => set('qty')({ target: { value: String(z.shares) } })}>Use {z.shares}</button>
                </> : <span className="muted">Risk is smaller than one share's distance to the stop.</span>}
            </div>
          );
        })()}
        <p className="ot-sum">{draft.sym && draft.qty > 0 ? describe(draft) : 'Fill in the order.'}{last ? <span className="small muted"> · last ${last.toFixed(2)}</span> : null}</p>
        {problems.length > 0 && <ul className="ot-prob">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        {step === 'edit' && <button className="btn" disabled={!live || busy || problems.length > 0 || !!off} onClick={doPreview}>{busy ? 'Previewing…' : 'Preview with Webull'}</button>}
        {step === 'confirm' && pv && (
          <div className="ot-conf">
            <p><b>{pv.text}</b></p>
            <dl className="ot-pv">{previewLines(pv.preview).slice(0, 12).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
            <label className="ot-pin">Order PIN<input type="password" autoComplete="off" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></label>
            <div className="ot-btns">
              <button className={`btn ${draft.side === 'BUY' ? 'ot-buy' : 'ot-sell'}`} disabled={busy || !pin} onClick={doPlace}>{busy ? 'Sending…' : `Confirm ${draft.side === 'BUY' ? 'buy' : 'sell'}`}</button>
              <button className="link" onClick={() => { setStep('edit'); setPv(null); }}>Edit</button>
            </div>
            <p className="note">The preview is good for 3 minutes. Changing anything means previewing again.</p>
          </div>
        )}
        {msg && <p className={`small ${msg.ok ? 'up' : 'down'}`}>{msg.text}</p>}
        {lim && <p className="note">Limits on the server: ${lim.caps.maxUsd.toLocaleString()} per order, {lim.caps.maxQty.toLocaleString()} shares, {lim.maxPerDay} orders a day, stocks and ETFs only, no shorting{lim.caps.allowMarket ? '' : ', no market orders'}.</p>}
      </div>
    </div>
  );
}
