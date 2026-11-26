// Who holds credit protection: BIS OTC derivatives statistics (WS_OTC_DERIV2), credit default swaps, every half-year since
// 2010, by counterparty sector. Codes checked 2026-11-26 against the BIS code lists: instrument U = CDS; type A = notional
// outstanding, S = notional bought, T = notional sold; sector B dealers, K central counterparties, L banks and securities
// firms, M insurance and financial guaranty, N SPVs / SPEs, O hedge funds, P other financial, U non-financial customers.
// The BIS reports from the dealers' side: what dealers SOLD to a sector (T) is what that sector BOUGHT. Values in $ millions.
// Pure + tested. Official statistics, not advice.
import { parseCsv } from './cds.js';

export const SECTORS: { code: string; label: string; note?: string }[] = [
  { code: 'U', label: 'Non-financial companies', note: 'Companies outside finance: the closest answer to how much protection ordinary companies buy.' },
  { code: 'M', label: 'Insurance and financial guaranty' },
  { code: 'O', label: 'Hedge funds' },
  { code: 'N', label: 'SPVs / SPEs (special purpose vehicles)' },
  { code: 'L', label: 'Banks and securities firms (non-dealers)' },
  { code: 'P', label: 'Other financial institutions' },
  { code: 'K', label: 'Central counterparties (clearing houses)', note: 'Cleared trades: the clearing house sits between buyer and seller.' },
  { code: 'B', label: 'Dealers with each other', note: 'Trades between the reporting dealers themselves.' },
];

export interface SectorPoint { period: string; outstanding: number | null; bought: number | null; sold: number | null }
export interface HolderData { periods: string[]; total: (number | null)[]; sectors: Record<string, SectorPoint[]> }

/** BIS CSV -> per sector, per half-year: outstanding, bought by the sector (= dealers sold, T), sold by the sector (= dealers bought, S). */
export function parseHolders(csv: string): HolderData {
  const rows = parseCsv(csv).filter((r) => r.DER_INSTR === 'U' && r.DER_CPC === '5J');
  const periods = [...new Set(rows.map((r) => r.TIME_PERIOD))].filter(Boolean).sort();
  const val = (type: string, sector: string, p: string) => { const r = rows.find((x) => x.DER_TYPE === type && x.DER_SECTOR_CPY === sector && x.TIME_PERIOD === p); const v = r ? Number(r.OBS_VALUE) : NaN; return Number.isFinite(v) ? v * 1e6 : null; };
  const sectors: Record<string, SectorPoint[]> = {};
  for (const s of SECTORS) sectors[s.code] = periods.map((p) => ({ period: p, outstanding: val('A', s.code, p), bought: s.code === 'B' ? null : val('T', s.code, p), sold: s.code === 'B' ? null : val('S', s.code, p) }));
  return { periods, total: periods.map((p) => val('A', 'A', p)), sectors };
}

/** "2025-S2" -> "end of 2025"; "2025-S1" -> "mid-2025". */
export const periodLabel = (p: string) => (/S2$/.test(p) ? `end of ${p.slice(0, 4)}` : `mid-${p.slice(0, 4)}`);
const chg = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

/** Latest half-year per sector: bought, sold, net bought, share of all CDS outstanding, change vs 6 and 12 months earlier. */
export function latestHolders(d: HolderData) {
  const i = d.periods.length - 1, total = d.total[i];
  return SECTORS.map((s) => {
    const pts = d.sectors[s.code], cur = pts[i], half = pts[i - 1], year = pts[i - 2];
    return {
      code: s.code, label: s.label, note: s.note, outstanding: cur?.outstanding ?? null, share: cur?.outstanding != null && total ? (cur.outstanding / total) * 100 : null,
      bought: cur?.bought ?? null, sold: cur?.sold ?? null, net: cur?.bought != null && cur?.sold != null ? cur.bought - cur.sold : null,
      boughtH: chg(cur?.bought, half?.bought), boughtY: chg(cur?.bought, year?.bought),
    };
  });
}

/** Quiet notes: a sector's protection bought moved 25% or more in half a year (sectors above $10B only). */
export function holderNotes(rows: ReturnType<typeof latestHolders>, period: string): string[] {
  return rows.filter((r) => r.boughtH != null && Math.abs(r.boughtH) >= 25 && (r.bought ?? 0) >= 1e10)
    .map((r) => `${r.label}: protection bought ${r.boughtH! > 0 ? 'up' : 'down'} ${Math.abs(Math.round(r.boughtH!))}% in six months, to $${(r.bought! / 1e9).toFixed(0)}B (${periodLabel(period)}).`);
}
