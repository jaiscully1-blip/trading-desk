// Nightly patent check for the tickers in patents/tickers.txt. Runs the same code as the desk's Patents section and theme
// radar (so the numbers match), adds this week's counts and quiet notes, and writes published/patents.json.
// Run by .github/workflows/patents.yml, or by hand:
//   USPTO_API_KEY=... SEC_USER_AGENT="app contact@example.com" npx --yes tsx@4.19.2 scripts/patents-build.ts
// Optional: FINNHUB_API_KEY (peers). Free official data (USPTO, SEC, FDA file). Information only; nothing here can trade.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { odp, patentradar, patents } from '../api/_lib/research/patents.js';
import { countOf, ownerQ } from '../shared/patents.js';
import { radarBody } from '../shared/patentRadar.js';
import { buildNotes, lastWeek, parseTickerList, type PatentsNightFile, type TickerNight } from '../shared/patentNotes.js';

if (!process.env.USPTO_API_KEY || !process.env.SEC_USER_AGENT) { console.error('Set USPTO_API_KEY and SEC_USER_AGENT.'); process.exit(1); }
const OUT = 'published/patents.json';
const prev: PatentsNightFile | null = existsSync(OUT) ? (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return null; } })() : null;
const list = parseTickerList(readFileSync('patents/tickers.txt', 'utf8'));
const week = lastWeek(new Date());
const out: PatentsNightFile = { schema: 1, asOf: new Date().toISOString(), tickers: {}, patents: {}, radar: null, errors: {} };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const sym of list) {
  await pause(1500); // SEC asks for at most 10 requests a second; each ticker makes a burst of them
  try {
    let r: any = null;
    for (let i = 0; i < 15 && !r?.complete; i++) r = await (await patents(new Request(`https://desk/api/research?fn=patents&symbol=${sym}&live=1`))).json();
    if (!r || r.error || r.needsKey) throw new Error(r?.error ?? 'no answer');
    if (!r.complete) out.errors[sym] = 'counts not complete';
    const q = ownerQ(r.names);
    const published = countOf(await odp(radarBody(q, 'published', week)));
    const granted = countOf(await odp(radarBody(q, 'granted', week)));
    const p = prev?.tickers?.[sym] ?? null;
    const rows: any[] = r.latest ?? [];
    const recentAreas = rows.filter((x) => x.published && x.published >= week.from && x.published <= week.to).flatMap((x) => x.areas ?? []);
    const cur = { week: { published, granted, ...week }, trendWord: r.trend?.word ?? null, trendPct: r.trend?.pct ?? null, recentAreas };
    const t: TickerNight = { sym, name: r.name, names: r.names, week: cur.week, trendWord: cur.trendWord, trendPct: cur.trendPct,
      areasSeen: [...new Set([...(p?.areasSeen ?? []), ...rows.flatMap((x) => x.areas ?? [])])], notes: buildNotes(cur, p) };
    out.tickers[sym] = t;
    out.patents[sym] = r;
    console.log(`${sym}: ${published} made public, ${granted} granted this week; ${t.notes.length} notes`);
  } catch (e) {
    out.errors[sym] = String((e as Error).message).slice(0, 160); console.error(sym, out.errors[sym]);
    // keep the last good data for this ticker rather than saving nothing (or zeros); the notes say it was not checked
    if (prev?.tickers?.[sym] && prev.patents?.[sym]) { out.tickers[sym] = { ...prev.tickers[sym], notes: [] }; out.patents[sym] = prev.patents[sym]; }
  }
}

try {
  let r: any = null;
  for (let i = 0; i < 15 && !r?.complete && !r?.unavailable; i++) r = await (await patentradar(new Request('https://desk/api/research?fn=patentradar&live=1'))).json();
  out.radar = r;
} catch (e) { out.errors.radar = String((e as Error).message).slice(0, 160); }

if (!Object.keys(out.tickers).length) { console.error('No ticker finished; keeping the previous file.', out.errors); process.exit(1); }
mkdirSync('published', { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`patents.json: ${Object.keys(out.tickers).length} tickers, radar ${out.radar ? 'yes' : 'no'}, errors ${JSON.stringify(out.errors)}`);
