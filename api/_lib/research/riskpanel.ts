// GET /api/research?fn=riskpanel -> one risk-on / risk-off list: each signal read "stressing", "easing" or "normal" by a
// stated rule. Reuses the desk's own routes and caches: credit spreads and stress indexes (FRED), the DTCC CDS tape (index
// moves, trading surges, bank CDS), FDIC bank protection bought, FINRA margin debt (cross-asset), and the weekly CFTC
// credit-swaps snapshot (published/cftc-cds.json). Facts and stated rules, not a forecast and not advice.
import { summarize, type CdsTrade } from '../../../shared/cds.js';
import { bankProtectionSignal, cdsIndexSignal, indexTradeCount, levelSignal, marginSignal, readMove, riskNotes, spreadSignal, surgeSignal, tally, type Signal } from '../../../shared/riskPanel.js';
import { cached, getJson, json } from '../core.js';
import { bankhedge } from './banks.js';
import { dayFile, etDay, lastDays } from './cds.js';
import { GET as credit } from './credit.js';
import { xasset } from './xasset.js';

const REPO = process.env.GITHUB_REPO || 'jaiscully1-blip/trading-desk';
const BANKS: [RegExp, string][] = [[/^MORGAN STANLEY$/, 'Morgan Stanley'], [/^BANK OF AMERICA CORPORATION$/, 'Bank of America'], [/^THE GOLDMAN SACHS GROUP/, 'Goldman Sachs'], [/^JPMORGAN CHASE & CO/, 'JPMorgan Chase'], [/^CITIGROUP INC/, 'Citigroup'], [/^WELLS FARGO & COMPANY/, 'Wells Fargo'], [/^BARCLAYS PLC$/, 'Barclays'], [/^DEUTSCHE BANK AKTIENGESELLSCHAFT$/, 'Deutsche Bank'], [/^UBS GROUP AG$/, 'UBS'], [/^HSBC HOLDINGS PLC$/, 'HSBC']];
const call = async (f: () => Promise<Response>) => (await f()).json();

export async function riskpanel(): Promise<Response> {
  const errors: Record<string, string> = {};
  const safe = async <T,>(k: string, f: () => Promise<T>): Promise<T | null> => { try { return await f(); } catch (e) { errors[k] = String((e as Error).message).slice(0, 140); return null; } };
  const days = lastDays(9), today = etDay(Date.now());
  const [cr, xa, bh, tape, cftc] = await Promise.all([
    safe('credit', () => call(credit)),
    safe('margin', () => call(xasset)),
    safe('banks', () => call(() => bankhedge(new Request('https://desk/api/research?fn=bankhedge')))),
    safe('cds', async () => {
      const sec = (await Promise.all(days.slice(0, 5).map((d) => dayFile('sec', d).catch(() => [] as CdsTrade[])))).flat();
      const cfDays = await Promise.all(days.map(async (d) => ({ d, trades: await dayFile('cftc', d).catch(() => [] as CdsTrade[]) })));
      return { sec, cf: cfDays.flatMap((x) => x.trades), perDay: new Map(cfDays.map((x) => [x.d, indexTradeCount(x.trades)])) };
    }),
    safe('cftc', async () => (await cached('pub:cftc-cds', 3600, () => getJson(`https://raw.githubusercontent.com/${REPO}/main/published/cftc-cds.json`, 'github', 10000))).val),
  ]);

  const sigs: Signal[] = [];
  const push = (s: Signal | null) => { if (s) sigs.push(s); };
  // hedging
  const ind = (bh as any)?.industry ?? [];
  push(bankProtectionSignal(ind.at(-1)?.bought, ind.at(-2)?.bought, (bh as any)?.latest ?? ''));
  if (tape) {
    // per daily file; today's file is still filling, and holidays have (almost) none
    const byDay = new Map([...tape.perDay].filter(([d, n]) => d !== today && n > 50));
    const full = [...byDay.keys()].sort();
    if (full.length) push(surgeSignal(byDay, full.at(-1)!));
  }
  const weeks: any[] = (cftc as any)?.weeks ?? [];
  if (weeks.length >= 2) {
    const [a, b] = weeks.slice(-2);
    if (a.tickets && b.tickets) { const pct = ((b.tickets.total - a.tickets.total) / a.tickets.total) * 100; sigs.push({ id: 'cftc:tickets', group: 'Hedging', label: 'Credit swaps traded (CFTC, weekly)', value: `${b.tickets.total.toLocaleString('en-US')} trades (week of ${b.week})`, change: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% vs the week before`, read: readMove(pct, 30), rule: 'Stressing if credit-swap trades rose 30% or more in a week; easing if they fell as much.', src: 'CFTC Weekly Swaps Report' }); }
  }
  // credit
  const st = (k: string) => (cr as any)?.series?.[k]?.stats ?? null;
  push(spreadSignal('hy', 'High-yield bond spread', st('hy')));
  push(spreadSignal('ccc', 'CCC (riskiest) bond spread', st('ccc'), 0.75));
  push(spreadSignal('ig', 'Investment-grade bond spread', st('ig'), 0.1));
  push(levelSignal('stress', 'St. Louis Fed financial stress index', st('stress'), 0.25, 'FRED (St. Louis Fed)'));
  push(levelSignal('nfci', 'Chicago Fed financial conditions', st('nfci'), 0.1, 'FRED (Chicago Fed)'));
  if (tape) {
    const sums = summarize([...tape.sec, ...tape.cf.filter((t) => days.slice(0, 5).includes(etDay(t.t)))]);
    const by = new Map(sums.map((s) => [s.name, s]));
    for (const [name, label] of [['CDX.NA.HY', 'CDX High Yield (US junk-bond CDS index)'], ['CDX.NA.IG', 'CDX Investment Grade (US CDS index)'], ['ITRAXX EUROPE CROSSOVER', 'iTraxx Crossover (Europe junk CDS index)']] as const) { const s = by.get(name); push(s ? cdsIndexSignal(name, label, s.first5y, s.last5y) : null); }
    const fin = by.get('ITRAXX EUROPE SENIOR FINANCIALS');
    push(fin ? cdsIndexSignal('ITRAXX EUROPE SENIOR FINANCIALS', 'iTraxx Senior Financials (European bank CDS)', fin.first5y, fin.last5y, 'Banks') : null);
    for (const s of sums) { const b = BANKS.find(([re]) => re.test(s.name)); if (b && s.first5y != null && s.last5y != null && s.first5y !== s.last5y) push(cdsIndexSignal(s.name, `${b[1]} 5-year CDS`, s.first5y, s.last5y, 'Banks')); }
  }
  // leverage
  push(marginSignal((xa as any)?.margin));

  const order = { Hedging: 0, Banks: 1, Credit: 2, Leverage: 3 } as const;
  sigs.sort((a, b) => order[a.group] - order[b.group]);
  return json({ signals: sigs, tally: tally(sigs), notes: riskNotes(sigs), cftcWeeks: weeks.length, errors, asOf: Date.now(),
    source: 'FRED, DTCC public CDS tape, FDIC call reports, FINRA, CFTC Weekly Swaps Report. Each signal shows its rule; facts, not a forecast or advice.' },
  { sMaxAge: Object.keys(errors).length ? 0 : 900 });
}
