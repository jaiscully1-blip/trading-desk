// Order drafts for the "I approve every order" Webull ticket. Pure functions, shared by the browser (to show problems
// as you type) and the server (which re-checks everything; the browser's check is only a convenience).
// Scope on purpose: US stocks/ETFs only, BUY or SELL (no SHORT), limit and stop orders (market only if switched on),
// optional bracket (take-profit + stop-loss) on a BUY. Every order needs a preview, then your PIN, then Confirm.

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT' | 'MARKET';
export interface OrderDraft {
  sym: string; side: OrderSide; type: OrderType; qty: number;
  limit?: number | null; stop?: number | null;
  tif: 'DAY' | 'GTC'; session: 'CORE' | 'ALL';
  /** bracket legs, BUY only: sell limit at takeProfit, sell stop at stopLoss */
  takeProfit?: number | null; stopLoss?: number | null;
}
export interface OrderCaps { maxUsd: number; maxQty: number; allowMarket: boolean }
export const DEFAULT_CAPS: OrderCaps = { maxUsd: 1000, maxQty: 2000, allowMarket: false };

const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const pos = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;
/** 2 decimals at $1 and up, 4 below (US tick sizes) */
export const tick = (p: number) => (p >= 1 ? Math.round(p * 100) / 100 : Math.round(p * 10000) / 10000);

/** Price used for the dollar cap: the limit, else the stop, else the reference (last) price. */
export const refPrice = (d: OrderDraft, last?: number | null) => d.limit ?? d.stop ?? last ?? null;
export const notional = (d: OrderDraft, last?: number | null) => { const p = refPrice(d, last); return p == null ? null : p * d.qty; };

/**
 * Every problem with a draft, in plain words (empty = OK to preview).
 * heldQty = shares you hold now (SELL can never exceed it, so a sell can't open a short). last = current price if known.
 */
export function orderProblems(d: OrderDraft, caps: OrderCaps, heldQty: number | null, last?: number | null): string[] {
  const out: string[] = [];
  if (!SYM.test(d.sym ?? '')) out.push('Ticker looks wrong.');
  if (d.side !== 'BUY' && d.side !== 'SELL') out.push('Side must be Buy or Sell (no shorting from the desk).');
  if (!['LIMIT', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'MARKET'].includes(d.type)) out.push('Unknown order type.');
  if (d.type === 'MARKET' && !caps.allowMarket) out.push('Market orders are switched off; use a limit order.');
  if (!Number.isInteger(d.qty) || d.qty <= 0) out.push('Shares must be a whole number above 0.');
  else if (d.qty > caps.maxQty) out.push(`More than the ${caps.maxQty.toLocaleString()}-share cap.`);
  if ((d.type === 'LIMIT' || d.type === 'STOP_LOSS_LIMIT') && !pos(d.limit)) out.push('Needs a limit price.');
  if ((d.type === 'STOP_LOSS' || d.type === 'STOP_LOSS_LIMIT') && !pos(d.stop)) out.push('Needs a stop price.');
  if (d.type === 'STOP_LOSS_LIMIT' && pos(d.limit) && pos(d.stop) && (d.side === 'SELL' ? d.limit > d.stop : d.limit < d.stop)) out.push(d.side === 'SELL' ? 'For a sell stop-limit, the limit should be at or below the stop.' : 'For a buy stop-limit, the limit should be at or above the stop.');
  if (d.session === 'ALL' && d.type !== 'LIMIT') out.push('Extended hours only allow limit orders.');
  if (d.tif !== 'DAY' && d.tif !== 'GTC') out.push('Time in force must be Day or GTC.');
  const n = notional(d, last);
  if (n == null) out.push('No price to check the dollar cap against.');
  else if (n > caps.maxUsd) out.push(`About $${Math.round(n).toLocaleString()}, over your $${caps.maxUsd.toLocaleString()} per-order cap.`);
  if (d.side === 'SELL') {
    if (heldQty == null) out.push('Could not confirm how many shares you hold, so the sell is blocked.');
    else if (d.qty > heldQty) out.push(`You hold ${heldQty} shares; selling ${d.qty} would open a short.`);
  }
  const bracket = d.takeProfit != null || d.stopLoss != null;
  if (bracket) {
    if (d.side !== 'BUY') out.push('Take-profit / stop-loss legs are only for buy orders.');
    if (d.type !== 'LIMIT') out.push('Brackets need a limit entry.');
    if (d.takeProfit != null && (!pos(d.takeProfit) || (pos(d.limit) && d.takeProfit <= d.limit))) out.push('Take-profit must be above the entry.');
    if (d.stopLoss != null && (!pos(d.stopLoss) || (pos(d.limit) && d.stopLoss >= d.limit))) out.push('Stop-loss must be below the entry.');
  }
  return out;
}

