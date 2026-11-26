// Banks & hedging: credit protection US banks bought and sold, Tier 1 capital and unused loan commitments, from the FDIC's
// quarterly call reports (api.fdic.gov, free, no key). Field names checked 2026-11-26: CTDERBEN = credit derivatives where
// the bank is the beneficiary (protection bought), CTDERGTY = guarantor (protection sold), RBC1AAJ = Tier 1 leverage ratio,
// RBCT1JR = Tier 1 risk-based ratio, UC = unused commitments, ASSET = total assets; money fields are in thousands of dollars.
// Pure + tested. Official data, not advice.

export const FDIC_FIELDS = 'REPDTE,ASSET,CTDERBEN,CTDERGTY,RBC1AAJ,RBCT1JR,UC';
export interface BankQ { q: string; assets: number | null; bought: number | null; sold: number | null; net: number | null; t1Lev: number | null; t1Risk: number | null; unused: number | null }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const usd = (v: unknown) => { const n = num(v); return n == null ? null : n * 1000; }; // FDIC money fields are in $ thousands
/** "20260930" -> "2026-09-30" */
export const fdicDate = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);

/** FDIC financials answer -> quarters, oldest first. */
export function parseBankQs(j: any): BankQ[] {
  return (j?.data ?? []).map((r: any) => r?.data ?? {}).filter((d: any) => d.REPDTE).map((d: any) => {
    const bought = usd(d.CTDERBEN), sold = usd(d.CTDERGTY);
    return { q: fdicDate(String(d.REPDTE)), assets: usd(d.ASSET), bought, sold, net: bought != null && sold != null ? bought - sold : null, t1Lev: num(d.RBC1AAJ), t1Risk: num(d.RBCT1JR), unused: usd(d.UC) };
  }).sort((a: BankQ, b: BankQ) => a.q.localeCompare(b.q));
}

export const pctChg = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);
/** Latest quarter with the change vs the quarter before and vs a year earlier. */
export function latestChanges(qs: BankQ[]) {
  const cur = qs.at(-1) ?? null, prev = qs.at(-2) ?? null, yr = qs.at(-5) ?? null;
  if (!cur) return null;
  const c = (k: keyof BankQ, base: BankQ | null) => pctChg(cur[k] as number | null, base ? (base[k] as number | null) : null);
  return { cur, prev, yr, boughtQ: c('bought', prev), boughtY: c('bought', yr), soldQ: c('sold', prev), unusedQ: c('unused', prev), unusedY: c('unused', yr), t1LevQ: cur.t1Lev != null && prev?.t1Lev != null ? cur.t1Lev - prev.t1Lev : null };
}

/** Quarters for the last n quarters, oldest first, as FDIC report dates (YYYYMMDD). */
export function reportDates(latest: string, n: number): string[] {
  const out: string[] = []; let y = +latest.slice(0, 4), m = +latest.slice(4, 6);
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}${String(m).padStart(2, '0')}${m === 3 || m === 12 ? '31' : '30'}`);
    m -= 3; if (m <= 0) { m += 12; y -= 1; }
  }
  return out;
}

const UPPER: Record<string, string> = { jpmorgan: 'JPMorgan', hsbc: 'HSBC', pnc: 'PNC', usa: 'USA', 'n.a.': 'N.A.', na: 'N.A.', 'u.s.': 'U.S.', bny: 'BNY', ubs: 'UBS', bmo: 'BMO', td: 'TD', mufg: 'MUFG', ii: 'II', iii: 'III' };
/** "JPMORGAN CHASE BANK NA" -> "JPMorgan Chase Bank N.A."; "U S BANK NATIONAL ASSN" -> "U.S. Bank National Assn". */
export function prettyBank(name: string): string {
  return name.replace(/\bU S\b/gi, 'U.S.').toLowerCase().split(/\s+/).map((w) => UPPER[w] ?? (w.length > 2 && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w === 'of' || w === 'and' ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}
/** A change from a tiny base (under 5% of today) is "new", not a huge percentage. */
export const fromTiny = (cur: number | null | undefined, base: number | null | undefined) => cur != null && base != null && Math.abs(base) < Math.abs(cur) * 0.05;

const B = (v: number) => (Math.abs(v) >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : `$${(v / 1e9).toFixed(0)}B`);
/** Quiet notes on sharp moves in the latest quarter (no scores, no streaks). */
export function bankNotes(name: string, ch: ReturnType<typeof latestChanges>): string[] {
  if (!ch?.prev) return [];
  const out: string[] = [];
  const { cur } = ch;
  if (ch.boughtQ != null && Math.abs(ch.boughtQ) >= 25 && (cur.bought ?? 0) >= 1e9) out.push(`${name}: credit protection bought ${ch.boughtQ > 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch.boughtQ))}% in a quarter, to ${B(cur.bought!)}.`);
  if (cur.net != null && ch.prev.net != null && Math.sign(cur.net) !== Math.sign(ch.prev.net) && Math.abs(cur.net) >= 1e9) out.push(`${name}: now a net ${cur.net > 0 ? 'buyer' : 'seller'} of credit protection (${B(Math.abs(cur.net))} net).`);
  if (ch.t1LevQ != null && ch.t1LevQ <= -0.5) out.push(`${name}: Tier 1 leverage ratio fell ${Math.abs(ch.t1LevQ).toFixed(1)} points in a quarter, to ${cur.t1Lev!.toFixed(1)}%.`);
  if (ch.unusedQ != null && Math.abs(ch.unusedQ) >= 10 && (cur.unused ?? 0) >= 1e10) out.push(`${name}: unused loan commitments ${ch.unusedQ > 0 ? 'up' : 'down'} ${Math.abs(Math.round(ch.unusedQ))}% in a quarter, to ${B(cur.unused!)}.`);
  return out;
}
