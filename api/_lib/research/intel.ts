// Filings Intel routes (through /api/research):
//   fn=intel&symbol=X            executive changes (8-K item 5.02), risk-factor diff between the last two 10-Ks, customer concentration,
//                                analyst rating trend and efficiency vs peers (Finnhub), patents (USPTO PatentsView, free key) and
//                                lawsuits (CourtListener, free token)
//   fn=intelcalls&symbol=X       the last two earnings calls: tone, management vs analysts, words that changed (Alpha Vantage, 2 calls)
//   fn=intelguide&symbol=X       guidance in the last earnings releases vs the revenue reported next (Gemini reads the release; SEC XBRL)
import { cached, getJson, hasKey, json, key, take } from '../core.js';
import { finnhubMetrics, finnhubPeers, finnhubRecs, geminiJson, secJson, secText } from '../adapters.js';
import { htmlToText, parseSecTickers } from '../../../shared/company.js';
import { customerConcentration, guidanceCheck, quarterOf, riskDiff, riskSection, wordsChanged } from '../../../shared/intel.js';
import { parseTranscript, quarterCandidates } from '../../../shared/transcript.js';
import { COMPANIES } from '../../../shared/data/companies.js';

const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const doc = (cik: number, acc: string, file: string) => `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}/${file}`;

async function filer(sym: string) {
  const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
  const t = tickers.find((x) => x.ticker === sym);
  if (!t) return null;
  const sub = (await cached(`sub:${t.cik}`, 6 * 3600, () => secJson(`https://data.sec.gov/submissions/CIK${String(t.cik).padStart(10, '0')}.json`))).val;
  const r = sub?.filings?.recent ?? {};
  const rows = (Array.isArray(r.form) ? r.form : []).map((form: string, i: number) => ({ form, date: r.filingDate[i] as string, acc: r.accessionNumber[i] as string, file: r.primaryDocument[i] as string, items: String(r.items?.[i] ?? '') }));
  return { cik: t.cik, name: t.title, rows };
}