/** Stable text of a draft: what the PIN confirmation is tied to, so the order can't change between preview and send. */
export function canonical(d: OrderDraft): string {
  const f = (x: number | null | undefined) => (x == null ? '' : String(tick(x)));
  return [d.sym, d.side, d.type, d.qty, f(d.limit), f(d.stop), d.tif, d.session, f(d.takeProfit), f(d.stopLoss)].join('|');
}

const str = (x: number) => String(tick(x));
/** Webull OpenAPI v3 order body (preview and place share it). ids: one per leg, ≤32 chars, unique per account. */
export function webullBody(d: OrderDraft, accountId: string, ids: { combo: string; legs: string[] }): { account_id: string; client_combo_order_id?: string; new_orders: Record<string, string>[] } {
  const base = { symbol: d.sym, instrument_type: 'EQUITY', market: 'US', time_in_force: d.tif, support_trading_session: d.session, entrust_type: 'QTY', quantity: String(d.qty) };
  const main: Record<string, string> = { client_order_id: ids.legs[0], ...base, side: d.side, order_type: d.type };
  if (d.limit != null && d.type !== 'STOP_LOSS' && d.type !== 'MARKET') main.limit_price = str(d.limit);
  if (d.stop != null && (d.type === 'STOP_LOSS' || d.type === 'STOP_LOSS_LIMIT')) main.stop_price = str(d.stop);
  const bracket = d.side === 'BUY' && (d.takeProfit != null || d.stopLoss != null);
  if (!bracket) return { account_id: accountId, new_orders: [{ ...main, combo_type: 'NORMAL' }] };
  const legs: Record<string, string>[] = [{ ...main, combo_type: 'MASTER' }];
  let i = 1;
  if (d.takeProfit != null) legs.push({ client_order_id: ids.legs[i++], ...base, combo_type: 'STOP_PROFIT', side: 'SELL', order_type: 'LIMIT', limit_price: str(d.takeProfit) });
  if (d.stopLoss != null) legs.push({ client_order_id: ids.legs[i++], ...base, combo_type: 'STOP_LOSS', side: 'SELL', order_type: 'STOP_LOSS', stop_price: str(d.stopLoss) });
  return { account_id: accountId, client_combo_order_id: ids.combo, new_orders: legs };
}

/** Plain-English one-liner for the confirm screen and the audit log. */
export function describe(d: OrderDraft): string {
  const px = d.type === 'MARKET' ? 'at market' : d.type === 'LIMIT' ? `limit $${tick(d.limit!)}` : d.type === 'STOP_LOSS' ? `stop $${tick(d.stop!)}` : `stop $${tick(d.stop!)} / limit $${tick(d.limit!)}`;
  const legs = [d.takeProfit != null ? `take-profit $${tick(d.takeProfit)}` : '', d.stopLoss != null ? `stop-loss $${tick(d.stopLoss)}` : ''].filter(Boolean).join(', ');
  return `${d.side === 'BUY' ? 'Buy' : 'Sell'} ${d.qty} ${d.sym} ${px}, ${d.tif === 'DAY' ? 'day' : 'good till cancelled'}${d.session === 'ALL' ? ', extended hours' : ''}${legs ? `, with ${legs}` : ''}`;
}

/** Draft from loose input (request JSON or form state). Numbers that aren't numbers become null. */
export function parseDraft(x: any): OrderDraft {
  const n = (v: unknown) => { const k = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(k) ? k : null; };
  return {
    sym: String(x?.sym ?? '').trim().toUpperCase(), side: x?.side === 'SELL' ? 'SELL' : x?.side === 'BUY' ? 'BUY' : (String(x?.side) as OrderSide),
    type: String(x?.type ?? 'LIMIT') as OrderType, qty: n(x?.qty) ?? 0, limit: n(x?.limit), stop: n(x?.stop),
    tif: x?.tif === 'GTC' ? 'GTC' : 'DAY', session: x?.session === 'ALL' ? 'ALL' : 'CORE', takeProfit: n(x?.takeProfit), stopLoss: n(x?.stopLoss),
  };
}
