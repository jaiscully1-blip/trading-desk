// Fed liquidity and credit conditions from FRED (observed), plus "net liquidity" (calculated: Fed assets minus Treasury cash minus reverse repo).
// Direction words only (rising / falling, wider / tighter): no bullish or bearish labels. Series ids to verify against FRED if one stops answering.
export interface Obs { date: string; value: number }
export type LiqId = 'WALCL' | 'WTREGEN' | 'RRPONTSYD' | 'BAMLH0A0HYM2' | 'DFII10' | 'NFCI';

export const LIQ_SERIES: { id: LiqId; label: string; unit: '$B' | '%' | 'index'; days: number; note: string }[] = [
  { id: 'WALCL', label: 'Fed balance sheet', unit: '$B', days: 120, note: 'Total assets of the Federal Reserve, weekly (Wednesday level, published Thursday).' },
  { id: 'WTREGEN', label: 'Treasury cash (TGA)', unit: '$B', days: 120, note: "The Treasury's account at the Fed, weekly. Cash that is here is not in the banking system." },
  { id: 'RRPONTSYD', label: 'Reverse repo (overnight)', unit: '$B', days: 400, note: 'Cash parked at the Fed overnight by money funds, daily.' },
  { id: 'BAMLH0A0HYM2', label: 'High-yield spread', unit: '%', days: 400, note: 'Extra yield junk bonds pay over Treasuries, daily. Wider = more credit stress.' },
  { id: 'DFII10', label: 'Real 10Y yield', unit: '%', days: 400, note: '10-year Treasury yield after inflation (TIPS), daily.' },
  { id: 'NFCI', label: 'Financial conditions (NFCI)', unit: 'index', days: 200, note: 'Chicago Fed index, weekly. Above 0 = tighter than average, below 0 = looser.' },
];

/** WALCL and WTREGEN are published in millions of dollars, RRPONTSYD in billions: put everything in billions */
export const toBillions = (id: LiqId, v: number) => (id === 'WALCL' || id === 'WTREGEN' ? v / 1000 : v);

/** value on or before `date` (carry forward the last known observation) */
export function valueAsOf(s: Obs[], date: string): number | null {
  let out: number | null = null;
  for (const o of s) { if (o.date <= date) out = o.value; else break; }
  return out;
}
const minusDays = (date: string, d: number) => new Date(Date.parse(`${date}T12:00:00Z`) - d * 86400_000).toISOString().slice(0, 10);

export interface LiqRow { id: LiqId | 'NET'; label: string; unit: '$B' | '%' | 'index'; value: number; date: string; chg1w: number | null; chg4w: number | null; note: string; calculated?: boolean }

export function liquiditySummary(raw: Partial<Record<LiqId, Obs[]>>): LiqRow[] {
  const s: Partial<Record<LiqId, Obs[]>> = {};
  for (const def of LIQ_SERIES) { const r = raw[def.id]; if (r?.length) s[def.id] = r.map((o) => ({ date: o.date, value: toBillions(def.id, o.value) })); }
  const rows: LiqRow[] = [];
  const chg = (obs: Obs[], date: string, days: number) => { const prev = valueAsOf(obs, minusDays(date, days)); return prev == null ? null : obs[obs.length - 1].value - prev; };
  for (const def of LIQ_SERIES) {
    const obs = s[def.id];
    if (!obs) continue;
    const cur = obs[obs.length - 1];
    rows.push({ id: def.id, label: def.label, unit: def.unit, value: cur.value, date: cur.date, chg1w: chg(obs, cur.date, 7), chg4w: chg(obs, cur.date, 28), note: def.note });
  }
  if (s.WALCL && s.WTREGEN && s.RRPONTSYD) {
    const date = [s.WALCL, s.WTREGEN, s.RRPONTSYD].map((x) => x[x.length - 1].date).sort()[0]; // latest date all three have
    const net = (d: string) => { const a = valueAsOf(s.WALCL!, d), t = valueAsOf(s.WTREGEN!, d), r = valueAsOf(s.RRPONTSYD!, d); return a == null || t == null || r == null ? null : a - t - r; };
    const now = net(date);
    if (now != null) {
      const d = (days: number) => { const p = net(minusDays(date, days)); return p == null ? null : now - p; };
      rows.unshift({ id: 'NET', label: 'Net liquidity', unit: '$B', value: now, date, chg1w: d(7), chg4w: d(28), calculated: true, note: 'Calculated: Fed balance sheet minus Treasury cash minus reverse repo. A common rough gauge of cash available to markets, not an official figure.' });
    }
  }
  return rows;
}
