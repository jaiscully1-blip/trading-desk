// GET /api/names?symbols=NVDA,AMD -> { names: { NVDA: "NVIDIA Corp" } }. Finnhub profiles, cached a week (shared with /api/news).
import { finnhubProfile } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';

export async function GET(req: Request): Promise<Response> {
  const syms = [...new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)))].slice(0, 30);
  const names: Record<string, string> = {};
  if (hasKey('finnhub')) {
    await Promise.all(syms.map(async (s) => {
      try { const p = (await cached(`prof:${s}`, 7 * 86400, () => finnhubProfile(s))).val; if (p.name) names[s] = p.name; } catch { /* unknown symbol or budget */ }
    }));
  }
  return json({ names, asOf: Date.now() }, { sMaxAge: Object.keys(names).length ? 86400 : 0 });
}
