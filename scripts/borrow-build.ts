// Daily borrow snapshot from Interactive Brokers' public short-stock file (anonymous FTP, free):
//   published/borrow-latest.json  every US stock: [fee %, rebate %, shares available] plus the 40 costliest to borrow
//   published/borrow-hist.json    fee % per day (~6 months) for S&P 500 / Nasdaq-100 names and the costliest 200 that day
// Run by .github/workflows/altdata.yml (needs curl). Locally: npx tsx scripts/borrow-build.ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseIbBorrow } from '../shared/plumbing';
import { COMPANIES } from '../shared/data/companies';

const txt = execFileSync('curl', ['-s', '-m', '120', 'ftp://shortstock:@ftp2.interactivebrokers.com/usa.txt'], { maxBuffer: 64 * 1024 * 1024 }).toString('latin1');
const rows = parseIbBorrow(txt);
const n = Object.keys(rows).length;
if (n < 1000) { console.error(`borrow: only ${n} rows, not saving`); process.exit(0); }
const date = /#BOF\|(\d{4})\.(\d{2})\.(\d{2})/.exec(txt)?.slice(1).join('-') ?? new Date().toISOString().slice(0, 10);
const top = Object.entries(rows).filter(([, r]) => r[2] > 0).sort((a, b) => b[1][0] - a[1][0]).slice(0, 40).map(([sym, r]) => ({ sym, fee: r[0], available: r[2] }));
writeFileSync('published/borrow-latest.json', JSON.stringify({ date, source: 'Interactive Brokers short stock availability file (public, updated through the day)', rows, top }));

const HIST = 'published/borrow-hist.json';
const hist: { days: Record<string, Record<string, number>> } = existsSync(HIST) ? JSON.parse(readFileSync(HIST, 'utf8')) : { days: {} };
const keep = new Set([...COMPANIES.map((c) => c[0]), ...Object.entries(rows).sort((a, b) => b[1][0] - a[1][0]).slice(0, 200).map(([s]) => s)]);
hist.days[date] = Object.fromEntries([...keep].filter((s) => rows[s]).map((s) => [s, rows[s][0]]));
const cut = new Date(Date.parse(date) - 185 * 86400_000).toISOString().slice(0, 10);
for (const d of Object.keys(hist.days)) if (d < cut) delete hist.days[d];
writeFileSync(HIST, JSON.stringify(hist));
console.log(`borrow ${date}: ${n} US stocks, tracked ${Object.keys(hist.days[date]).length}, costliest ${top.slice(0, 3).map((t) => `${t.sym} ${t.fee}%`).join(', ')}`);
