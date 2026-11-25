// GET /api/research?fn=cds[&name=ORACLE CORPORATION] -> the DTCC public CDS tape for the last 5 trading days:
// most-traded single names and sovereigns with their 5-year spread, index CDS (CDX IG/HY, iTraxx), and one name's trades.
// Free, no key. Finished days are cached for a week, today for 15 minutes.
import { inflateRawSync } from 'node:zlib';
import { cdsTrades, parseCsv, resolveAmbiguous, summarize, type CdsTrade } from '../../../shared/cds.js';
import { cached, json, noteError, noteOk, take } from '../core.js';

/** First file in a zip archive (central directory read, deflate or stored). */
export function unzipFirst(buf: Buffer): string {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const cd = buf.readUInt32LE(e + 16);
  const method = buf.readUInt16LE(cd + 10), size = buf.readUInt32LE(cd + 20), local = buf.readUInt32LE(cd + 42);
  const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const data = buf.subarray(start, start + size);
  return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
}

const etDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ms);
function lastDays(n: number, now = Date.now()): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < n && i < 12; i++) { const d = etDay(now - i * 86400_000); const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); if (wd > 0 && wd < 6) out.push(d); }
  return out;
}

async function dayFile(side: 'sec' | 'cftc', day: string): Promise<CdsTrade[]> {
  const today = day === etDay(Date.now());
  const { val } = await cached(`cds:${side}:${day}`, today ? 900 : 7 * 86400, async () => {
    if (!take('dtcc')) throw new Error('rate limited');
    const f = `${side.toUpperCase()}_CUMULATIVE_CREDITS_${day.replace(/-/g, '_')}.zip`;
    const r = await fetch(`https://pddata.dtcc.com/ppd/api/report/cumulative/${side}/${f}`, { headers: { 'user-agent': 'trade-desk-research/0.1 (personal project)' } });
    if (r.status === 404) return [];
    if (!r.ok) { noteError('dtcc', `HTTP ${r.status}`); throw new Error(`DTCC HTTP ${r.status}`); }
    noteOk('dtcc');
    return resolveAmbiguous(cdsTrades(parseCsv(unzipFirst(Buffer.from(await r.arrayBuffer())))));
  });
  return val;
}

export async function cds(req: Request): Promise<Response> {
  const name = (new URL(req.url).searchParams.get('name') ?? '').trim().toUpperCase().slice(0, 80);
  const days = lastDays(5), errors: string[] = [];
  const all = (await Promise.all(days.flatMap((d) => (['sec', 'cftc'] as const).map((s) => dayFile(s, d).catch((e) => { errors.push(`${s} ${d}: ${(e as Error).message}`); return [] as CdsTrade[]; }))))).flat().sort((a, b) => a.t - b.t);
  const sums = summarize(all);
  const pick = name ? all.filter((t) => t.name === name) : [];
  return json({
    days, trades: all.length,
    singles: sums.filter((s) => s.kind === 'single').slice(0, 60),
    sovs: sums.filter((s) => s.kind === 'sov').slice(0, 25),
    indexes: sums.filter((s) => s.kind === 'index').slice(0, 20),
    names: sums.map((s) => s.name),
    name: name || undefined, detail: pick.slice(-300),
    errors, asOf: Date.now(),
    source: 'DTCC public swap data (pddata.dtcc.com): SEC security-based swaps (single-name CDS) and CFTC swaps (index CDS), anonymized, sizes capped',
  }, { sMaxAge: 600 });
}
