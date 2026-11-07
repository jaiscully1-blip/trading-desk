// GET /api/research?fn=webull&op=status|token-create|token-check|account|pnl   (needs the desk password header)
// Read-only view of Jai's Webull account. Nothing here can place, change or cancel an order.
import { cached, json } from '../core.js';
import { denyPrivate } from '../private.js';
import { WEBULL_HOST, hasWebull, wbAccounts, wbBalance, wbConfig, wbOrders, wbPositions, wbTokenCheck, wbTokenCreate } from '../webull.js';
import { fillsFromOrders, listOf, normBalance, normPositions, realized, wbTime } from '../../../shared/webull.js';

async function accountId(): Promise<{ id: string; list: { id: string; type: string; label: string }[] }> {
  const raw = (await cached('wb:accounts', 3600, wbAccounts)).val;
  const list = listOf(raw).map((a: any) => ({ id: String(a.account_id ?? a.accountId ?? a.id ?? ''), type: String(a.account_type ?? a.account_class ?? a.type ?? ''), label: String(a.account_label ?? a.account_number ?? a.nickname ?? '') })).filter((a) => a.id);
  const want = process.env.WEBULL_ACCOUNT_ID;
  const id = (want && list.find((a) => a.id === want)?.id) || want || list[0]?.id;
  if (!id) throw new Error('Webull returned no accounts for this app key');
  return { id, list };
}

const fail = (e: unknown, status = 502) => json({ error: (e as Error).message }, { status });

export async function GET(req: Request): Promise<Response> {
  const deny = denyPrivate(req);
  if (deny) return deny;
  const q = new URL(req.url).searchParams, op = q.get('op') ?? 'status';
  if (op !== 'status' && !hasWebull()) return json({ error: 'Add WEBULL_APP_KEY and WEBULL_APP_SECRET in Vercel, then redeploy.', code: 'no-keys' }, { status: 400 });
  try {
    switch (op) {
      case 'status': {
        let tokenRequired: boolean | null = null, configError: string | undefined;
        if (hasWebull()) {
          try { const c = (await cached('wb:config', 600, wbConfig)).val; tokenRequired = !!(c?.token_check_enabled ?? c?.data?.token_check_enabled); }
          catch (e) { configError = (e as Error).message; }
        }
        return json({ configured: hasWebull(), host: WEBULL_HOST, tokenRequired, tokenSet: !!process.env.WEBULL_ACCESS_TOKEN, accountPinned: !!process.env.WEBULL_ACCOUNT_ID, configError, asOf: Date.now() });
      }
      case 'token-create': {
        // Webull texts a code to the phone on the account; approving it in the Webull app activates this token.
        const r = await wbTokenCreate();
        return json({ token: r?.token, status: r?.status, expires: r?.expires });
      }
      case 'token-check': {
        const token = q.get('token') || process.env.WEBULL_ACCESS_TOKEN || '';
        if (!token) return json({ error: 'no token to check' }, { status: 400 });
        const r = await wbTokenCheck(token);
        return json({ status: r?.status, expires: r?.expires });
      }
      case 'account': {
        const { id, list } = await accountId();
        const [bal, pos] = await Promise.all([
          cached(`wb:bal:${id}`, 30, () => wbBalance(id)),
          cached(`wb:pos:${id}`, 30, () => wbPositions(id)),
        ]);
        return json({ account: { id: `…${id.slice(-4)}`, count: list.length, type: list.find((a) => a.id === id)?.type ?? '' }, balance: normBalance(bal.val), positions: normPositions(pos.val), stale: bal.stale || pos.stale, asOf: Date.now(), source: 'Webull OpenAPI (read-only)' });
      }
      case 'pnl': {
        const days = Math.min(90, Math.max(1, Number(q.get('days')) || 30));
        const { id } = await accountId();
        const end = Date.now(), start = end - days * 86400_000;
        const pages = (await cached(`wb:orders:${id}:${days}`, 120, async () => {
          const out: unknown[] = [];
          let key: string | undefined;
          for (let i = 0; i < 12; i++) { // Webull pages its history; stop at 12 pages to stay inside its 2-per-2s limit
            const r = await wbOrders(id, wbTime(start), wbTime(end), key);
            out.push(r);
            key = r?.pagination_key ?? r?.data?.pagination_key ?? r?.next_pagination_key;
            if (!key) break;
          }
          return out;
        })).val;
        const fills = fillsFromOrders(pages);
        const r = realized(fills);
        return json({ from: new Date(start).toISOString().slice(0, 10), range: days, fills, closed: r.closed, dayRows: r.days, unmatched: r.unmatched, asOf: Date.now(), source: 'Webull order history (filled orders), FIFO matched' });
      }
      default: return json({ error: 'op must be status, token-create, token-check, account or pnl' }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}
