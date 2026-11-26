// GET /api/research?fn=cdsactivity -> how actively CDS on each name trades, from DTCC's free Trade Information Warehouse
// files: the newest quarterly single-name file (dealers, average daily notional, trades a day) and the six-month Top 1,000
// file (average weekly notional, last 8 weeks vs that average). Trading activity, not protection outstanding (DTCC's
// gross / net positions are paid). Files change quarterly: cached a day, the page itself is re-read daily for new links.
import { parseQuarter, parseSixMonth, tiwKey, tiwLinks, xlsxRows } from '../../../shared/tiw.js';
import { cached, json, noteError, noteOk, take } from '../core.js';
import { unzipFile } from './cds.js';

const UA = { 'user-agent': 'Mozilla/5.0 (trade-desk-research; personal project)' };
async function get(url: string): Promise<Buffer> {
  if (!take('dtcc')) throw new Error('rate limited');
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) { noteError('dtcc', `HTTP ${r.status}`); throw new Error(`DTCC HTTP ${r.status}`); }
  noteOk('dtcc');
  return Buffer.from(await r.arrayBuffer());
}
const sheet = (b: Buffer) => xlsxRows(unzipFile(b, 'xl/worksheets/sheet1.xml'), unzipFile(b, 'xl/sharedStrings.xml'));

export async function cdsactivity(): Promise<Response> {
  const { val, stale } = await cached('cds:tiw', 86400, async () => {
    const links = tiwLinks((await get('https://www.dtcc.com/repository-otc-data')).toString('utf8'));
    if (!links.quarter && !links.sixMonth) throw new Error('DTCC page changed: no activity files found');
    const errors: string[] = [];
    const [q, s] = await Promise.all([
      links.quarter ? get(links.quarter.url).then((b) => parseQuarter(sheet(b))).catch((e) => { errors.push(`quarterly: ${(e as Error).message}`); return []; }) : [],
      links.sixMonth ? get(links.sixMonth.url).then((b) => parseSixMonth(sheet(b))).catch((e) => { errors.push(`six-month: ${(e as Error).message}`); return []; }) : [],
    ]);
    if (!q.length && !s.length) throw new Error(errors.join('; ') || 'DTCC files empty');
    // compact rows keyed by a spelling-proof name, so the tape can look any name up
    const quarter = Object.fromEntries(q.map((x) => [tiwKey(x.name), [x.dealers, x.notionalDay, x.tradesDay, x.inIndex ? 1 : 0]]));
    const six = Object.fromEntries(s.map((x) => [tiwKey(x.name), [x.notionalWeek, x.tradesWeek, x.recentVsAvg]]));
    // names trading clearly above (>= 1.25x) / below (<= 0.8x) their usual pace lately (at least $100M a week on average, so tiny names don't dominate)
    const big = s.filter((x) => x.recentVsAvg != null && x.notionalWeek >= 100e6);
    const pickUp = big.filter((x) => x.recentVsAvg! >= 1.25).sort((a, b) => b.recentVsAvg! - a.recentVsAvg!).slice(0, 8).map((x) => ({ name: x.name, ratio: x.recentVsAvg, week: x.notionalWeek }));
    const slowDown = big.filter((x) => x.recentVsAvg! <= 0.8).sort((a, b) => a.recentVsAvg! - b.recentVsAvg!).slice(0, 8).map((x) => ({ name: x.name, ratio: x.recentVsAvg, week: x.notionalWeek }));
    return { quarter, six, quarterLabel: links.quarter?.label ?? null, sixLabel: links.sixMonth?.label ?? null, quarterUrl: links.quarter?.url ?? null, sixUrl: links.sixMonth?.url ?? null, pickUp, slowDown, errors, asOf: Date.now() };
  });
  return json({ ...val, stale, source: "DTCC Trade Information Warehouse public activity reports (dtcc.com/repository-otc-data): trading activity per name, not protection outstanding" }, { sMaxAge: 3600 });
}
