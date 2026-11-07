// GET /api/research?fn=agents[&ticker=NVDA] -> TradingAgents results the GitHub Action saved in agents/out/ (public repo).
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
// Public repo: read the raw file. Private repo: GITHUB_TOKEN (fine-grained, this repo only, Contents: read-only).
const TOKEN = process.env.GITHUB_TOKEN;
const raw = (p: string) => (TOKEN ? `https://api.github.com/repos/${REPO}/contents/agents/out/${p}` : `https://raw.githubusercontent.com/${REPO}/main/agents/out/${p}`);
const gh = (p: string) => getJson(raw(p), 'github', 8000, TOKEN ? { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' } } : undefined);

export async function GET(req: Request): Promise<Response> {
  const t = (new URL(req.url).searchParams.get('ticker') ?? '').toUpperCase();
  try {
    if (t) {
      if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(t)) return json({ error: 'bad ticker' }, { status: 400 });
      const { val } = await cached(`ta:${t}`, 600, () => gh(`${t}.json`));
      return json(val, { sMaxAge: 600 });
    }
    const { val } = await cached('ta:index', 600, () => gh('index.json'));
    return json({ items: val, repo: REPO, asOf: Date.now() }, { sMaxAge: 600 });
  } catch (e) {
    const m = (e as Error).message;
    // 404 = the Action hasn't run yet (or the repo went private without a GITHUB_TOKEN)
    if (/HTTP 40[13]/.test(m)) return json({ items: [], repo: REPO, error: 'Repo is private: add GITHUB_TOKEN in Vercel (fine-grained, this repo, Contents read-only).' }, { status: 200 });
    return json({ items: [], repo: REPO, error: /404/.test(m) ? 'not-run-yet' : m }, { status: /404/.test(m) ? 200 : 502 });
  }
}