export async function intel(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('sec')) return json({ error: 'needs SEC_USER_AGENT' }, { status: 400 });
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = (e as Error).message.slice(0, 140); return null; } };
  const f = await safe('sec', () => filer(sym));
  const name = f?.name ?? COMPANIES.find((c) => c[0] === sym)?.[1] ?? sym;

  const execs = f ? f.rows.filter((x: any) => x.form === '8-K' && /5\.02/.test(x.items)).slice(0, 12).map((x: any) => ({ date: x.date, url: doc(f.cik, x.acc, x.file) })) : [];

  const risk = f ? await safe('risk', async () => {
    const ks = f.rows.filter((x: any) => x.form === '10-K' || x.form === '20-F').slice(0, 2);
    if (ks.length < 2) return null;
    return (await cached(`risk:${ks[0].acc}`, 30 * 86400, async () => {
      const [nw, od] = await Promise.all(ks.map((k: any) => secText(doc(f.cik, k.acc, k.file), 30000).then(htmlToText)));
      const d = riskDiff(riskSection(od), riskSection(nw));
      return { ...d, newer: { date: ks[0].date, url: doc(f.cik, ks[0].acc, ks[0].file) }, older: { date: ks[1].date, url: doc(f.cik, ks[1].acc, ks[1].file) }, customers: customerConcentration(nw) };
    })).val;
  }) : null;

  const recs = hasKey('finnhub') ? await safe('recs', () => cached(`recs:${sym}`, 12 * 3600, () => finnhubRecs(sym)).then((r) => r.val)) : null;
  const peers = hasKey('finnhub') ? await safe('peers', async () => {
    const list = [sym, ...(await cached(`peers:${sym}`, 7 * 86400, () => finnhubPeers(sym))).val.filter((p: string) => p !== sym).slice(0, 5)];
    const out = [];
    for (const p of list) {
      try {
        const m = (await cached(`fhm:${p}`, 24 * 3600, () => finnhubMetrics(p))).val;
        out.push({ sym: p, revPerEmployee: m.revenueEmployeeTTM ?? null, grossMargin: m.grossMarginTTM ?? null, opMargin: m.operatingMarginTTM ?? null, netMargin: m.netProfitMarginTTM ?? null, roe: m.roeTTM ?? null, revGrowth: m.revenueGrowthTTMYoy ?? null });
      } catch { /* skip that peer */ }
    }
    return out;
  }) : null;

  const patents = process.env.PATENTSVIEW_API_KEY ? await safe('patents', async () => (await cached(`pat:${name}`, 7 * 86400, async () => {
    if (!take('patentsview', 3)) throw new Error('rate limited');
    const org = name.replace(/,?\s+(inc|corp|corporation|co|ltd|plc|holdings?|group|class [ab])\.?$/gi, '').trim();
    const y = new Date().getUTCFullYear();
    const out: { year: number; n: number }[] = [];
    for (const yr of [y - 2, y - 1, y]) {
      const q = { _and: [{ _contains: { 'assignees.assignee_organization': org } }, { _gte: { patent_date: `${yr}-01-01` } }, { _lte: { patent_date: `${yr}-12-31` } }] };
      const j = await getJson(`https://search.patentsview.org/api/v1/patent/?q=${encodeURIComponent(JSON.stringify(q))}&f=${encodeURIComponent('["patent_id"]')}&o=${encodeURIComponent('{"size":1}')}`, 'patentsview', 15000, { headers: { 'X-Api-Key': key('patentsview') } });
      out.push({ year: yr, n: Number(j?.total_hits) || 0 });
    }
    return { org, years: out };
  })).val) : null;

  const lawsuits = process.env.COURTLISTENER_TOKEN ? await safe('lawsuits', async () => (await cached(`law:${name}`, 24 * 3600, async () => {
    if (!take('courtlistener')) throw new Error('rate limited');
    const org = name.replace(/,?\s+(inc|corp|corporation|co|ltd|plc|class [ab])\.?$/gi, '').trim();
    const j = await getJson(`https://www.courtlistener.com/api/rest/v4/search/?q=${encodeURIComponent(`"${org}"`)}&type=r&order_by=${encodeURIComponent('dateFiled desc')}`, 'courtlistener', 15000, { headers: { authorization: `Token ${key('courtlistener')}` } });
    return { org, total: Number(j?.count) || 0, cases: (j?.results ?? []).slice(0, 12).map((c: any) => ({ name: String(c.caseName ?? ''), court: String(c.court ?? ''), filed: String(c.dateFiled ?? ''), nature: String(c.suitNature ?? ''), url: c.docket_absolute_url ? `https://www.courtlistener.com${c.docket_absolute_url}` : null })) };
  })).val) : null;

  return json({ sym, name, execs, risk, recs, peers, patents, lawsuits, keys: { patents: !!process.env.PATENTSVIEW_API_KEY, lawsuits: !!process.env.COURTLISTENER_TOKEN, finnhub: hasKey('finnhub') }, errors, asOf: Date.now() }, { sMaxAge: 3600 });
}

export async function intelcalls(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('alphavantage')) return json({ error: 'Needs ALPHAVANTAGE_API_KEY (free).' }, { status: 400 });
  try {
    const { val } = await cached(`calls2:${sym}`, 7 * 86400, async () => {
      const got: ReturnType<typeof parseTranscript>[] = [];
      for (const q of quarterCandidates(Date.now(), 6)) {
        if (got.length >= 2) break;
        if (!take('alphavantage')) throw new Error('Alpha Vantage daily budget (25 calls) used up; try again tomorrow');
        const j = await getJson(`https://www.alphavantage.co/query?function=EARNINGS_CALL_TRANSCRIPT&symbol=${sym}&quarter=${q}&apikey=${key('alphavantage')}`, 'alphavantage', 20000);
        if (j?.Information || j?.Note) throw new Error(String(j.Information ?? j.Note).slice(0, 140));
        const t = parseTranscript(j, sym, q);
        if (t) got.push(t);
      }
      if (got.length < 2) throw new Error('Fewer than two transcripts available for this company.');
      const [cur, prev] = got as NonNullable<ReturnType<typeof parseTranscript>>[];
      const tone = (t: typeof cur, role?: string) => { const xs = t.turns.filter((x) => x.sentiment != null && (!role || x.role === role)).map((x) => x.sentiment!); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
      const text = (t: typeof cur) => t.turns.filter((x) => x.role !== 'operator').map((x) => x.text).join(' ');
      return {
        cur: { quarter: cur.quarter, tone: tone(cur), mgmt: tone(cur, 'company'), analysts: tone(cur, 'analyst'), questions: cur.turns.filter((x) => x.role === 'analyst').length },
        prev: { quarter: prev.quarter, tone: tone(prev), mgmt: tone(prev, 'company'), analysts: tone(prev, 'analyst'), questions: prev.turns.filter((x) => x.role === 'analyst').length },
        words: wordsChanged(text(prev), text(cur)),
      };
    });
    return json({ sym, ...val, source: 'Alpha Vantage earnings call transcripts (sentiment per turn is their model, −1 to 1); word changes per 10,000 words, counted by the desk' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 200) }, { status: 502 }); }
}

