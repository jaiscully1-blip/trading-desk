// Morning page: premarket movers, sector ETFs and rule-based setups (bias + reasons), built before the 11am cut-off.
// Premarket numbers come from TradingView's public screener (~15 min delayed). Every bias is a starting point, not advice.
import type { QuantRead } from './quant.js';

export const SECTOR_ETFS: [string, string][] = [
  ['XLK', 'Tech'], ['SMH', 'Semis'], ['XLC', 'Communication'], ['XLY', 'Consumer disc.'], ['XLF', 'Financials'], ['XLI', 'Industrials'],
  ['XLE', 'Energy'], ['XLV', 'Health care'], ['XLP', 'Staples'], ['XLU', 'Utilities'], ['XLB', 'Materials'], ['XLRE', 'Real estate'],
  ['IBIT', 'Bitcoin'], ['GLD', 'Gold'], ['TLT', '20y Treasuries'],
];
export const INDEX_ETFS: [string, string][] = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['IWM', 'Russell 2000'], ['DIA', 'Dow']];

export const PM_COLUMNS = ['name', 'description', 'close', 'change', 'premarket_change', 'premarket_close', 'premarket_volume', 'market_cap_basic', 'sector', 'average_volume_10d_calc'];

/** Most active premarket names (liquid gappers), sorted locally by % move. */
export const PM_ACTIVE_BODY = {
  filter: [
    { left: 'type', operation: 'in_range', right: ['stock', 'dr'] },
    { left: 'market_cap_basic', operation: 'greater', right: 2e9 },
    { left: 'close', operation: 'greater', right: 5 },
    { left: 'premarket_volume', operation: 'greater', right: 50_000 },
  ],
  markets: ['america'], columns: PM_COLUMNS, sort: { sortBy: 'premarket_volume', sortOrder: 'desc' }, range: [0, 150],
};
/** Same columns for a fixed list of tickers (watchlist + sector and index ETFs). */
export const pmListBody = (syms: string[]) => ({
  filter: [{ left: 'name', operation: 'in_range', right: syms }, { left: 'type', operation: 'in_range', right: ['stock', 'dr', 'fund'] }],
  markets: ['america'], columns: PM_COLUMNS, sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' }, range: [0, 200],
});

export interface PmRow { sym: string; name: string; close: number; chg: number | null; pmChg: number | null; pmPx: number | null; pmVol: number | null; mc: number | null; sector: string; avgVol: number | null }

const num = (x: unknown) => { const n = Number(x); return x != null && x !== '' && Number.isFinite(n) ? n : null; };
export function parsePmScan(j: any): PmRow[] {
  const out: PmRow[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(j?.data) ? j.data : []) {
    const d = r?.d;
    if (!Array.isArray(d)) continue;
    const sym = String(d[0] ?? '').toUpperCase().replace('/', '.');
    const close = num(d[2]);
    if (!sym || close == null || seen.has(sym)) continue;
    seen.add(sym);
    out.push({ sym, name: String(d[1] ?? sym), close, chg: num(d[3]), pmChg: num(d[4]), pmPx: num(d[5]), pmVol: num(d[6]), mc: num(d[7]), sector: String(d[8] ?? ''), avgVol: num(d[9]) });
  }
  return out;
}

export type Bias = 'Buy bias' | 'Sell bias' | 'Wait';
export interface Setup {
  sym: string; name: string; bias: Bias; score: number;
  /** % move used: premarket when available, else the last session's change */
  move: number; moveKind: 'premarket' | 'day';
  pmPx: number | null; prevClose: number; pmVolPct: number | null;
  quant: { label: string; score: number; regime: string } | null;
  reasons: string[]; plan: string; catalyst?: { title: string; url: string; src: string };
}

/**
 * Bias = premarket gap direction + the stock's own trend (quant read) + premarket interest. Rules:
 *  gap up into an uptrend -> Buy bias (gap-and-go watch); gap down into a downtrend -> Sell bias (avoid longs / short watch);
 *  gap against the trend -> Wait for the open to settle (fades and reclaims both happen). Gaps over 8% are flagged as extended.
 */
