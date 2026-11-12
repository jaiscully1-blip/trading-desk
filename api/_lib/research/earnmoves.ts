// GET /api/research?fn=earnmoves&symbols=CTVA,FNV -> after-hours / premarket price vs the last regular close for up to 30 tickers.
// Yahoo chart data with extended hours (unofficial, delayed). Used for the "reporting tonight / tomorrow morning" earnings view.
import { parseExtMove, type ExtMove } from '../../../shared/extMove.js';
import { SYMBOL_RE, cached, getJson, json } from '../core.js';

export async function GET(req: Request): Promise<Response> {
  const syms = [...new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 30);
  const moves: ExtMove[] = [];
  const errors: Record<string, string> = {};
  for (let i = 0; i < syms.length; i += 6) {
    await Promise.all(syms.slice(i, i + 6).map(async (s) => {
      try {
        const { val } = await cached(`ext:${s}`, 90, async () => parseExtMove(s, await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s.replace('.', '-'))}?range=2d&interval=5m&includePrePost=true`, 'yahoo', 8000, { headers: { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' } })));
        if (val) moves.push(val);
      } catch (e) { errors[s] = (e as Error).message.slice(0, 80); }
    }));
  }
  return json({ moves, errors, source: 'Yahoo Finance extended-hours chart data (unofficial, delayed)', asOf: Date.now() }, { sMaxAge: 60 });
}
