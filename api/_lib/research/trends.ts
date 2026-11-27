// GET /api/research?fn=trends -> the Global trends page: spreading trends, each country's charts and what is new there this
// week, worldwide lists (AI models, GitHub, launches) and Wikipedia's most-read pages, from published/trends.json (built
// nightly by .github/workflows/trends.yml). Research, not advice.
import { summarize, type TrendDb } from '../../../shared/globaltrends.js';
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
async function trendsFile(): Promise<TrendDb | null> {
  if (!process.env.VERCEL) { try { const fs = await import('node:fs'); return JSON.parse(fs.readFileSync('published/trends.json', 'utf8')); } catch { /* fall through */ } }
  try { return (await cached('trends:file', 1800, () => getJson(`https://raw.githubusercontent.com/${REPO}/main/published/trends.json`, 'github', 15000))).val as TrendDb; } catch { return null; }
}

export async function trends(): Promise<Response> {
  const f = await trendsFile();
  if (!f?.updated) return json({ error: 'not-run-yet' });
  const { val } = await cached(`trends:sum:${f.updated}:${f.nights.length}`, 3600, async () => summarize(f));
  return json({ ...val, errors: f.errors, source: 'Nightly from Apple app charts, Wikipedia (Wikimedia), Steam, Spotify charts via Kworb (unofficial), Hugging Face, GitHub, Product Hunt and SEC Form D' }, { sMaxAge: 1800 });
}