export function setupFor(r: PmRow, q: QuantRead | null, catalyst?: Setup['catalyst']): Setup {
  const pm = r.pmChg != null && r.pmVol != null && r.pmVol > 0;
  const move = pm ? r.pmChg! : r.chg ?? 0;
  const prevClose = r.close;
  const pmVolPct = pm && r.avgVol ? (r.pmVol! / r.avgVol) * 100 : null;
  const qs = q?.verdict.score ?? 0;
  const reasons: string[] = [];
  const dir = move >= 0 ? 'up' : 'down';
  reasons.push(`${pm ? 'Premarket' : 'Last session'} ${move >= 0 ? '+' : ''}${move.toFixed(1)}%${pm && r.pmPx ? ` at ${r.pmPx.toFixed(2)}` : ''} vs ${prevClose.toFixed(2)} close.`);
  if (pmVolPct != null) reasons.push(pmVolPct >= 10 ? `Heavy premarket volume: ${pmVolPct.toFixed(0)}% of a normal day already traded.` : pmVolPct >= 3 ? `Active premarket: ${pmVolPct.toFixed(1)}% of a normal day's volume.` : `Light premarket volume (${pmVolPct.toFixed(1)}% of a normal day), so the gap is less reliable.`);
  if (q) {
    reasons.push(`Quant read: ${q.verdict.label} (${q.verdict.score >= 0 ? '+' : ''}${q.verdict.score}), ${q.regime.label.toLowerCase()} regime.`);
    const top = [...q.verdict.reasons].sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts))[0];
    if (top) reasons.push(top.text);
  } else reasons.push('No daily history read for this ticker; bias uses the gap alone.');
  if (catalyst) reasons.push(`News: ${catalyst.title}`);

  let bias: Bias = 'Wait', plan: string;
  const big = Math.abs(move) >= 8;
  const strongGap = Math.abs(move) >= 2;
  if (strongGap && move > 0 && qs >= 1) { bias = 'Buy bias'; plan = `Gap-and-go watch: long only if it holds above the opening range high; the ${prevClose.toFixed(2)} close is the line where the idea fails.`; }
  else if (strongGap && move < 0 && qs <= -1) { bias = 'Sell bias'; plan = `Weak stock gapping down: avoid longs; short watch only below the opening range low, invalid back above ${prevClose.toFixed(2)}.`; }
  else if (strongGap && move > 0 && qs <= -1) plan = 'Gap up into a downtrend: these often fade. Wait for the first 15–30 minutes; no chase.';
  else if (strongGap && move < 0 && qs >= 1) plan = `Strong stock gapping down: dip-buy watch only if it reclaims VWAP or the ${prevClose.toFixed(2)} close; otherwise stand aside.`;
  else plan = strongGap ? 'Gap without a clear trend behind it: let the open settle before deciding.' : `Small ${dir} move: trade it only if your playbook level triggers.`;
  if (big) { reasons.push(`Extended: a ${Math.abs(move).toFixed(1)}% gap leaves little room before stops get wide. Size down.`); if (bias !== 'Wait') plan += ' Extended gap: half size.'; }
  const score = Math.abs(move) * (pmVolPct != null ? Math.min(3, 1 + pmVolPct / 10) : 1) + Math.abs(qs) + (catalyst ? 1 : 0);
  return { sym: r.sym, name: r.name, bias, score, move, moveKind: pm ? 'premarket' : 'day', pmPx: pm ? r.pmPx : null, prevClose, pmVolPct, quant: q ? { label: q.verdict.label, score: q.verdict.score, regime: q.regime.label } : null, reasons, plan, catalyst };
}

/** Plain-language summary when the AI summary is unavailable. */
export function ruleSummary(idx: PmRow[], sectors: PmRow[], setups: Setup[], kind: 'premarket' | 'day'): string {
  const mv = (r: PmRow) => (kind === 'premarket' ? r.pmChg : r.chg);
  const f = (x: number | null) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`);
  const parts: string[] = [];
  const spy = idx.find((r) => r.sym === 'SPY'), qqq = idx.find((r) => r.sym === 'QQQ');
  if (spy || qqq) parts.push(`${kind === 'premarket' ? 'Premarket' : 'Last session'}: SPY ${f(spy ? mv(spy) : null)}, QQQ ${f(qqq ? mv(qqq) : null)}.`);
  const s = sectors.filter((r) => mv(r) != null).sort((a, b) => mv(b)! - mv(a)!);
  if (s.length >= 4) parts.push(`Leading: ${s.slice(0, 2).map((r) => `${r.sym} ${f(mv(r))}`).join(', ')}. Lagging: ${s.slice(-2).reverse().map((r) => `${r.sym} ${f(mv(r))}`).join(', ')}.`);
  const buys = setups.filter((x) => x.bias === 'Buy bias').slice(0, 3), sells = setups.filter((x) => x.bias === 'Sell bias').slice(0, 3);
  if (buys.length) parts.push(`Buy-bias watch: ${buys.map((x) => x.sym).join(', ')}.`);
  if (sells.length) parts.push(`Sell-bias / avoid: ${sells.map((x) => x.sym).join(', ')}.`);
  if (!buys.length && !sells.length && setups.length) parts.push('No setup lines up gap and trend cleanly yet; let the open settle.');
  return parts.join(' ');
}