const GUIDE_SCHEMA = { type: 'OBJECT', properties: { found: { type: 'BOOLEAN' }, period: { type: 'STRING' }, low: { type: 'NUMBER' }, high: { type: 'NUMBER' }, unit: { type: 'STRING', enum: ['dollars', 'thousands', 'millions', 'billions'] }, quote: { type: 'STRING' } }, required: ['found'] };
const SCALE: Record<string, number> = { dollars: 1, thousands: 1e3, millions: 1e6, billions: 1e9 };

export async function intelguide(req: Request): Promise<Response> {
  const sym = (new URL(req.url).searchParams.get('symbol') ?? '').toUpperCase();
  if (!SYM.test(sym)) return json({ error: 'bad symbol' }, { status: 400 });
  if (!hasKey('gemini') || !hasKey('sec')) return json({ error: 'Needs GEMINI_API_KEY and SEC_USER_AGENT.' }, { status: 400 });
  try {
    const f = await filer(sym);
    if (!f) return json({ error: `${sym} isn't an SEC filer.` }, { status: 404 });
    const { val } = await cached(`guide:${sym}:${f.rows[0]?.acc}`, 7 * 86400, async () => {
      const releases = f.rows.filter((x: any) => x.form === '8-K' && /2\.02/.test(x.items)).slice(0, 4);
      const rev = await secJson(`https://data.sec.gov/api/xbrl/companyconcept/CIK${String(f.cik).padStart(10, '0')}/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax.json`).catch(() => secJson(`https://data.sec.gov/api/xbrl/companyconcept/CIK${String(f.cik).padStart(10, '0')}/us-gaap/Revenues.json`)).catch(() => null);
      const quarters = new Map<string, number>();
      for (const x of rev?.units?.USD ?? []) if (x.frame && /Q\d$/.test(x.frame) && !/I$/.test(x.frame)) quarters.set(String(x.frame).replace('CY', ''), Number(x.val));
      const out = [];
      for (const r of releases) {
        try {
          const idx = await secJson(`https://www.sec.gov/Archives/edgar/data/${f.cik}/${r.acc.replace(/-/g, '')}/index.json`);
          const ex = (idx?.directory?.item ?? []).find((i: any) => /ex-?99/i.test(i.name) && /\.htm/i.test(i.name));
          if (!ex) continue;
          const t = htmlToText(await secText(doc(f.cik, r.acc, ex.name), 25000));
          const at = t.search(/outlook|guidance|expects?\s+(revenue|net revenue|sales)|for the (fourth|first|second|third) quarter/i);
          const slice = t.slice(Math.max(0, at - 500), at + 3500);
          if (at < 0 || !take('gemini')) { out.push({ date: r.date, found: false }); continue; }
          const { data } = await geminiJson(`From this earnings press release excerpt, extract the company's revenue (or net revenue / net sales) guidance for the NEXT fiscal quarter only. If there is no numeric revenue guidance for the next quarter, set found=false. period: the quarter's end month and year like "2026-12". low/high: the range numbers as written (same value twice for a point estimate). unit: the unit they're written in. quote: the exact sentence, at most 200 characters. Never invent numbers.\n---\n${slice}`, GUIDE_SCHEMA);
          if (!data?.found) { out.push({ date: r.date, found: false }); continue; }
          const sc = SCALE[data.unit] ?? 1, low = Number.isFinite(+data.low) ? +data.low * sc : null, high = Number.isFinite(+data.high) ? +data.high * sc : null;
          const q = /^\d{4}-\d{2}$/.test(String(data.period)) ? quarterOf(`${data.period}-15`) : null;
          const actual = q ? quarters.get(q) ?? null : null;
          out.push({ date: r.date, found: true, quarter: q, low, high, actual, result: guidanceCheck(low, high, actual), quote: String(data.quote ?? '').slice(0, 220), url: doc(f.cik, r.acc, ex.name) });
        } catch { out.push({ date: r.date, found: false }); }
      }
      return out;
    });
    return json({ sym, rows: val, source: 'Earnings press releases (8-K exhibit 99) read by Gemini (free tier), revenue reported in SEC XBRL. Fiscal quarters are mapped to calendar quarters, so check odd fiscal years.' }, { sMaxAge: 3600 });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 200) }, { status: 502 }); }
}
