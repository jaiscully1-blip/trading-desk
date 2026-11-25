// GET /api/research?fn=xasset -> carry trades, bond carry + European yields, global debt (BIS), margin debt (FINRA),
// private-credit lenders (BDCs), options income / short vol / dispersion gauges. Each part cached and failing on its own.
import { BDCS, CARRY, DEBT_CTY, RATES, TENS, VOL_SYMS, carryRow, chgPct, marginRows, termRead, vol } from '../../../shared/xasset.js';
import { parseFredSeries } from '../../../shared/parse.js';
import { parseSpark } from '../../../shared/distressGather.js';
import { unzipFile } from './cds.js';
import { cached, getJson, hasKey, json, key, take } from '../core.js';

const YH = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' };
const spark = async (syms: string[]) => parseSpark(await getJson(`https://query1.finance.yahoo.com/v8/finance/spark?symbols=${syms.map(encodeURIComponent).join(',')}&range=1y&interval=1d`, 'yahoo', 15000, { headers: YH }), syms);
async function fredLast(id: string, n = 400): Promise<[string, number][]> {
  const j = await getJson(`https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key('fred')}&file_type=json&sort_order=desc&limit=${n}`, 'fred', 12000);
  return parseFredSeries(j).map((o) => [o.date, o.value] as [string, number]).sort((a, b) => a[0].localeCompare(b[0]));
}
const ecbCsv = async (k: string) => {
  const r = await fetch(`https://data-api.ecb.europa.eu/service/data/YC/${k}?format=csvdata&lastNObservations=260`, { headers: YH });
  if (!r.ok) throw new Error(`ECB HTTP ${r.status}`);
  const lines = (await r.text()).trim().split('\n').slice(1);
  return lines.map((l) => { const c = l.split(','); return [c[8], Number(c[9])] as [string, number]; }).filter((x) => Number.isFinite(x[1]));
};
const part = <T>(id: string, ttl: number, fn: () => Promise<T>, errors: Record<string, string>) => cached(`xasset:${id}`, ttl, fn).then((x) => x.val).catch((e) => { errors[id] = String((e as Error).message).slice(0, 100); return null; });

