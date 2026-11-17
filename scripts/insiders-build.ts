// Market-wide insider activity. Reads SEC's daily index of Form 4 filings, opens each filing, keeps open-market buys (P) and larger
// sales (S), and writes published/insiders.json (45 days of rows, merged run to run) plus FINRA's latest daily short-sale volume.
// Run by .github/workflows/insiders.yml, or by hand:
//   SEC_USER_AGENT="your-app contact@example.com" npx --yes tsx@4.19.2 scripts/insiders-build.ts
// Optional: MAX_FILINGS=300 (quick test), BACK_DAYS=7 (how far back a first run reaches). Free sources only. Nothing here can trade.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { issuerOf, parseForm4 } from '../shared/insider.js';
import { mergeRows, toRow, type InsidersFile, type Row, type ShortRow } from '../shared/insiderMarket.js';

const UA = process.env.SEC_USER_AGENT;
if (!UA) { console.error('Set SEC_USER_AGENT (an app name and a contact email, as SEC asks).'); process.exit(1); }
const MAX = Number(process.env.MAX_FILINGS) || 9000;
const BACK = Number(process.env.BACK_DAYS) || 7;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let next = 0;
async function get(url: string, headers: Record<string, string> = { 'user-agent': UA! }): Promise<string | null> {
  const wait = next - Date.now(); next = Math.max(Date.now(), next) + 170; if (wait > 0) await sleep(wait); // SEC fair access: about 6 a second
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { headers: { ...headers, 'accept-encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(40000) }).catch((e) => e as Error);
    if (r instanceof Error) { await sleep(1500); continue; }
    if (r.status === 404) return null;
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`);
    return r.text();
  }
  throw new Error(`gave up ${url.slice(0, 80)}`);
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const errors: Record<string, string> = {};
const prev: InsidersFile | null = existsSync('published/insiders.json') ? (() => { try { return JSON.parse(readFileSync('published/insiders.json', 'utf8')); } catch { return null; } })() : null;
const done = new Set<string>(prev?.days ?? []);
const today = ymd(new Date());

// business days to read, oldest first (yesterday and earlier: the day's index is complete once the day is over)
const want: string[] = [];
for (let i = BACK; i >= 1; i--) { const d = new Date(Date.now() - i * 86400_000); if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; const s = ymd(d); if (!done.has(s)) want.push(s); }

const rows: Row[] = []; let opened = 0; const finished: string[] = [];
for (const day of want) {
  const [y, m, d] = day.split('-'); const q = Math.ceil(Number(m) / 3);
  let idx: string | null = null;
  try { idx = await get(`https://www.sec.gov/Archives/edgar/daily-index/${y}/QTR${q}/form.${y}${m}${d}.idx`); } catch (e) { errors[day] = (e as Error).message.slice(0, 100); continue; }
  if (idx == null) { finished.push(day); continue; } // weekend/holiday: no index
  const accs = new Map<string, string>();
  for (const line of idx.split('\n')) { const mm = /^4\s{2,}.+?\s{2,}\d+\s+\d{8}\s+(edgar\/data\/\d+\/(\d{10}-\d{2}-\d{6})\.txt)\s*$/.exec(line); if (mm && !accs.has(mm[2])) accs.set(mm[2], mm[1]); }
  console.log(day, 'Form 4 filings:', accs.size);
  let all = true;
  for (const [, path] of accs) {
    if (opened >= MAX) { all = false; break; }
    opened++;
    try {
      const url = `https://www.sec.gov/Archives/${path}`; const txt = await get(url); if (!txt) continue;
      const iss = issuerOf(txt);
      for (const t of parseForm4(txt, day, url)) { const r = toRow(t, { sym: iss.sym, name: iss.name, plan: iss.plan }); if (r) rows.push(r); }
    } catch (e) { errors[path.slice(-24)] = (e as Error).message.slice(0, 80); }
  }
  if (all) finished.push(day); else { console.log('cap reached, continuing next run'); break; }
}

// FINRA daily short-sale volume (NOT short interest: it includes market makers' intraday trading), latest available day
let shortVol: InsidersFile['shortVol'] = prev?.shortVol ?? null;
for (let i = 1; i <= 6; i++) {
  const d = new Date(Date.now() - i * 86400_000); const s = ymd(d).replace(/-/g, '');
  try {
    const t = await get(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${s}.txt`, { 'user-agent': UA! });
    if (!t) continue;
    const list: ShortRow[] = [];
    for (const line of t.split('\n').slice(1)) { const c = line.split('|'); const vol = Number(c[4]), sh = Number(c[2]); if (c.length >= 5 && /^[A-Z]{1,5}$/.test(c[1]) && vol >= 1_000_000 && sh >= 0) list.push({ sym: c[1], ratio: sh / vol, vol }); }
    shortVol = { date: ymd(d), rows: list.sort((a, b) => b.ratio - a.ratio).slice(0, 40) };
    break;
  } catch (e) { errors.shortVol = (e as Error).message.slice(0, 100); }
}

const file: InsidersFile = {
  built: new Date().toISOString(), days: [...new Set([...done, ...finished])].sort().slice(-60), rows: mergeRows(prev?.rows ?? [], rows, today),
  shortVol, errors, source: 'SEC EDGAR Form 4 (daily index, each filing opened); FINRA daily short-sale volume',
};
mkdirSync('published', { recursive: true });
writeFileSync('published/insiders.json', JSON.stringify(file));
console.log(`wrote published/insiders.json: ${file.rows.length} rows, ${finished.length} new days, ${opened} filings opened, ${Object.keys(errors).length} errors`);
