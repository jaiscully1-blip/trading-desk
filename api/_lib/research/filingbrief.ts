// GET /api/research?fn=filingbrief&symbol=NVDA[&acc=0001045810-26-000021] -> the main points of a 10-Q, 10-K or earnings
// release: official numbers from SEC XBRL (no AI), an AI brief whose every quote is checked against the filing, and
// open-market insider buys and sells in the last 90 days (Form 4). Free sources; cached per filing. Facts, not advice.
import { BRIEF_SCHEMA, exhibitFromIndex, briefChoices, briefNumbers, briefPrompt, briefText, checkBrief, insiderSummary, keySentences, type BriefKind } from '../../../shared/filingBrief.js';
import { htmlToText } from '../../../shared/company.js';
import { fundSeries } from '../../../shared/fundseries.js';
import { geminiJson, hasAi, secJson, secText } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json } from '../core.js';
import { doc, filer } from './intel.js';
import { GET as insiderRoute } from './insider.js';

export async function filingbrief(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase(), want = u.searchParams.get('acc') ?? '';
  if (!SYMBOL_RE.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'Needs SEC_USER_AGENT.' }, { status: 400 });
  const errors: Record<string, string> = {};
  try {
    const f = await filer(sym);
    if (!f) return json({ error: `${sym} isn't an SEC filer (funds and many foreign companies are not).` });
    const choices = briefChoices(f.rows);
    const pick = choices.find((c) => c.acc === want) ?? choices[0];
    if (!pick) return json({ sym, name: f.name, choices: [], error: 'No 10-Q, 10-K or earnings release found in the recent filings.' });
    const kind: BriefKind = pick.kind;

    // the document: the filing itself, or the press release attached to an earnings 8-K (exhibit 99)
    let url = doc(f.cik, pick.acc, pick.file);
    if (kind === 'earnings') {
      // the press release is exhibit 99.1; file names vary ("q3fy27pr.htm"), so read its type from the filing index page
      const dir = `https://www.sec.gov/Archives/edgar/data/${f.cik}/${pick.acc.replace(/-/g, '')}`;
      const href = exhibitFromIndex(await secText(`${dir}/${pick.acc}-index.html`, 15000), /^EX-99(\.1)?$/i);
      if (href) url = new URL(href, 'https://www.sec.gov').toString();
      else {
        const idx = await secJson(`${dir}/index.json`);
        const ex = (idx?.directory?.item ?? []).find((i: any) => /ex-?99/i.test(i.name) && /\.htm/i.test(i.name));
        if (ex) url = doc(f.cik, pick.acc, ex.name);
      }
    }
    if (url === doc(f.cik, pick.acc, pick.file) && kind === 'earnings') errors.document = 'Could not find the press release in this 8-K, so the brief reads the cover page.';
    const text = (await cached(`fb:text:${url}`, 30 * 86400, async () => htmlToText(await secText(url, 30000)))).val;

    // official numbers (SEC XBRL), lined up with the period the filing covers
    const fs = await (async () => { try { return (await cached(`fundseries:${f.cik}`, 86400, async () => fundSeries(await secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(f.cik).padStart(10, '0')}.json`)))).val; } catch (e) { errors.numbers = String((e as Error).message).slice(0, 120); return null; } })();
    const numbers = fs ? briefNumbers(fs, kind, (pick as any).period ?? null) : null;

    // AI brief, quotes checked against the filing
    let brief: { headline: string; points: { topic: string; text: string; quote: string }[]; dropped: number; model: string | null } | null = null;
    if (hasAi()) {
      try {
        brief = (await cached(`fb:brief2:${pick.acc}`, 30 * 86400, async () => {
          const sents = keySentences(briefText(text, kind));
          if (sents.length < 3) return { headline: '', points: [], dropped: 0, model: null };
          const r = await geminiJson(briefPrompt(f.name, kind, pick.date, sents), BRIEF_SCHEMA);
          return { ...checkBrief(r.data, text), model: r.model };
        })).val;
      } catch (e) { errors.brief = String((e as Error).message).slice(0, 160); }
    } else errors.brief = 'Needs a free AI key in Vercel (GEMINI_API_KEY or GROQ_API_KEY).';

    // insiders: open-market buys and sells, last 90 days
    let insiders = null;
    try { const j = await (await insiderRoute(new Request(`https://desk/api/research?fn=insider&symbol=${sym}`))).json(); insiders = insiderSummary(j.txs ?? [], new Date()); } catch (e) { errors.insiders = String((e as Error).message).slice(0, 120); }

    return json({
      sym, name: f.name, choices: choices.map((c) => ({ acc: c.acc, kind: c.kind, date: c.date, form: c.form })),
      filing: { acc: pick.acc, kind, date: pick.date, url, period: (pick as any).period ?? null }, numbers, brief, insiders, errors, asOf: Date.now(),
      source: 'SEC EDGAR (the filing, XBRL numbers, Form 4). The brief is written by a free AI model from the filing; every quote was checked to be in it.',
    }, { sMaxAge: brief?.points?.length ? 3600 : 0 });
  } catch (e) { return json({ sym, error: String((e as Error).message).slice(0, 200) }); }
}
