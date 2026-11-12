// Essays page routes (through /api/research):
//   GET  fn=range&symbol=NVDA&from=2026-10-01&to=2026-10-20[&name=Nvidia] -> headlines published in that window (Google News
//        search with after: / before:) and the company's SEC filings dated inside it (8-K, 10-Q, 10-K, ...; earnings = 8-K item 2.02).
//   POST fn=essayai { mode: 'outline' | 'check', sym, title?, text, facts[] } -> Gemini outline or fact check (free tier).
import { geminiJson, rssFeed, secJson } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json, take } from '../core.js';
import { parseSecTickers } from '../../../shared/company.js';
import { CHECK_SCHEMA, OUTLINE_SCHEMA, checkPrompt, cleanCheck, cleanOutline, outlinePrompt } from '../../../shared/essay.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const FORMS = new Set(['8-K', '10-Q', '10-K', '6-K', '20-F', 'S-1', 'DEF 14A', 'SC 13D', 'SC 13G', '4']);

export async function range(req: Request): Promise<Response> {
  const u = new URL(req.url);
  const sym = (u.searchParams.get('symbol') ?? '').toUpperCase(), from = u.searchParams.get('from') ?? '', to = u.searchParams.get('to') ?? '';
  const name = (u.searchParams.get('name') ?? '').replace(/[^\w .&-]/g, '').slice(0, 40);
  if (!SYMBOL_RE.test(sym) || !DAY.test(from) || !DAY.test(to)) return json({ error: 'needs symbol, from and to (YYYY-MM-DD)' }, { status: 400 });
  const errors: Record<string, string> = {};
  // Google's before: is exclusive, so ask for one day past the end
  const before = new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);
  const q = encodeURIComponent(`${name ? `"${name}" OR ` : ''}${sym} stock after:${from} before:${before}`);
  let news: { t: number; title: string; url: string; src: string }[] = [];
  try {
    const raw = (await cached(`rn:${sym}:${from}:${to}`, 6 * 3600, () => rssFeed('Google News', `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`))).val;
    const lo = Date.parse(`${from}T00:00:00Z`) - 86400_000, hi = Date.parse(`${before}T00:00:00Z`) + 86400_000;
    const seen = new Set<string>();
    news = raw.filter((x) => x.t >= lo && x.t <= hi).map((x) => ({ t: x.t, title: x.title.replace(/ - [^-]+$/, ''), url: x.url, src: x.title.match(/ - ([^-]+)$/)?.[1]?.trim() ?? 'Google News' }))
      .filter((x) => { const k = x.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.t - b.t).slice(0, 60);
  } catch (e) { errors.news = (e as Error).message.slice(0, 100); }
  let filings: { date: string; form: string; items: string; earnings: boolean; url: string }[] = [];
  if (hasKey('sec')) {
    try {
      const tickers = (await cached('sec:tickers', 86400, async () => parseSecTickers(await secJson('https://www.sec.gov/files/company_tickers.json')))).val;
      const cik = tickers.find((t) => t.ticker === sym)?.cik;
      if (cik) {
        const sub = (await cached(`sub:${cik}`, 6 * 3600, () => secJson(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`))).val;
        const r = sub?.filings?.recent ?? {};
        const n = Array.isArray(r.form) ? r.form.length : 0;
        for (let i = 0; i < n; i++) {
          const d = r.filingDate[i], form = r.form[i];
          if (d < from || d > to || !FORMS.has(form)) continue;
          const acc = String(r.accessionNumber[i]).replace(/-/g, '');
          filings.push({ date: d, form, items: String(r.items?.[i] ?? ''), earnings: form === '8-K' && /2\.02/.test(String(r.items?.[i] ?? '')), url: `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${r.primaryDocument[i]}` });
        }
        filings = filings.filter((f) => f.form !== '4').concat(filings.filter((f) => f.form === '4').slice(0, 8)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
      }
    } catch (e) { errors.filings = (e as Error).message.slice(0, 100); }
  }
  return json({ sym, from, to, news, filings, errors, source: 'Google News search (headlines and links only) and SEC EDGAR filings' }, { sMaxAge: 3600 });
}

const calls = new Map<string, { day: string; n: number }>();
export async function essayai(req: Request): Promise<Response> {
  if (!hasKey('gemini')) return json({ error: 'The AI helper needs GEMINI_API_KEY in Vercel (free at aistudio.google.com).' }, { status: 400 });
  const b = await req.json().catch(() => null);
  const mode = b?.mode === 'check' ? 'check' : 'outline';
  const sym = String(b?.sym ?? '').toUpperCase();
  if (!SYMBOL_RE.test(sym)) return json({ error: 'Pick a ticker for the essay first.' }, { status: 400 });
  const text = typeof b?.text === 'string' ? b.text.slice(0, 12000) : '';
  const facts = Array.isArray(b?.facts) ? b.facts.map((x: unknown) => String(x).slice(0, 400)).slice(0, 20) : [];
  if (mode === 'check' && text.trim().length < 40) return json({ error: 'Write a few sentences with numbers first.' }, { status: 400 });
  const who = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim(), dayKey = new Date().toISOString().slice(0, 10);
  const c = calls.get(who), n = c?.day === dayKey ? c.n : 0;
  if (n >= 60) return json({ error: 'Daily limit reached for the AI helper. It resets at midnight UTC.' }, { status: 429 });
  if (!take('gemini')) return json({ error: 'The free AI quota is busy right now. Try again in a minute.' }, { status: 429 });
  calls.set(who, { day: dayKey, n: n + 1 });
  try {
    if (mode === 'outline') {
      const { data, model } = await geminiJson(outlinePrompt({ sym, title: String(b?.title ?? '').slice(0, 120), text, facts }), OUTLINE_SCHEMA);
      return json({ mode, ...cleanOutline(data), model });
    }
    const { data, model } = await geminiJson(checkPrompt({ sym, text, facts }), CHECK_SCHEMA);
    return json({ mode, ...cleanCheck(data), model });
  } catch (e) { return json({ error: (e as Error).message.slice(0, 200) }, { status: 502 }); }
}
