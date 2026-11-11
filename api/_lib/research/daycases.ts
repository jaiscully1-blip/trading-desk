// GET /api/research?fn=daycases -> published/daycases.json from the Day cases GitHub Action (public repo), shape-checked.
// CALCULATED historical base rates and a special-days calendar. Not a forecast, not advice; nothing here can trade.
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const TOKEN = process.env.GITHUB_TOKEN;
const url = TOKEN ? `https://api.github.com/repos/${REPO}/contents/published/daycases.json` : `https://raw.githubusercontent.com/${REPO}/main/published/daycases.json`;
const init = TOKEN ? { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' } } : undefined;

export async function GET(): Promise<Response> {
  try {
    // local dev (npm run dev) reads the file the script just wrote; Vercel reads the one the Action committed
    const local = process.env.VERCEL ? null : await import('node:fs').then((fs) => JSON.parse(fs.readFileSync('published/daycases.json', 'utf8'))).catch(() => null);
    const val = local ?? (await cached('daycases', 600, () => getJson(url, 'github', 10000, init))).val;
    if (val?.version !== 1 || !Array.isArray(val.indexes) || !Array.isArray(val.upcoming)) return json({ error: 'daycases.json is malformed' }, { status: 502 });
    return json({ file: val, asOf: Date.now() }, { sMaxAge: 600 });
  } catch (e) {
    const m = (e as Error).message;
    if (/404/.test(m)) return json({ error: 'not-run-yet' });
    if (/HTTP 40[13]/.test(m)) return json({ error: 'Repo is private: add GITHUB_TOKEN in Vercel (Contents read-only).' });
    return json({ error: m.slice(0, 160) }, { status: 502 });
  }
}
