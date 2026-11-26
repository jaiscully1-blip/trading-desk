// DTCC Trade Information Warehouse public activity files (free, on dtcc.com/repository-otc-data): how actively CDS on each
// name trades. Two Excel files: a quarterly one (dealers, average daily notional, trades a day, per reference entity) and a
// six-month "Top 1,000 single names" one (average weekly notional and trades, plus the last 8 weeks). These are trading
// activity, NOT protection outstanding (DTCC's gross / net positions are in its paid CDS Kinetics service). Pure + tested.

/** Rows of an Excel sheet (sheet XML + shared strings XML) as arrays indexed by column letter A=0, B=1... */
export function xlsxRows(sheetXml: string, sharedXml: string): string[][] {
  const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const ss = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc(m[1].replace(/<[^>]+>/g, '')));
  const col = (ref: string) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [...sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) => {
    const out: string[] = [];
    for (const c of m[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)/.exec(c[1])?.[1]; if (!ref) continue;
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] ?? '')?.[1] ?? '';
      out[col(ref)] = /t="s"/.test(c[1]) && v !== '' ? ss[Number(v)] ?? '' : unesc(v);
    }
    return Array.from(out, (x) => x ?? '');
  });
}

/** Same entity spelled differently on the tape and in DTCC's files ("Federative Republic of Brazil" / "FEDERATIVE REPUBLIC OF BRAZIL"). */
export const tiwKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export interface TiwQuarter { name: string; region: string; inIndex: boolean; dealers: number; notionalDay: number; tradesDay: number }
export interface TiwSixMonth { name: string; sector: string; type: string; notionalWeek: number; tradesWeek: number; notional8w: number; trades8w: number; recentVsAvg: number | null }

const n = (s: string | undefined) => { const v = Number(String(s ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : NaN; };
/** The header row (the one whose first cell names the entity column) and the data rows under it. */
function table(rows: string[][]): { head: string[]; body: string[][] } | null {
  const i = rows.findIndex((r) => /^REF(ERENCE)? ENTITY$/i.test((r[0] ?? '').trim()));
  if (i < 0) return null;
  return { head: rows[i].map((h) => h.trim().toUpperCase()), body: rows.slice(i + 1).filter((r) => (r[0] ?? '').trim()) };
}

/** Quarterly file: columns REFERENCE ENTITY, REGION, INDEX CONSTITUENT, (total) CLEARING DEALERS, (avg monthly) CLEARING
 *  DEALERS, (avg daily) NOTIONAL, TRADES/DAY. The first "CLEARING DEALERS" column is the total in the quarter. */
export function parseQuarter(rows: string[][]): TiwQuarter[] {
  const t = table(rows); if (!t) return [];
  const at = (re: RegExp) => t.head.findIndex((h) => re.test(h));
  const reg = at(/^REGION$/), idx = at(/INDEX CONSTITUENT/), dl = at(/CLEARING DEALERS/), nt = at(/NOTIONAL/), td = at(/TRADES\/DAY/);
  if ([reg, dl, nt, td].some((x) => x < 0)) return [];
  return t.body.map((r) => ({ name: r[0].trim(), region: (r[reg] ?? '').trim(), inIndex: (r[idx] ?? '').trim().toUpperCase() === 'Y', dealers: n(r[dl]), notionalDay: n(r[nt]), tradesDay: n(r[td]) }))
    .filter((x) => Number.isFinite(x.notionalDay));
}

/** Six-month file: average weekly notional and trades, and the 8 weeks before the file's end. recentVsAvg = last 8 weeks'
 *  weekly pace / the six-month weekly average (1.5 = trading 50% more than usual lately). */
export function parseSixMonth(rows: string[][]): TiwSixMonth[] {
  const t = table(rows); if (!t) return [];
  const at = (re: RegExp) => t.head.findIndex((h) => re.test(h));
  const sec = at(/^SECTOR$/), ty = at(/MARKET TYPE/), nw = at(/AVERAGE WEEKLY NOTIONAL/), tw = at(/TRADES\/WEEK/), n8 = at(/NOTIONAL TRADED IN PRIOR 8/), c8 = at(/CONTRACTS TRADED IN PRIOR 8/);
  if ([nw, tw, n8].some((x) => x < 0)) return [];
  return t.body.map((r) => {
    const notionalWeek = n(r[nw]), notional8w = n(r[n8]);
    return { name: r[0].trim(), sector: (r[sec] ?? '').trim(), type: (r[ty] ?? '').trim(), notionalWeek, tradesWeek: n(r[tw]), notional8w, trades8w: n(r[c8]), recentVsAvg: notionalWeek > 0 && Number.isFinite(notional8w) ? Math.round((notional8w / 8 / notionalWeek) * 100) / 100 : null };
  }).filter((x) => Number.isFinite(x.notionalWeek));
}

/** Newest quarterly and six-month single-name file links on DTCC's page (their URLs carry a random id, so they are found,
 *  not built). The page embeds the links in JSON, so quotes may be escaped. */
export function tiwLinks(html: string): { quarter?: { url: string; label: string }; sixMonth?: { url: string; label: string } } {
  const s = html.replace(/\\+u003c/g, '<').replace(/\\+u003e/g, '>').replace(/\\+"/g, '"').replace(/\\+\//g, '/');
  const links = [...s.matchAll(/href="(https:\/\/files\.dtcc\.com\/download\/assets\/[^"]+)"[^>]*>([^<]{0,120})/g)].map((m) => ({ url: m[1], label: m[2].trim() }));
  // quarterly: Final-Single-Name-Q<q>-<year>; six-month: the Top 1,000 analysis (filed under "Index-Roll-Report-<dd-Mon-yy>-through-...")
  const qKey = (u: string) => { const m = /Single-Name-Q(\d)-(\d{4})/.exec(u); return m ? Number(m[2]) * 10 + Number(m[1]) : 0; };
  const quarter = links.filter((l) => qKey(l.url) > 0).sort((a, b) => qKey(b.url) - qKey(a.url))[0];
  const sixMonth = links.find((l) => /Index-Roll-Report-/i.test(l.url) && /Top 1,?000 Single Names/i.test(l.label));
  return { quarter, sixMonth };
}
