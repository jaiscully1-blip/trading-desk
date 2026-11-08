// The ONLY place the desk can send, cancel or look up Webull orders (build rule R6 enforces this).
// Every order is a human decision: the browser shows a preview, Jai types his order PIN and presses Confirm.
// Server-side gates, all required, checked on every call:
//   1. desk password (x-desk-key)            -> api/_lib/private.ts
//   2. WEBULL_ORDERS=on in Vercel           -> kill switch; anything else = orders off
//   3. order PIN (x-order-pin) = WEBULL_ORDER_PIN, compared in constant time
//   4. the order matches the preview it was confirmed from (HMAC over the order text, valid 3 minutes)
//   5. limits: stocks/ETFs only, no shorting (a sell can't exceed shares held), per-order $ and share caps,
//      daily order count, limit/stop orders (market only with WEBULL_ALLOW_MARKET=on)
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_CAPS, canonical, describe, orderProblems, webullBody, type OrderCaps, type OrderDraft } from '../../../shared/orders.js';
import { wbCall } from '../webull.js';

export function caps(): OrderCaps {
  const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : d; };
  return { maxUsd: n(process.env.WEBULL_MAX_ORDER_USD, DEFAULT_CAPS.maxUsd), maxQty: n(process.env.WEBULL_MAX_ORDER_QTY, DEFAULT_CAPS.maxQty), allowMarket: process.env.WEBULL_ALLOW_MARKET === 'on' };
}
export const ordersOn = () => process.env.WEBULL_ORDERS === 'on' && !!process.env.WEBULL_ORDER_PIN;
export const maxPerDay = () => { const x = Number(process.env.WEBULL_MAX_ORDERS_DAY); return Number.isFinite(x) && x > 0 ? x : 10; };

const digest = (s: string) => createHash('sha256').update(s).digest();
export function pinOk(got: string | null): boolean {
  const want = process.env.WEBULL_ORDER_PIN ?? '';
  return !!want && !!got && timingSafeEqual(digest(got), digest(want));
}

/** Confirmation ticket tying a preview to the exact order text; expires after 3 minutes. */
const ticketKey = () => `${process.env.WEBULL_APP_SECRET ?? ''}|${process.env.WEBULL_ORDER_PIN ?? ''}|confirm`;
export function makeTicket(d: OrderDraft, now = Date.now()): string {
  const exp = now + 3 * 60_000;
  return `${exp}.${createHmac('sha256', ticketKey()).update(`${exp}|${canonical(d)}`).digest('base64url')}`;
}
export function ticketOk(d: OrderDraft, t: string | null, now = Date.now()): boolean {
  const [exp, mac] = String(t ?? '').split('.');
  if (!exp || !mac || Number(exp) < now) return false;
  const want = createHmac('sha256', ticketKey()).update(`${exp}|${canonical(d)}`).digest('base64url');
  return want.length === mac.length && timingSafeEqual(Buffer.from(want), Buffer.from(mac));
}

/** client_order_id: Webull allows 32 characters, unique per account. */
const newId = () => `td${Date.now().toString(36)}${randomBytes(8).toString('hex')}`.slice(0, 32);

/** Orders sent today by this server instance (Vercel may run more than one, so treat it as a soft cap). */
const sent: { day: string; n: number } = { day: '', n: 0 };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
export function underDailyCap(): boolean { if (sent.day !== today()) { sent.day = today(); sent.n = 0; } return sent.n < maxPerDay(); }

/** One JSON line per order action in the Vercel function logs: the audit trail. */
export function audit(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ audit: 'webull-order', event, t: new Date().toISOString(), ...data }));
}

export { orderProblems, describe };

export async function preview(accountId: string, d: OrderDraft) {
  const ids = { combo: newId(), legs: [newId(), newId(), newId()] };
  return wbCall('POST', '/trading/orders/preview', {}, webullBody(d, accountId, ids));
}
export async function place(accountId: string, d: OrderDraft): Promise<{ raw: any; clientOrderIds: string[]; comboId?: string }> {
  const ids = { combo: newId(), legs: [newId(), newId(), newId()] };
  const body = webullBody(d, accountId, ids);
  const raw = await wbCall('POST', '/trading/orders/place', {}, body, undefined, { category: 'US_EQUITY' });
  sent.n++;
  return { raw, clientOrderIds: body.new_orders.map((o) => o.client_order_id), comboId: (body as { client_combo_order_id?: string }).client_combo_order_id };
}
export const cancel = (accountId: string, clientOrderId: string) => wbCall('POST', '/trading/orders/cancel', {}, { account_id: accountId, client_order_id: clientOrderId });
export const openOrders = (accountId: string) => wbCall('GET', '/trading/orders/open-orders/list', { account_id: accountId });
export const orderDetail = (accountId: string, clientOrderId: string) => wbCall('GET', '/trading/orders/get', { account_id: accountId, client_order_id: clientOrderId });
