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

/** Confirmation ticket tying a preview to the exact order text; expires after 3 minutes and works once. */
const ticketKey = () => `${process.env.WEBULL_APP_SECRET ?? ''}|${process.env.WEBULL_ORDER_PIN ?? ''}|confirm`;
const macOf = (exp: string, nonce: string, d: OrderDraft) => createHmac('sha256', ticketKey()).update(`${exp}|${nonce}|${canonical(d)}`).digest('base64url');
export function makeTicket(d: OrderDraft, now = Date.now()): string {
  const exp = String(now + 3 * 60_000), nonce = randomBytes(8).toString('hex');
  return `${exp}.${nonce}.${macOf(exp, nonce, d)}`;
}
export function ticketOk(d: OrderDraft, t: string | null, now = Date.now()): boolean {
  const [exp, nonce, mac] = String(t ?? '').split('.');
  if (!exp || !nonce || !mac || Number(exp) < now) return false;
  const want = macOf(exp, nonce, d);
  return want.length === mac.length && timingSafeEqual(Buffer.from(want), Buffer.from(mac));
}
/** A ticket can place one order. Remembered in memory (per server instance); the order ids below cover other instances. */
const used = new Map<string, number>();
export function claimTicket(t: string, now = Date.now()): boolean {
  for (const [k, exp] of used) if (exp < now) used.delete(k);
  if (used.has(t)) return false;
  used.set(t, now + 10 * 60_000);
  return true;
}
/** Order ids come from the ticket, so the same confirmation sent twice (double-click, retry, another instance) is the same
 *  order to Webull, which rejects a repeated client_order_id. */
export function idsFromTicket(t: string): { combo: string; legs: string[] } {
  const h = createHash('sha256').update(`ids|${t}`).digest('hex');
  return { combo: `tc${h.slice(0, 30)}`, legs: [0, 1, 2].map((i) => `t${i}${h.slice(2 + i * 10, 2 + i * 10 + 20)}`) };
}

/** Wrong order PINs: 5 misses in 15 minutes locks the order PIN for 15 minutes (per server instance). */
const pinMiss: { n: number; first: number; lockedUntil: number } = { n: 0, first: 0, lockedUntil: 0 };
export function checkPin(got: string | null, now = Date.now()): 'ok' | 'bad' | 'locked' {
  if (now < pinMiss.lockedUntil) return 'locked';
  if (pinOk(got)) { pinMiss.n = 0; return 'ok'; }
  if (now - pinMiss.first > 15 * 60_000) { pinMiss.n = 0; pinMiss.first = now; }
  if (++pinMiss.n >= 5) { pinMiss.lockedUntil = now + 15 * 60_000; pinMiss.n = 0; }
  return 'bad';
}

/** client_order_id for previews: Webull allows 32 characters, unique per account. */
const newId = () => `td${Date.now().toString(36)}${randomBytes(8).toString('hex')}`.slice(0, 32);

/** Orders sent today by this server instance (Vercel may run more than one, so treat it as a soft cap). */
const sent: { day: string; n: number } = { day: '', n: 0 };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
/** Counts the order before it is sent (so two at once can't both slip under the cap). Not given back if the send fails: a timeout may still have placed it. */
export function reserveDaily(): boolean { if (sent.day !== today()) { sent.day = today(); sent.n = 0; } if (sent.n >= maxPerDay()) return false; sent.n++; return true; }

/** One JSON line per order action in the Vercel function logs: the audit trail. */
export function audit(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ audit: 'webull-order', event, t: new Date().toISOString(), ...data }));
}

export { orderProblems, describe };

export async function preview(accountId: string, d: OrderDraft) {
  const ids = { combo: newId(), legs: [newId(), newId(), newId()] };
  return wbCall('POST', '/trading/orders/preview', {}, webullBody(d, accountId, ids));
}
export async function place(accountId: string, d: OrderDraft, ticket: string): Promise<{ raw: any; clientOrderIds: string[]; comboId?: string }> {
  const body = webullBody(d, accountId, idsFromTicket(ticket));
  const raw = await wbCall('POST', '/trading/orders/place', {}, body, undefined, { category: 'US_EQUITY' });
  return { raw, clientOrderIds: body.new_orders.map((o) => o.client_order_id), comboId: (body as { client_combo_order_id?: string }).client_combo_order_id };
}
export const cancel = (accountId: string, clientOrderId: string) => wbCall('POST', '/trading/orders/cancel', {}, { account_id: accountId, client_order_id: clientOrderId });
export const openOrders = (accountId: string) => wbCall('GET', '/trading/orders/open-orders/list', { account_id: accountId });
export const orderDetail = (accountId: string, clientOrderId: string) => wbCall('GET', '/trading/orders/get', { account_id: accountId, client_order_id: clientOrderId });
