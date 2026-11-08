// /api/research?fn=webull-order  (POST, op=preview|place|cancel)   and   ?fn=webull-orders (GET, op=limits|open)
// Approve-every-order ticket for Webull. See api/_lib/broker/webull-orders.ts for the gates. No bot, no automation:
// an order is only sent when a person previews it, types the order PIN and presses Confirm.
import { json } from '../core.js';
import { denyPrivate } from '../private.js';
import { hasWebull, wbPositions } from '../webull.js';
import { normOpenOrders, normPositions } from '../../../shared/webull.js';
import { parseDraft } from '../../../shared/orders.js';
import { audit, cancel, caps, describe, makeTicket, maxPerDay, openOrders, orderProblems, ordersOn, pinOk, place, preview, ticketOk, underDailyCap } from '../broker/webull-orders.js';
import { accountId } from './webull.js';

const err = (msg: string, status: number, code?: string) => json({ error: msg, code }, { status });

async function held(id: string, sym: string): Promise<number | null> {
  try { return normPositions(await wbPositions(id)).filter((p) => p.sym === sym && !p.option).reduce((a, p) => a + p.qty, 0); } catch { return null; }
}

export async function GET(req: Request): Promise<Response> {
  const deny = denyPrivate(req);
  if (deny) return deny;
  const op = new URL(req.url).searchParams.get('op') ?? 'limits';
  if (op === 'limits') return json({ ordersOn: ordersOn(), pinSet: !!process.env.WEBULL_ORDER_PIN, keys: hasWebull(), caps: caps(), maxPerDay: maxPerDay() });
  if (!hasWebull()) return err('Add WEBULL_APP_KEY and WEBULL_APP_SECRET in Vercel first.', 400, 'no-keys');
  try {
    if (op === 'open') { const { id } = await accountId(); return json({ orders: normOpenOrders(await openOrders(id)), asOf: Date.now() }); }
    return err('op must be limits or open', 400);
  } catch (e) { return err((e as Error).message, 502); }
}

export async function POST(req: Request): Promise<Response> {
  const deny = denyPrivate(req);
  if (deny) return deny;
  const op = new URL(req.url).searchParams.get('op') ?? '';
  if (!hasWebull()) return err('Add WEBULL_APP_KEY and WEBULL_APP_SECRET in Vercel first.', 400, 'no-keys');
  if (!ordersOn()) return err('Orders are switched off. Set WEBULL_ORDERS=on and WEBULL_ORDER_PIN in Vercel to turn them on.', 403, 'orders-off');
  let body: any;
  try { body = await req.json(); } catch { return err('bad JSON', 400); }
  try {
    const { id } = await accountId();
    if (op === 'cancel') {
      if (!pinOk(req.headers.get('x-order-pin'))) { audit('cancel-refused-pin', {}); return err('Wrong order PIN.', 401, 'bad-pin'); }
      const cid = String(body?.clientOrderId ?? '');
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(cid)) return err('bad order id', 400);
      const raw = await cancel(id, cid);
      audit('cancel', { clientOrderId: cid });
      return json({ ok: true, raw });
    }
    const d = parseDraft(body?.order);
    const last = Number(body?.last);
    const problems = orderProblems(d, caps(), d.side === 'SELL' ? await held(id, d.sym) : 0, Number.isFinite(last) && last > 0 ? last : null);
    if (problems.length) return json({ error: problems.join(' '), problems, code: 'rejected' }, { status: 422 });

    if (op === 'preview') {
      const raw = await preview(id, d);
      audit('preview', { order: describe(d) });
      return json({ ok: true, text: describe(d), preview: raw, ticket: makeTicket(d) });
    }
    if (op === 'place') {
      if (!pinOk(req.headers.get('x-order-pin'))) { audit('place-refused-pin', { order: describe(d) }); return err('Wrong order PIN.', 401, 'bad-pin'); }
      if (!ticketOk(d, String(body?.ticket ?? ''))) return err('This order changed or the preview is older than 3 minutes. Preview it again.', 409, 'stale-preview');
      if (!underDailyCap()) return err(`Daily order cap reached (${maxPerDay()}).`, 429, 'daily-cap');
      const r = await place(id, d);
      audit('place', { order: describe(d), clientOrderIds: r.clientOrderIds });
      return json({ ok: true, text: describe(d), clientOrderIds: r.clientOrderIds, comboId: r.comboId, raw: r.raw });
    }
    return err('op must be preview, place or cancel', 400);
  } catch (e) {
    audit('error', { op, error: (e as Error).message.slice(0, 200) });
    return err((e as Error).message, 502);
  }
}
