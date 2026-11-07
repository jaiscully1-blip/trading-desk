// GET /api/research?fn=insider&symbol=NVDA -> recent insider transactions from SEC Form 4 filings (free, no key).
import { form4List, parseForm4, type InsiderTx } from '../../../shared/insider.js';
import { parseSecTickers } from '../../../shared/company.js';
import { secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';

export async function GET(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'needs SEC_USER_AGENT' }, { status: 400 });
  try {
    const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
    const cik = tickers.find((t) => t.ticker === sym)?.cik;
    if (!cik) return json({ sym, txs: [], note: `${sym} isn't an SEC filer (funds and foreign companies don't file Form 4).` });
    const { val, stale } = await cached(`f4:${sym}`, 6 * 3600, async () => {
      const list = form4List(await secJson(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`), cik, 15);
      const txs: InsiderTx[] = [];
      const errs: string[] = [];
      // a few at a time: SEC asks for at most 10 requests a second
      for (let i = 0; i < list.length; i += 5) {
        const got = await Promise.all(list.slice(i, i + 5).map((f) => secText(f.url).then((x) => parseForm4(x, f.filed, f.index)).catch((e) => { errs.push((e as Error).message); return []; })));
        txs.push(...got.flat());
      }
      return { txs: txs.sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : 0)), filings: list.length, errs: errs.slice(0, 2) };
    });
    return json({ sym, ...val, stale, asOf: Date.now(), source: 'SEC EDGAR Form 4 filings' }, { sMaxAge: 3 * 3600 });
  } catch (e) { return json({ sym, txs: [], error: (e as Error).message }, { status: 502 }); }
}
