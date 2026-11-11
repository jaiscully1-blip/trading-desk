// POST /api/research?fn=notify-test -> sends one test push to your phone through ntfy. Desk password required (so strangers can't
// buzz your phone), and at most one test a minute. Never sends anything but the fixed test text.
import { denyPrivate } from '../private.js';
import { notifyConfigured, sendAlert } from '../notify.js';
import { json } from '../core.js';

let last = 0;
export async function POST(req: Request): Promise<Response> {
  const deny = denyPrivate(req);
  if (deny) return deny;
  if (!notifyConfigured()) return json({ error: 'Add NTFY_TOPIC in Vercel (and as a GitHub secret for the Alerts Action), then redeploy.', code: 'no-topic' }, { status: 400 });
  if (Date.now() - last < 60_000) return json({ error: 'One test a minute.' }, { status: 429 });
  last = Date.now();
  try { await sendAlert({ title: 'Trading desk test', message: 'Phone alerts work. Real alerts carry only tickers and prices.', tags: ['white_check_mark'], priority: 3 }); return json({ ok: true }); }
  catch (e) { return json({ error: (e as Error).message }, { status: 502 }); }
}
