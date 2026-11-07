// GET /api/research?fn=agents[&ticker=NVDA] -> TradingAgents results the GitHub Action saved in agents/out/ (public repo).
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const raw = (p: string) => `https://raw.githubusercontent.com/${REPO}/main/agents/out/${p}`;

export async function GET(req: Request): Promise<Response> {
  const t = (new URL(req.url).searchParams.get('ticker') ?? '').toUpperCase();
  try {
    if (t) {
      if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(t)) return json({ error: 'bad ticker' }, { status: 400 });
      const { val } = await cached(`ta:${t}`, 600, () => getJson(raw(`${t}.json`), 'github', 8000));
      return json(val, { sMaxAge: 600 });
    }
    const { val } = await cached('ta:index', 600, () => getJson(raw('index.json'), 'github', 8000));
    return json({ items: val, repo: REPO, asOf: Date.now() }, { sMaxAge: 600 });
  } catch (e) {
    const m = (e as Error).message;
    // 404 = the Action hasn't run yet
    return json({ items: [], repo: REPO, error: /404/.test(m) ? 'not-run-yet' : m }, { status: /404/.test(m) ? 200 : 502 });
  }
}
