// GET /api/research?fn=prints&symbol=SPY -> dark-pool block levels and "phantom" prints for the last 3 sessions, from Alpaca's
// free plan (SIP consolidated tape, at least 15 minutes old). Big names trade millions of times a day, so each session is
// read within a page budget: extended hours in full (where late-reported blocks show up), then the regular session from
// the close backwards. `coverage` says how much of each session was read. Finished sessions are cached for a day.
import { blockPrints, printLevels, type Print, type RawTrade } from '../../../shared/prints.js';
import { etToUtc } from '../../../shared/clock.js';
import { SYMBOL_RE, cached, getJson, hasKey, json } from '../core.js';

const headers = () => ({ 'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID ?? '', 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });
const DELAY = 16 * 60_000;

/** Every trade in [start, end), oldest first, up to `pages` pages of 10,000. */
async function trades(sym: string, start: number, end: number, pages: number, deadline: number): Promise<{ rows: RawTrade[]; full: boolean }> {
  const rows: RawTrade[] = [];
  let token = '', n = 0;
  do {
    const q = `feed=sip&limit=10000&sort=asc&start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}${token ? `&page_token=${token}` : ''}`;
    const j = await getJson(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/trades?${q}`, 'alpaca', 8000, { headers: headers() });
    rows.push(...((j?.trades ?? []) as RawTrade[]));
    token = j?.next_page_token ?? '';
    n++;
  } while (token && n < pages && Date.now() < deadline);
  return { rows, full: !token };
}

/** One session: premarket and after-hours in full, the regular session from the close back as far as the budget goes. */
async function session(sym: string, day: string, deadline: number) {
  const [y, m, d] = day.split('-').map(Number), now = Date.now() - DELAY;
  const at = (h: number, mi: number) => Math.min(etToUtc(y, m, d, h, mi), now);
  const pre = await trades(sym, at(4, 0), at(9, 30), 6, deadline);
  const post = at(16, 0) < now ? await trades(sym, at(16, 0), at(20, 0), 6, deadline) : { rows: [], full: true };
  // regular session: read backwards in 30-minute slices from the close so the latest part is always covered
  const regular: RawTrade[] = [];
  let from = at(16, 0), readTo = from;
  const open = at(9, 30);
  while (from > open && Date.now() < deadline) {
    const s = Math.max(open, from - 30 * 60_000);
    const r = await trades(sym, s, from, 4, deadline);
    regular.unshift(...r.rows);
    if (!r.full) break;
    readTo = from = s;
  }
  const ref = { last: null as number | null };
  const prints: Print[] = [...blockPrints(pre.rows, ref), ...blockPrints(regular, ref), ...blockPrints(post.rows, ref)];
  const regMin = Math.round((at(16, 0) - readTo) / 60_000), regTotal = Math.round((at(16, 0) - open) / 60_000);
  return { day, prints, coverage: { premarket: pre.full, afterHours: post.full, regularMin: regMin, regularTotal: regTotal }, done: etToUtc(y, m, d, 20, 0) < now };
}

const lastSessions = (k: number) => {
  const out: string[] = [];
  for (let t = Date.now() - DELAY; out.length < k; t -= 86400_000) {
    const s = new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), wd = new Date(`${s}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !out.includes(s)) out.push(s);
  }
  return out;
};

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('alpaca')) return json({ needsKey: true, error: 'Add ALPACA_KEY_ID and ALPACA_SECRET_KEY (free Alpaca account) in Vercel to see dark-pool prints.' }, { status: 503 });
  try {
    const deadline = Date.now() + 8000;
    const days = await Promise.all(lastSessions(3).map(async (day) => {
      // a finished session never changes: cache it for a day; the current one for 15 minutes (the data is 15 minutes old anyway)
      const [y, m, d] = day.split('-').map(Number), done = etToUtc(y, m, d, 20, 0) < Date.now() - DELAY;
      return (await cached(`prints:${sym}:${day}`, done ? 86400 : 900, () => session(sym, day, deadline))).val;
    }));
    const all = days.flatMap((d) => d.prints);
    const levels = printLevels(all, 10), phantoms = all.filter((p) => p.phantom).sort((a, b) => b.usd - a.usd).slice(0, 6);
    return json({
      sym, levels, phantoms, top: [...all].sort((a, b) => b.usd - a.usd).slice(0, 20), sessions: days.map((d) => ({ day: d.day, blocks: d.prints.length, coverage: d.coverage })),
      asOf: Date.now() - DELAY,
      source: 'Alpaca free plan, SIP consolidated tape, 15+ minutes delayed. Off-exchange (FINRA TRF) prints of $1M+ or 10,000+ shares. A print has a buyer and a seller: it does not show direction.',
    }, { sMaxAge: 300 });
  } catch (e) { return json({ sym, error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
