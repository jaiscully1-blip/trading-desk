// Build rules (RULES.md, "Build rules"). Runs before every build and test; any failure stops the deploy.
// Usage: node scripts/rules-check.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p]; });
const code = (d) => walk(join(root, d)).filter((p) => /\.(ts|tsx|mjs|js)$/.test(p));
const fails = [];
const fail = (rule, where) => fails.push(`${rule}\n    ${where}`);
const scan = (files, re, rule, skip = () => false) => {
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (re.test(l) && !skip(l, f)) fail(rule, `${relative(root, f)}:${i + 1}  ${l.trim().slice(0, 140)}`); });
  }
};
const src = code('src'), api = code('api'), shared = code('shared');

// 1. Keys never ship to the browser: no env reads, no key-looking literals in browser code
scan(src, /process\.env|import\.meta\.env\.(?!VITE_(SUPABASE_URL|SUPABASE_ANON_KEY|POSTHOG_KEY|POSTHOG_HOST)\b|MODE|DEV|PROD|BASE_URL)/, 'R1 browser code reads a secret from the environment');
scan([...src, ...api, ...shared], /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{30,}|(api[_-]?key|apikey|token|secret)\s*[:=]\s*['"][A-Za-z0-9_-]{24,}['"])/i, 'R1 something that looks like a hard-coded key or token');

// 2. Every provider call goes through /api (adapters, rate limits, cache): browser code never calls data APIs directly
scan(src, /fetch\(\s*[`'"]https?:\/\//, 'R2 browser code fetches a third-party URL directly (go through /api)');
// 3. Browser code never imports server code
scan(src, /from ['"](\.\.\/)+api\//, 'R3 browser code imports from api/');

// 4. Vercel Hobby allows 12 serverless functions: new endpoints go through api/research.ts ?fn=
const fns = readdirSync(join(root, 'api')).filter((f) => /\.(ts|js)$/.test(f));
if (fns.length > 12) fail('R4 more than 12 serverless functions (Vercel Hobby cap)', fns.join(', '));

// 5. Every rate-limited provider has a free-tier limit recorded
const core = readFileSync(join(root, 'api/_lib/core.ts'), 'utf8');
const union = core.match(/export type Provider =([^;]+);/)?.[1].match(/'([a-z]+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
const limits = core.slice(core.indexOf('const LIMITS'));
for (const p of union) if (!new RegExp(`\\b${p}: \\{ perMin`).test(limits)) fail('R5 provider has no rate limit entry', p);

// 6. The desk never places orders (until the AI-bot switch ships behind its own limits, see RULES.md "Bot policy")
scan([...src, ...api, ...shared], /\/v2\/orders|placeOrder\s*\(|submitOrder\s*\(|\/trade\/order/i, 'R6 order-placing code found (the bot policy is still pending)', (_l, f) => f.includes('/api/_lib/bot/'));

// 7. Sample data is always labeled: demo generators live in src/lib/demo* or are named demo*/sample*
for (const f of src) {
  const t = readFileSync(f, 'utf8');
  if (/Math\.random\(\)/.test(t) && !/demo|sample|uid|jitter|Math\.random\(\)\.toString\(36\)/i.test(t)) fail('R7 random numbers outside demo/sample code (never fake data)', relative(root, f));
}

if (fails.length) {
  console.error(`rules-check: ${fails.length} rule${fails.length === 1 ? '' : 's'} broken (see RULES.md)\n  - ${fails.join('\n  - ')}`);
  process.exit(1);
}
console.log(`rules-check: ok (${src.length + api.length + shared.length} files, ${fns.length}/12 functions, ${union.length} providers)`);
