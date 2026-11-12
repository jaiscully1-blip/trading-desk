// GET /api/research?fn=tape&symbol=NVDA -> the latest 200 IEX trades (time & sales) and IEX's best bid / ask, from Alpaca's
// free market-data plan. IEX only: about 2–3% of US volume, not the consolidated tape and not full Level 2 depth.
import { parseAlpacaQuote, parseAlpacaTrades } from '../../../shared/tape.js';
import { SYMBOL_RE, cached, getJson, hasKey, json } from '../core.js';

const headers = () => ({ 'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID ?? '', 'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY ?? '' });

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('alpaca')) return json({ needsKey: true, error: 'Add ALPACA_KEY_ID and ALPACA_SECRET_KEY (free Alpaca account) in Vercel to see the IEX tape.' }, { status: 503 });
  try {
    const { val } = await cached(`tape:${sym}`, 2, async () => {
      // the last 4 days, newest first, so a weekend or holiday still shows the last session's prints
      const start = new Date(Date.now() - 4 * 86400_000).toISOString();
      const [tr, q] = await Promise.all([
        getJson(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/trades?feed=iex&limit=200&sort=desc&start=${start}`, 'alpaca', 6000, { headers: headers() }),
        getJson(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(sym)}/quotes/latest?feed=iex`, 'alpaca', 6000, { headers: headers() }).catch(() => null),
      ]);
      return { prints: parseAlpacaTrades(tr), quote: q ? parseAlpacaQuote(q) : null };
    });
    return json({ sym, ...val, asOf: Date.now(), source: 'Alpaca free plan: IEX exchange only (about 2–3% of US volume), real-time. Not the full tape and not Level 2 depth.' }, { sMaxAge: 2 });
  } catch (e) { return json({ sym, error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
