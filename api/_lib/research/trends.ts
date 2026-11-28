// GET /api/research?fn=trends -> the Global trends page: spreading trends, each country's charts and what is new there this
// week, worldwide lists (AI models, GitHub, launches) and Wikipedia's most-read pages, from published/trends.json (built
// nightly by .github/workflows/trends.yml). Research, not advice.
import { COUNTRIES, summarize, type TrendDb } from '../../../shared/globaltrends.js';
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
async function trendsFile(): Promise<TrendDb | null> {
  if (!process.env.VERCEL) { try { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync('published/trends.json', 'utf8')); } catch { /* fall through */ } }
  try { return (await cached('trends:file', 1800, () => getJson(`https://raw.githubusercontent.com/${REPO}/main/published/trends.json`, 'github', 15000))).val as TrendDb; } catch { return null; }
}

//   fn=trends          the page, with each country's tile but not its chart lists (160+ countries would be too heavy)
//   fn=trends&cc=jp    one country's chart lists and what is new there
//   fn=trends&part=bans  ban headlines and US recalls (their links are long, so they load with that tab)
export async function trends(req: Request): Promise<Response> {
  const cc = (new URL(req.url).searchParams.get('cc') ?? '').toLowerCase();
  const f = await trendsFile();
  if (!f?.updated) return json({ error: 'not-run-yet' });
  if (new URL(req.url).searchParams.get('part') === 'bans') {
    const { val } = await cached(`trends:bans:${f.updated}:${f.nights.length}`, 3600, async () => { const x = summarize(f, 10, () => false); return { bans: x.bans, recalls: x.recalls }; });
    return json({ ...val, updated: f.updated }, { sMaxAge: 1800 });
  }
  if (cc) {
    if (!COUNTRIES.some((c) => c.cc === cc)) return json({ error: 'unknown country' }, { status: 400 });
    const { val } = await cached(`trends:cc:${cc}:${f.updated}:${f.nights.length}`, 3600, async () => summarize(f, 10, (x) => x === cc).countries.find((c) => c.cc === cc)!);
    return json({ country: val, updated: f.updated }, { sMaxAge: 1800 });
  }
  const { val } = await cached(`trends:sum:${f.updated}:${f.nights.length}`, 3600, async () => summarize(f, 10, () => false));
  const lite = { ...val, bans: [], recalls: [] }; // loaded with the Bans tab
  return json({ ...lite, errors: f.errors, source: 'Nightly from Apple app charts, Wikipedia (Wikimedia), Steam, Spotify charts via Kworb (unofficial), Hugging Face, GitHub, Product Hunt and SEC Form D' }, { sMaxAge: 1800 });
}
