// GET /api/research?fn=spv&symbol=F -> a company's SPVs, SPEs and VIEs from its SEC filings: the VIE numbers it tags in XBRL
// (SEC labels, latest and a year earlier), the latest 10-K's own sentences on VIEs, special purpose entities, securitizations
// and off-balance-sheet arrangements (quoted, no AI), and Exhibit 21 subsidiaries that look like financing vehicles.
// Free SEC data; cached a day (numbers) and 30 days (10-K text). Facts from filings, not advice.
import { htmlToText } from '../../../shared/company.js';
import { spvSentences, vehicleNames, vieFacts } from '../../../shared/spv.js';
import { secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';
import { doc, filer } from './intel.js';
import { subsidiaries } from './patents.js';

/** SEC sometimes answers a large file with a short-lived 404 ("NoSuchKey") under load: try once more after a pause. */
async function secJsonRetry(url: string) {
  try { return await secJson(url); } catch (e) {
    if (!/404/.test(String((e as Error).message))) throw e;
    await new Promise((r) => setTimeout(r, 2500));
    return secJson(url);
  }
}

export async function spv(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'Needs SEC_USER_AGENT.' }, { status: 400 });
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = String((e as Error).message).slice(0, 140); return null; } };
  try {
    const f = await filer(sym);
    if (!f) return json({ error: `${sym} isn't an SEC filer.` });
    const tenK = f.rows.find((r: any) => r.form === '10-K' || r.form === '20-F' || r.form === '40-F');
    const url = tenK ? doc(f.cik, tenK.acc, tenK.file) : null;
    const [facts, groups, subs] = await Promise.all([
      safe('numbers', async () => (await cached(`spv:facts:${f.cik}`, 86400, async () => (() => { const staleBefore = tenK ? new Date(Date.parse(tenK.date) - 400 * 86400000).toISOString().slice(0, 10) : ''; return secJsonRetry(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(f.cik).padStart(10, '0')}.json`).then((j) => { const v = vieFacts(j, staleBefore); return { facts: [...v], hidden: v.hidden ?? 0 }; }); })())).val),
      url ? safe('10-K', async () => spvSentences((await cached(`fb:text:${url}`, 30 * 86400, async () => htmlToText(await secText(url, 30000)))).val)) : Promise.resolve(null),
      url ? safe('subsidiaries', async () => (await cached(`ex21v2:${url}`, 30 * 86400, () => subsidiaries(url))).val) : Promise.resolve(null),
    ]);
    return json({
      sym, name: f.name, filing: tenK ? { date: tenK.date, url, form: tenK.form } : null,
      facts: facts?.facts ?? [], hiddenFacts: facts?.hidden ?? 0, groups: groups ?? [], vehicles: vehicleNames(subs ?? []), subsidiaries: subs?.length ?? 0, errors, asOf: Date.now(),
      source: 'SEC EDGAR: XBRL company facts (VIE numbers with the SEC labels), the latest annual report (sentences quoted as written), Exhibit 21 subsidiary list',
    }, { sMaxAge: Object.keys(errors).length ? 0 : 3600 });
  } catch (e) { return json({ sym, error: String((e as Error).message).slice(0, 200) }); }
}
