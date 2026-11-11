// GET /api/research?fn=lookup&q=rocket -> up to 10 US-listed companies whose ticker or name matches, from SEC's own ticker list
// (company_tickers.json, every SEC filer, cached a day). Used by the Company page search for names outside the built-in list.
import { parseSecTickers } from '../../../shared/company.js';
import { searchCompanies } from '../../../shared/companySearch.js';
import { secJson } from '../adapters.js';
import { cached, hasKey, json } from '../core.js';

export async function GET(req: Request): Promise<Response> {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 40);
  if (q.length < 1) return json({ hits: [] });
  if (!hasKey('sec')) return json({ hits: [], error: 'needs SEC_USER_AGENT' });
  try {
    const list = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
    // SEC lists share classes as BRK-B; the desk writes BRK.B
    const hits = searchCompanies(q, list.map((t) => ({ sym: t.ticker.replace(/-/g, '.'), name: t.title })), 10);
    return json({ hits, source: 'SEC company tickers list' }, { sMaxAge: 86400 });
  } catch (e) { return json({ hits: [], error: (e as Error).message.slice(0, 120) }, { status: 502 }); }
}
