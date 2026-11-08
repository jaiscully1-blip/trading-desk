// GET /api/research?fn=gamma&symbol=SPY|QQQ|IWM|SPX -> dealer gamma by strike (call wall, put wall, zero-gamma flip),
// the GEX profile, and the implied-volatility surface + term structure.
// Source: Cboe's public delayed option chains (~15 min delayed). Jai approved using them (Nov 7, 2026) knowing Cboe's
// site terms are a risk; kept to personal use, cached, and labeled delayed.
import { gammaRead, ivSurface, parseCboe, pcRatios } from '../../../shared/gamma.js';
import { cached, getJson, json, take, ttl } from '../core.js';

const URL_SYM: Record<string, string> = { SPY: 'SPY', QQQ: 'QQQ', IWM: 'IWM', SPX: '_SPX' };

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? 'SPY').toUpperCase();
  if (!URL_SYM[sym]) return json({ error: `symbol must be one of ${Object.keys(URL_SYM).join(', ')}` }, { status: 400 });
  const life = ttl(900, 4 * 3600);
  try {
    const { val, stale } = await cached(`gamma:${sym}`, life, async () => {
      if (!take('cboe')) throw new Error('Cboe request budget used up for now');
      const ch = parseCboe(await getJson(`https://cdn.cboe.com/api/global/delayed_quotes/options/${URL_SYM[sym]}.json`, 'cboe', 25000), sym);
      if (!(ch.spot > 0) || ch.contracts.length < 50) throw new Error('Cboe returned an empty chain');
      const near = gammaRead(ch, 45), week = gammaRead(ch, 7);
      return {
        sym, spot: ch.spot, chainAsOf: ch.asOf, contracts: ch.contracts.length,
        gex: { ...near, profile: near.profile.map(([s, g]) => [+s.toFixed(2), Math.round(g)]) },
        gexWeek: { callWall: week.callWall, putWall: week.putWall, flip: week.flip, total: week.total },
        surface: ivSurface(ch), pc: pcRatios(ch),
      };
    });
    return json({ ...val, stale, asOf: Date.now(), source: 'Cboe delayed option chain (~15 min delayed); GEX assumes dealers long calls / short puts' }, { sMaxAge: life });
  } catch (e) { return json({ sym, error: (e as Error).message }, { status: 502 }); }
}
