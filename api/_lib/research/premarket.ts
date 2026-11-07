// GET /api/research?fn=premarket -> today's premarket (4:00-9:30 ET) high and low for SPY and QQQ.
// Alpha Vantage's free intraday series includes extended hours (Twelve Data charges for it). To stay inside the
// 25 calls/day, each symbol is read at most once an hour from 8:00 ET, and once more after the open to lock the day in.
import { premarketFromAlpha } from '../../../shared/parse.js';
import { et } from '../../../shared/clock.js';
import { cached, getJson, hasKey, json, key, take } from '../core.js';

const SYMS = ['SPY', 'QQQ'];

export async function GET(): Promise<Response> {
  if (!hasKey('alphavantage')) return json({ error: 'needs ALPHAVANTAGE_API_KEY' }, { status: 400 });
  const e = et();
  const day = `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
  if (e.wd < 1 || e.wd > 5 || e.sod < 8 * 3600) return json({ day, levels: {}, note: 'Premarket levels appear from 8:00 ET on trading days.' }, { sMaxAge: 600 });
  const final = e.sod >= 9.5 * 3600 + 120;
  const levels: Record<string, ReturnType<typeof premarketFromAlpha>> = {};
  const errors: Record<string, string> = {};
  for (const s of SYMS) {
    try {
      levels[s] = (await cached(`pm:${s}:${day}:${final ? 'final' : e.h}`, final ? 20 * 3600 : 3600, async () => {
        if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget used up');
        const j = await getJson(`https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${s}&interval=5min&extended_hours=true&outputsize=full&apikey=${key('alphavantage')}`, 'alphavantage', 20000);
        return premarketFromAlpha(j, day);
      })).val;
    } catch (err) { errors[s] = (err as Error).message; }
  }
  return json({ day, final, levels, errors, source: 'Alpha Vantage 5-min bars incl. extended hours', asOf: Date.now() }, { sMaxAge: final ? 3600 : 600 });
}
