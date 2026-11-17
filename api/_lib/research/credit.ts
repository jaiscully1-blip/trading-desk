// GET /api/research?fn=credit -> credit market dashboard data: FRED series (spreads, yield curve, stress, bank lending, delinquencies,
// recessions) plus bond ETF prices (Yahoo). Free; the FRED key stays on the server. Facts and history only, never advice.
import { ETFS, SERIES, lastNYears, recessions, stats, aroundRecessions, type Pts } from '../../../shared/credit.js';
import { parseFredSeries } from '../../../shared/parse.js';
import { parseSpark } from '../../../shared/distressGather.js';
import { cached, getJson, hasKey, json, key } from '../core.js';

const start = '1996-12-01';
async function fred(id: string, daily: boolean, extra = ''): Promise<{ date: string; value: number }[]> {
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key('fred')}&file_type=json&observation_start=${start}${daily ? '&frequency=w&aggregation_method=avg' : ''}${extra}`;
  return parseFredSeries(await getJson(u, 'fred', 15000));
}
async function latestDaily(id: string): Promise<{ date: string; value: number } | null> {
  const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key('fred')}&file_type=json&sort_order=desc&limit=5`;
  const r = parseFredSeries(await getJson(u, 'fred', 10000));
  return r.length ? r[r.length - 1] : null;
}

export async function GET(): Promise<Response> {
  if (!hasKey('fred')) return json({ error: 'needs FRED_API_KEY' }, { status: 400 });
  try {
    const { val, stale } = await cached('credit:all', 6 * 3600, async () => {
      const out: Record<string, { id: string; pts: Pts; last: { date: string; value: number } | null; stats: ReturnType<typeof stats> }> = {};
      const errors: Record<string, string> = {};
      let recs: [string, string][] = []; let spreadHy: Pts = [];
      for (const m of SERIES) {
        try {
          const obs = await fred(m.id, m.daily);
          const pts: Pts = obs.map((o) => [o.date, o.value]);
          const latest = m.daily ? await latestDaily(m.id) : null;
          if (m.key === 'rec') { recs = recessions(pts); continue; }
          if (m.key === 'hy') spreadHy = pts;
          const withLast: Pts = latest && pts.length && latest.date > pts[pts.length - 1][0] ? [...pts, [latest.date, latest.value]] : pts;
          out[m.key] = { id: m.id, pts: lastNYears(withLast, 10), last: latest ?? (pts.length ? { date: pts[pts.length - 1][0], value: pts[pts.length - 1][1] } : null), stats: stats(withLast) };
        } catch (e) { errors[m.key] = (e as Error).message.slice(0, 100); }
      }
      let etfs: Record<string, { closes: number[]; ts: number[] }> = {};
      try {
        const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${ETFS.map((e) => e.sym).join(',')}&range=1y&interval=1d`, 'yahoo', 12000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } });
        const m = parseSpark(j, ETFS.map((e) => e.sym));
        for (const [sym, closes] of m) etfs[sym] = { closes, ts: Array.isArray(j?.[sym]?.timestamp) ? j[sym].timestamp.slice(-closes.length) : [] };
      } catch (e) { errors.etfs = (e as Error).message.slice(0, 100); etfs = {}; }
      return { series: out, recessions: recs, aroundRecessions: aroundRecessions(spreadHy, recs), etfs, errors };
    });
    return json({ ...val, stale, asOf: Date.now(), source: 'FRED (ICE BofA indices, Treasury yields, St. Louis and Chicago Fed indices, Fed surveys, NBER); bond ETF prices from Yahoo Finance (unofficial)' }, { sMaxAge: 3 * 3600, swr: 86400 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 160) }, { status: 502 }); }
}
