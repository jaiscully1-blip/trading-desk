// GET /api/research?fn=names|earnings|company-news|company|feed&...  One function for the research endpoints, because Vercel's
// Hobby plan allows at most 12 serverless functions per deployment.
import { GET as names } from './_lib/research/names.js';
import { GET as earnings } from './_lib/research/earnings.js';
import { GET as companyNews } from './_lib/research/company-news.js';
import { GET as company } from './_lib/research/company.js';
import { GET as feed } from './_lib/research/feed.js';
import { json } from './_lib/core.js';

// Reading a 10-K + one Gemini call can take ~20-40 s the first time (cached after that)
export const maxDuration = 60;

const ROUTES: Record<string, (req: Request) => Promise<Response>> = { names, earnings, 'company-news': companyNews, company, feed };
export async function GET(req: Request): Promise<Response> {
  const fn = new URL(req.url).searchParams.get('fn') ?? '';
  const h = ROUTES[fn];
  return h ? h(req) : json({ error: `unknown fn; use one of ${Object.keys(ROUTES).join(', ')}` }, { status: 404 });
}