export async function xasset(): Promise<Response> {
  const errors: Record<string, string> = {};
  const fred = hasKey('fred');
  const [carry, bonds, debt, margin, lenders, volx] = await Promise.all([
    part('carry', 3 * 3600, async () => {
      if (!fred) throw new Error('needs FRED_API_KEY');
      const rates: Record<string, number | null> = {}, rateAt: Record<string, string> = {};
      await Promise.all(Object.entries(RATES).map(async ([c, r]) => { try { const p = await fredLast(r.id, 3); rates[c] = p.at(-1)?.[1] ?? null; rateAt[c] = p.at(-1)?.[0] ?? ''; } catch { rates[c] = null; } }));
      const px = await spark(CARRY.map((p) => p.yahoo));
      let jpy: { date: string; levNet: number; assetNet: number; levChg: number } | null = null;
      try {
        if (take('cftc')) { const r: any[] = await getJson("https://publicreporting.cftc.gov/resource/gpe5-46if.json?$limit=1&cftc_contract_market_code=097741&$order=report_date_as_yyyy_mm_dd%20DESC", 'cftc', 12000); const x = r[0]; const n = (k: string) => Number(x?.[k]) || 0;
          if (x) jpy = { date: String(x.report_date_as_yyyy_mm_dd).slice(0, 10), levNet: n('lev_money_positions_long') - n('lev_money_positions_short'), assetNet: n('asset_mgr_positions_long') - n('asset_mgr_positions_short'), levChg: n('change_in_lev_money_long') - n('change_in_lev_money_short') }; }
      } catch { /* optional */ }
      return { rows: CARRY.map((p) => carryRow(p, rates, px.get(p.yahoo) ?? [])), rates: Object.entries(RATES).map(([c, r]) => ({ cur: c, label: r.label, rate: rates[c] ?? null, at: rateAt[c] ?? '' })), jpy };
    }, errors),
    part('bonds', 6 * 3600, async () => {
      const tens = fred ? await Promise.all(TENS.map(async (t) => { try { const p = await fredLast(t.id, t.daily ? 300 : 15); const last = p.at(-1); const yago = p.find((x) => Date.parse(x[0]) >= Date.parse(last![0]) - 366 * 86400_000); return { ...t, last: last?.[1] ?? null, at: last?.[0] ?? '', y1: yago?.[1] ?? null }; } catch { return { ...t, last: null, at: '', y1: null }; } })) : [];
      const [aaa10, all10, aaa2] = await Promise.all([ecbCsv('B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y'), ecbCsv('B.U2.EUR.4F.G_N_C.SV_C_YM.SR_10Y'), ecbCsv('B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y')].map((p) => p.catch(() => [] as [string, number][])));
      const t3m = fred ? await fredLast('T10Y3M', 260).catch(() => []) : [];
      return { tens, euro: { aaa10: aaa10.at(-1) ?? null, all10: all10.at(-1) ?? null, aaa2: aaa2.at(-1) ?? null, periphery: aaa10.length && all10.length ? Math.round((all10.at(-1)![1] - aaa10.at(-1)![1]) * 100) : null, periphery1y: aaa10.length && all10.length ? Math.round((all10[0][1] - aaa10[0][1]) * 100) : null }, usCarry: t3m.at(-1) ?? null };
    }, errors),
    part('debt', 24 * 3600, async () => {
      const r = await fetch(`https://stats.bis.org/api/v2/data/dataflow/BIS/WS_TC/2.0/Q.${DEBT_CTY.join('+')}.G+P.A.M.770.A?lastNObservations=5&format=csv`, { headers: YH });
      if (!r.ok) throw new Error(`BIS HTTP ${r.status}`);
      const rows = (await r.text()).trim().split('\n').slice(1).map((l) => l.split(','));
      const out: Record<string, { gov?: number; priv?: number; gov1y?: number; priv1y?: number; at?: string }> = {};
      for (const c of rows) { const cty = c[1], who = c[2], per = c[12], v = Number(c[13]); if (!Number.isFinite(v)) continue; const o = (out[cty] ??= {}); const k = who === 'G' ? 'gov' : 'priv';
        if (!o.at || per >= o.at) { if (per > (o.at ?? '')) o.at = per; o[k] = v; } }
      for (const c of rows) { const o = out[c[1]]; if (!o) continue; const k = c[2] === 'G' ? 'gov1y' : 'priv1y'; const v = Number(c[13]); if (o[k] == null && Number.isFinite(v)) o[k] = v; }
      return DEBT_CTY.map((c) => ({ cty: c, ...out[c] }));
    }, errors),
    part('margin', 24 * 3600, async () => {
      const r = await fetch('https://www.finra.org/sites/default/files/2021-03/margin-statistics.xlsx', { headers: YH });
      if (!r.ok) throw new Error(`FINRA HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const ss = [...unzipFile(buf, 'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
      const rows = [...unzipFile(buf, 'xl/worksheets/sheet1.xml').matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((m) => [...m[1].matchAll(/<c ([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => { const v = (c[2].match(/<v>([^<]*)<\/v>/) ?? [])[1] ?? ''; return /t="s"/.test(c[1]) ? ss[Number(v)] ?? '' : v; }));
      return marginRows(rows).slice(0, 37);
    }, errors),
    part('lenders', 3 * 3600, async () => { const px = await spark(BDCS.map((b) => b.sym)); return BDCS.map((b) => { const c = px.get(b.sym) ?? []; return { ...b, last: c.at(-1) ?? null, m1: chgPct(c, 21), m3: chgPct(c, 63), y1: chgPct(c, 250) }; }); }, errors),
    part('vol', 1800, async () => {
      const px = await spark(VOL_SYMS);
      const last = (s: string) => px.get(s)?.at(-1) ?? null;
      const rows = VOL_SYMS.map((s) => { const c = px.get(s) ?? []; return { sym: s, last: last(s), m1: chgPct(c, 21), y1: chgPct(c, 250), hv: /^\^/.test(s) ? null : vol(c, 21) }; });
      return { rows, term: termRead(last('^VIX'), last('^VIX3M')), spxHv21: vol(px.get('^GSPC') ?? [], 21) };
    }, errors),
  ]);
  return json({ carry, bonds, debt, margin, lenders, vol: volx, errors, asOf: Date.now(), source: 'FRED (OECD rates, 10y yields), Yahoo Finance prices (unofficial), ECB euro area yield curves, BIS total credit, FINRA margin statistics, CFTC Traders in Financial Futures' }, { sMaxAge: 1800 });
}
