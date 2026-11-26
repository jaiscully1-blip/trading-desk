// FDA Orange Book: which patents cover approved (brand, NDA) drugs, and when they expire. Free FDA download, tilde-delimited
// (headers checked 2026-11-25: patent.txt Appl_Type~Appl_No~Product_No~Patent_No~Patent_Expire_Date_Text~...;
// products.txt Ingredient~DF;Route~Trade_Name~Applicant~...~Appl_Type~Appl_No~Product_No~...~Applicant_Full_Name).
// A listed patent is hard evidence the technology is in a marketed drug. Pure + tested.

export interface ObRow { p: string; e: string | null; t: string; i: string; a: string }
export interface ObFile { schema: 1; asOf: string; source: string; rows: ObRow[] }

const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
/** "Aug 24, 2026" -> "2026-08-24" (null if it is not a date). */
export function obDate(s: string): string | null {
  const m = /^([A-Za-z]{3})\w*\s+(\d{1,2}),\s*(\d{4})$/.exec(s.trim());
  return m && MON[m[1].toLowerCase()] ? `${m[3]}-${MON[m[1].toLowerCase()]}-${m[2].padStart(2, '0')}` : null;
}
/** Patent numbers as the desk writes them: digits without commas, or a reissue like RE43879. */
export const patentKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

function table(txt: string): Record<string, string>[] {
  const lines = txt.split(/\r?\n/).filter(Boolean);
  const head = (lines.shift() ?? '').split('~');
  return lines.map((l) => { const c = l.split('~'); return Object.fromEntries(head.map((h, i) => [h, (c[i] ?? '').trim()])); });
}

/** One row per (patent, drug), brand drugs only, newest expiry kept. */
export function parseOrangeBook(patentTxt: string, productsTxt: string, asOf: string): ObFile {
  const prod = new Map<string, { t: string; i: string; a: string }>();
  for (const r of table(productsTxt)) if (r.Appl_Type === 'N') prod.set(`${r.Appl_No}:${r.Product_No}`, { t: r.Trade_Name, i: r.Ingredient, a: r.Applicant_Full_Name || r.Applicant });
  const out = new Map<string, ObRow>();
  for (const r of table(patentTxt)) {
    if (r.Appl_Type !== 'N' || r.Delist_Flag === 'Y') continue;
    const d = prod.get(`${r.Appl_No}:${r.Product_No}`);
    if (!d || !r.Patent_No) continue;
    const row: ObRow = { p: patentKey(r.Patent_No), e: obDate(r.Patent_Expire_Date_Text), t: d.t, i: d.i, a: d.a };
    const k = `${row.p}:${row.t}`, old = out.get(k);
    if (!old || (row.e ?? '') > (old.e ?? '')) out.set(k, row);
  }
  return { schema: 1, asOf, source: 'FDA Orange Book data files (fda.gov)', rows: [...out.values()] };
}

/** A company's FDA-listed drugs and patents, matched by applicant name (any of the names the desk searched). */
export function companyDrugs(f: ObFile, names: string[]): { trade: string; ingredient: string; applicant: string; patents: { no: string; expires: string | null }[]; lastExpiry: string | null }[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const keys = names.map(norm).filter((n) => n.length >= 4);
  const by = new Map<string, { trade: string; ingredient: string; applicant: string; patents: Map<string, string | null> }>();
  for (const r of f.rows) {
    if (!keys.some((k) => norm(r.a).includes(k))) continue;
    const g = by.get(r.t) ?? { trade: r.t, ingredient: r.i, applicant: r.a, patents: new Map() };
    g.patents.set(r.p, r.e); by.set(r.t, g);
  }
  return [...by.values()].map((g) => {
    const patents = [...g.patents].map(([no, expires]) => ({ no, expires })).sort((a, b) => (a.expires ?? '').localeCompare(b.expires ?? ''));
    return { trade: g.trade, ingredient: g.ingredient, applicant: g.applicant, patents, lastExpiry: patents.reduce<string | null>((m, p) => (p.expires && (!m || p.expires > m) ? p.expires : m), null) };
  }).sort((a, b) => (a.lastExpiry ?? '9999').localeCompare(b.lastExpiry ?? '9999'));
}

/** Patent number -> drugs it covers (for marking rows in the latest-filings list). */
export function fdaIndex(f: ObFile): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of f.rows) { const l = m.get(r.p) ?? []; if (!l.includes(r.t)) l.push(r.t); m.set(r.p, l); }
  return m;
}
