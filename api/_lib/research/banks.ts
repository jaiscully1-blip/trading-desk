// GET /api/research?fn=bankhedge            -> credit protection bought / sold, Tier 1 capital and unused loan commitments for the
//                                              biggest US banks (by protection bought and by assets), industry totals, quiet notes
// GET /api/research?fn=bankhedge&cert=628   -> one bank's full quarterly history
// GET /api/research?fn=banksearch&q=citi    -> find a bank by name (incl. closed banks)
// Source: FDIC call reports (api.fdic.gov, free, no key, updated quarterly ~2 months after quarter end). Official data, not advice.
import { FDIC_FIELDS, bankNotes, latestChanges, parseBankQs, prettyBank, reportDates } from '../../../shared/bankHedge.js';
import { cached, getJson, json, take } from '../core.js';

const FDIC = 'https://api.fdic.gov/banks';
const get = async (path: string) => { if (!take('fdic')) throw new Error('FDIC budget used up for now'); return getJson(`${FDIC}/${path}`, 'fdic', 15000); };
const q = (params: Record<string, string>) => new URLSearchParams({ format: 'json', ...params }).toString();

/** A bank's quarters (newest 80 = 20 years), oldest first, with its name. Cached a day. */
async function bankSeries(cert: number) {
  return (await cached(`fdic:bank:${cert}`, 86400, async () => {
    const j = await get(`financials?${q({ filters: `CERT:${cert}`, fields: `${FDIC_FIELDS},NAME`, sort_by: 'REPDTE', sort_order: 'DESC', limit: '80' })}`);
    const name = prettyBank(String(j?.data?.[0]?.data?.NAME ?? cert));
    return { cert, name, qs: parseBankQs(j) };
  })).val;
}

export async function bankhedge(req: Request): Promise<Response> {
  const cert = Number(new URL(req.url).searchParams.get('cert') ?? '');
  const errors: Record<string, string> = {};
  try {
    if (cert > 0) {
      const b = await bankSeries(cert);
      const ch = latestChanges(b.qs);
      return json({ bank: { ...b, changes: ch, notes: bankNotes(b.name, ch) }, source: 'FDIC call reports' }, { sMaxAge: 3600 });
    }
    // newest filed quarter, from the biggest bank
    const latest = (await cached('fdic:latest', 6 * 3600, async () => String((await get(`financials?${q({ filters: 'CERT:628', fields: 'REPDTE', sort_by: 'REPDTE', sort_order: 'DESC', limit: '1' })}`))?.data?.[0]?.data?.REPDTE ?? ''))).val;
    if (!/^\d{8}$/.test(latest)) throw new Error('FDIC did not return a latest quarter');
    // banks to show: the top buyers of protection, plus the biggest banks by assets (for capital and lending)
    const certs = (await cached(`fdic:watch:${latest}`, 86400, async () => {
      const byCds = await get(`financials?${q({ filters: `REPDTE:${latest} AND CTDERBEN:[1 TO *]`, fields: 'CERT', sort_by: 'CTDERBEN', sort_order: 'DESC', limit: '8' })}`);
      const byAssets = await get(`institutions?${q({ filters: 'ACTIVE:1', fields: 'CERT', sort_by: 'ASSET', sort_order: 'DESC', limit: '10' })}`);
      return [...new Set([...(byCds?.data ?? []), ...(byAssets?.data ?? [])].map((r: any) => Number(r?.data?.CERT)).filter((n) => n > 0))];
    })).val;
    const banks = [];
    for (let i = 0; i < certs.length; i += 5) {
      const got = await Promise.all(certs.slice(i, i + 5).map((c) => bankSeries(c).catch((e) => { errors[`bank ${c}`] = String((e as Error).message).slice(0, 100); return null; })));
      for (const b of got) if (b) { const ch = latestChanges(b.qs); banks.push({ cert: b.cert, name: b.name, qs: b.qs.slice(-40), changes: ch, notes: bankNotes(b.name, ch) }); }
    }
    banks.sort((a, b) => (b.changes?.cur.bought ?? 0) - (a.changes?.cur.bought ?? 0) || (b.changes?.cur.assets ?? 0) - (a.changes?.cur.assets ?? 0));
    // industry totals: every bank with protection bought, per quarter (5 years)
    const industry = [];
    for (const d of reportDates(latest, 20)) {
      try {
        const t = (await cached(`fdic:tot:${d}`, d === latest ? 86400 : 30 * 86400, async () => {
          const j = await get(`financials?${q({ filters: `REPDTE:${d} AND CTDERBEN:[1 TO *]`, fields: 'CTDERBEN,CTDERGTY', limit: '1000' })}`);
          const rows = (j?.data ?? []).map((r: any) => r.data);
          return { bought: rows.reduce((s: number, r: any) => s + (Number(r.CTDERBEN) || 0), 0) * 1000, sold: rows.reduce((s: number, r: any) => s + (Number(r.CTDERGTY) || 0), 0) * 1000, banks: rows.length };
        })).val;
        industry.push({ q: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, ...t });
      } catch (e) { errors.industry = String((e as Error).message).slice(0, 100); }
    }
    const lastTwo = industry.slice(-2);
    const indQ = lastTwo.length === 2 && lastTwo[0].bought ? ((lastTwo[1].bought - lastTwo[0].bought) / lastTwo[0].bought) * 100 : null;
    const notes = [...(indQ != null && Math.abs(indQ) >= 15 ? [`All US banks: credit protection bought ${indQ > 0 ? 'up' : 'down'} ${Math.abs(Math.round(indQ))}% in a quarter.`] : []), ...banks.flatMap((b) => b.notes)];
    return json({ latest: `${latest.slice(0, 4)}-${latest.slice(4, 6)}-${latest.slice(6, 8)}`, banks, industry, notes, errors, asOf: Date.now(),
      source: 'FDIC call reports (api.fdic.gov): quarterly, about 2 months after each quarter ends. Credit derivatives are bank-level (not holding company).' }, { sMaxAge: Object.keys(errors).length ? 0 : 3600 });
  } catch (e) { return json({ error: String((e as Error).message).slice(0, 200), errors }); }
}

export async function banksearch(req: Request): Promise<Response> {
  const term = (new URL(req.url).searchParams.get('q') ?? '').replace(/[^A-Za-z0-9 &.'-]/g, '').trim().slice(0, 60);
  if (term.length < 2) return json({ results: [] });
  try {
    const j = await get(`institutions?${q({ search: `NAME:${term}`, fields: 'NAME,CERT,ACTIVE,STALP,ASSET', sort_by: 'ASSET', sort_order: 'DESC', limit: '12' })}`);
    return json({ results: (j?.data ?? []).map((r: any) => ({ cert: Number(r.data.CERT), name: prettyBank(String(r.data.NAME)), active: r.data.ACTIVE === 1, state: r.data.STALP ?? '', assets: Number(r.data.ASSET) * 1000 || null })) }, { sMaxAge: 86400 });
  } catch (e) { return json({ results: [], error: String((e as Error).message).slice(0, 160) }); }
}
