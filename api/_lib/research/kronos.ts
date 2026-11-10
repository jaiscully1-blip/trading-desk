// GET /api/research?fn=kronos -> published/kronos.json from the daily Kronos GitHub Action (public repo), shape-checked.
// MODEL FORECAST, not data, not advice. Reads a file the Action committed; computes nothing and invents nothing.
import { parseKronos } from '../../../shared/kronos.js';
import { cached, getJson, json } from '../core.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const TOKEN = process.env.GITHUB_TOKEN;
const url = TOKEN ? `https://api.github.com/repos/${REPO}/contents/published/kronos.json` : `https://raw.githubusercontent.com/${REPO}/main/published/kronos.json`;
const init = TOKEN ? { headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github.raw+json', 'x-github-api-version': '2022-11-28' } } : undefined;

export async function GET(): Promise<Response> {
  try {
    const { val } = await cached('kronos', 900, () => getJson(url, 'github', 10000, init));
    const p = parseKronos(val);
    if (!p.ok) return json({ error: `kronos.json is malformed: ${p.error}` }, { status: 502 });
    return json({ file: p.file, repo: REPO, asOf: Date.now() }, { sMaxAge: 900 });
  } catch (e) {
    const m = (e as Error).message;
    if (/HTTP 40[13]/.test(m)) return json({ error: 'Repo is private: add GITHUB_TOKEN in Vercel (fine-grained, this repo, Contents read-only).' });
    if (/404/.test(m)) return json({ error: 'not-run-yet' });
    return json({ error: m }, { status: 502 });
  }
}
