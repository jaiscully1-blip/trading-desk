// GET /api/research?fn=info&symbol=XLY -> what this ticker is: fund description (ETFs), or company profile + Wikipedia summary.
import { ETFS } from '../../../shared/etfs.js';
import { COMPANIES } from '../../../shared/data/companies.js';
import { finnhubProfile, wikiSummary } from '../adapters.js';
import { cached, hasKey, json } from '../core.js';

const SYM = /^[A-Z][A-Z0-9.\-]{0,11}$/;

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  const fund = ETFS[sym];
  if (fund) return json({ sym, type: 'fund', name: fund.name, what: fund.what, fundKind: fund.kind, source: 'Fund’s stated objective (issuer)' }, { sMaxAge: 86400 });
  const row = COMPANIES.find((c) => c[0] === sym);
  const errors: Record<string, string> = {};
  const profile = hasKey('finnhub') ? await cached(`prof:${sym}`, 7 * 86400, () => finnhubProfile(sym)).then((r) => r.val).catch((e) => { errors.profile = (e as Error).message; return null; }) : null;
  const name = profile?.name || row?.[1] || sym;
  const wiki = name !== sym ? await cached(`wiki:${name}`, 7 * 86400, () => wikiSummary(name)).then((r) => r.val).catch((e) => { errors.wikipedia = (e as Error).message; return null; }) : null;
  return json({
    sym, type: profile?.name || row ? 'company' : 'unknown', name,
    what: wiki?.extract ?? null, wiki: wiki ? { title: wiki.title, url: wiki.url } : null,
    sector: row?.[2] ?? null, industry: row?.[3] ?? profile?.industry ?? null, hq: row?.[4] ?? profile?.country ?? null,
    marketCap: profile?.marketCap ?? null, exchange: profile?.exchange ?? null, web: profile?.web ?? null,
    index: row ? (row[7] === 'spx' ? 'S&P 500' : 'Nasdaq-100') : null, errors,
    source: 'Finnhub profile · Wikipedia summary · S&P 500 constituent list',
  }, { sMaxAge: wiki ? 86400 : 600 });
}
