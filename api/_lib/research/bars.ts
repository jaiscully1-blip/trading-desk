// GET /api/research?fn=bars&symbol=NVDA&tf=3m -> candles for the multi-timeframe page: 1m 3m 5m 15m 1h 4h 1d 1w.
// Yahoo's public chart data (unofficial, about 15 minutes delayed for US stocks, regular session only). 3m and 4h are built from
// 1m and 1h bars. Cached briefly so four linked charts don't repeat the same request.
import { parseYahooBars } from '../../../shared/rotation.js';
import { MTF_TFS, MTF_TTL, YAHOO_REQ, shapeBars, type MtfTF } from '../../../shared/mtf.js';
import { SYMBOL_RE, cached, getJson, json } from '../core.js';

const CRYPTO_RE = /^[A-Z0-9]{2,10}-USD$/;
export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase();
  const tf = u.searchParams.get('tf') as MtfTF;
  if (!(SYMBOL_RE.test(sym) || CRYPTO_RE.test(sym)) || !MTF_TFS.includes(tf)) return json({ error: 'bad symbol or timeframe' }, { status: 400 });
  const { interval, range } = YAHOO_REQ[tf];
  const y = sym.startsWith('^') ? sym : sym.replace('.', '-');
  try {
    const { val } = await cached(`mtf:${sym}:${tf}`, MTF_TTL[tf], async () => {
      const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=${range}&interval=${interval}`, 'yahoo', 10000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } });
      const daily = tf === '1d' || tf === '1w';
      const bars = shapeBars(parseYahooBars(j, daily), tf);
      return { bars, name: String(j?.chart?.result?.[0]?.meta?.longName ?? j?.chart?.result?.[0]?.meta?.shortName ?? '') };
    });
    if (val.bars.length < 2) return json({ error: `No ${tf} data for ${sym}` }, { status: 404 });
    return json({ symbol: sym, tf, bars: val.bars, name: val.name, source: 'Yahoo Finance (unofficial, about 15 min delayed)', freshness: tf === '1d' || tf === '1w' ? 'eod' : 'delayed', asOf: Date.now() }, { sMaxAge: Math.min(60, MTF_TTL[tf]) });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
