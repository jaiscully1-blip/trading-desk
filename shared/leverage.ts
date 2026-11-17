// Leverage and conviction check: a reminder, not a gate. You pick a conviction level (1 to 5); it compares the money you could lose on
// a trade with YOUR limit for that level, and checks options expirations. The default limits are generic starting points you can edit.
// Nothing here blocks or places an order. Information for your own discipline, not advice.
export interface Limits { capPct: number[]; minDte: number } // capPct[0..4] = most you would lose, as % of the account, at conviction 1..5
export const DEFAULT_LIMITS: Limits = { capPct: [0.5, 1, 1.5, 2.5, 4], minDte: 60 };
export const CONVICTION = ['1 · Curious', '2 · Leaning', '3 · Believe it', '4 · Strong', '5 · Very strong'];
export type Risk = 'low' | 'normal' | 'high';
/** how risk in the wider market (macro) and in the company changes your limits: lower risk allows a little more, high risk halves the size and asks for more time */
export const RISK_SIZE: Record<Risk, number> = { low: 1.25, normal: 1, high: 0.5 };
export const RISK_DTE: Record<Risk, number> = { low: 0, normal: 0, high: 30 };
export const RISK_LABEL: Record<Risk, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export interface Flag { level: 'warn' | 'info'; text: string }
export interface Check { pct: number | null; cap: number | null; baseCap: number | null; minDte: number; flags: Flag[] }

export function assess(i: { conviction: number | null; atRisk: number | null; equity: number | null; position?: number | null; option?: boolean; dte?: number | null; limits?: Limits; macro?: Risk; company?: Risk }): Check {
  const L = i.limits ?? DEFAULT_LIMITS;
  const flags: Flag[] = [];
  const macro = i.macro ?? 'normal', company = i.company ?? 'normal';
  const mult = RISK_SIZE[macro] * RISK_SIZE[company];
  const baseCap = i.conviction ? L.capPct[i.conviction - 1] ?? null : null;
  const cap = baseCap == null ? null : Math.round(baseCap * mult * 1000) / 1000;
  const minDte = L.minDte + RISK_DTE[macro] + RISK_DTE[company];
  if (mult !== 1) flags.push({ level: 'info', text: `${macro !== 'normal' ? `Macro risk ${macro}` : ''}${macro !== 'normal' && company !== 'normal' ? ' and ' : ''}${company !== 'normal' ? `company risk ${company}` : ''}: your limit is ${mult < 1 ? 'cut' : 'raised'} to ${cap ?? '—'}%${minDte !== L.minDte ? ` and the least time on an option is ${minDte} days` : ''}.` });
  const pct = i.atRisk != null && i.equity && i.equity > 0 ? (i.atRisk / i.equity) * 100 : null;
  if (!i.conviction) flags.push({ level: 'info', text: 'Pick a conviction level (1 to 5) so your size limit can apply. Low conviction, small size.' });
  if (i.equity == null || i.equity <= 0) flags.push({ level: 'info', text: 'Set a starting balance in Account to see this as a % of your account.' });
  if (i.atRisk == null) flags.push({ level: 'info', text: i.option ? 'Enter what the option costs: the premium is the most you can lose.' : 'No stop set, so the whole position counts as at risk.' });
  if (pct != null && cap != null && pct > cap + 1e-9) flags.push({ level: 'warn', text: `You could lose ${fmt(pct)}% of your account on this. Your limit at conviction ${i.conviction}${mult !== 1 ? ' after the risk adjustment' : ''} is ${fmt(cap)}%. If a loss would hurt, the size is too big.` });
  if (i.position != null && i.equity && i.position > i.equity) flags.push({ level: 'warn', text: 'This position is bigger than your whole account. That is leverage (margin or borrowed money), which can lose more than you put in.' });
  if (i.option && i.dte != null) {
    if (i.dte < 14) flags.push({ level: 'warn', text: `Expires in ${i.dte} day${i.dte === 1 ? '' : 's'}. Very short-dated options lose value every day, and you need to be right quickly.` });
    else if (i.dte < minDte) flags.push({ level: 'warn', text: `Expires in ${i.dte} days. Your rule is at least ${minDte}, so the idea has time to work and time decay hurts less.` });
  }
  return { pct, cap, baseCap, minDte, flags };
}
const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
