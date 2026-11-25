// Macro extras (pure, tested): earnings-season scoreboard by sector, policy odds mapped to the sector baskets they move,
// and which market phase it is (for workspaces that switch with the session).

export interface EarnRow { sym: string; date: string; hour?: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
export interface SectorScore { sector: string; reported: number; epsBeat: number; revBeat: number; epsBeatPct: number | null; revBeatPct: number | null; avgSurprise: number | null }

/** Beat rates by sector for companies that have reported (EPS and revenue vs estimates). */
export function scoreboard(rows: EarnRow[], sectorOf: (s: string) => string | null): { total: SectorScore; sectors: SectorScore[]; companies: Record<string, EarnRow[]> } {
  const by = new Map<string, EarnRow[]>();
  for (const r of rows) {
    if (r.epsAct == null || r.epsEst == null) continue;
    const s = sectorOf(r.sym);
    if (!s) continue;
    by.set(s, [...(by.get(s) ?? []), r]);
  }
  const score = (sector: string, xs: EarnRow[]): SectorScore => {
    const eps = xs.filter((x) => x.epsAct! > x.epsEst!).length;
    const revX = xs.filter((x) => x.revAct != null && x.revEst != null);
    const rev = revX.filter((x) => x.revAct! > x.revEst!).length;
    const sur = xs.filter((x) => x.epsEst && Math.abs(x.epsEst) > 0.01).map((x) => ((x.epsAct! - x.epsEst!) / Math.abs(x.epsEst!)) * 100);
    return { sector, reported: xs.length, epsBeat: eps, revBeat: rev, epsBeatPct: xs.length ? (eps / xs.length) * 100 : null, revBeatPct: revX.length ? (rev / revX.length) * 100 : null, avgSurprise: sur.length ? sur.sort((a, b) => a - b)[Math.floor(sur.length / 2)] : null };
  };
  const sectors = [...by.entries()].map(([s, xs]) => score(s, xs)).sort((a, b) => b.reported - a.reported);
  const companies = Object.fromEntries([...by.entries()].map(([s, xs]) => [s, [...xs].sort((a, b) => b.date.localeCompare(a.date))]));
  return { total: score('All', [...by.values()].flat()), sectors, companies };
}

/** Which sector baskets a prediction market touches, by keywords in its question. */
const LINKS: { re: RegExp; etfs: string[]; why: string }[] = [
  { re: /\bfed\b|rate cut|rate hike|interest rate|fomc|powell/i, etfs: ['XLF', 'IWM', 'TLT'], why: 'rates move banks, small caps and bonds' },
  { re: /tariff|trade war|trade deal|china|import/i, etfs: ['XLI', 'XLB', 'FXI'], why: 'trade policy moves industrials, materials and China' },
  { re: /recession|gdp|unemployment|jobs/i, etfs: ['XLP', 'XLU', 'XLY'], why: 'growth fears favor staples and utilities over discretionary' },
  { re: /oil|opec|iran|israel|russia|ukraine|saudi|crude/i, etfs: ['XLE', 'USO', 'ITA'], why: 'conflict and supply move energy and defense' },
  { re: /bitcoin|crypto|ethereum|stablecoin/i, etfs: ['IBIT', 'COIN'], why: 'crypto prices and rules' },
  { re: /\bai\b|nvidia|chip|semiconductor|openai/i, etfs: ['SMH', 'NVDA'], why: 'AI spending moves chipmakers' },
  { re: /drug|medicare|health|fda|pharma/i, etfs: ['XLV', 'XBI'], why: 'health policy moves pharma and biotech' },
  { re: /inflation|cpi\b|pce\b/i, etfs: ['TIP', 'XLF', 'QQQ'], why: 'inflation moves rate expectations and growth stocks' },
  { re: /shutdown|debt ceiling|budget|default/i, etfs: ['SPY', 'TLT', 'GLD'], why: 'fiscal fights move bonds and havens' },
];
export function basketsFor(text: string): { etfs: string[]; why: string }[] { return LINKS.filter((l) => l.re.test(text)).map(({ etfs, why }) => ({ etfs, why })); }

export type Phase = 'premarket' | 'open' | 'midday' | 'close' | 'after' | 'closed';
/** Market phase from Eastern-time minutes after midnight on a weekday. */
export function phaseOf(etMinutes: number, weekday: boolean): Phase {
  if (!weekday) return 'closed';
  if (etMinutes >= 240 && etMinutes < 570) return 'premarket';
  if (etMinutes >= 570 && etMinutes < 660) return 'open';
  if (etMinutes >= 660 && etMinutes < 900) return 'midday';
  if (etMinutes >= 900 && etMinutes < 960) return 'close';
  if (etMinutes >= 960 && etMinutes < 1200) return 'after';
  return 'closed';
}
export const PHASE_LABEL: Record<Phase, string> = { premarket: 'Premarket (4:00-9:30)', open: 'Open (9:30-11:00)', midday: 'Midday (11:00-3:00)', close: 'Close (3:00-4:00)', after: 'After hours (4:00-8:00)', closed: 'Closed / overnight' };
