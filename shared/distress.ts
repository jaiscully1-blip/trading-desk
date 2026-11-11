// Distress and turnaround read for companies and sectors. CALCULATED from public data, not a rating and not advice.
// Every point in a score is a named signal with its source and date, so the reader can check it.
// Inputs (all free): SEC 8-K items, late-filing notices (NT 10-K / NT 10-Q), going-concern wording found by SEC full-text
// search, SEC XBRL financials (Altman Z'', cash runway, interest cover, share count), Form 4 open-market buys and sells,
// prices (unofficial Yahoo), FINRA daily short volume, state WARN layoff notices, open jobs on public job boards, and headline
// keyword rules (an AI model only writes summaries).
import { WARN_LINK, WARN_SRC, type JobsAgg, type StateLayoffs, type WarnAgg } from './labor.js';

export interface Fin {
  assets: number | null; liabilities: number | null; curAssets: number | null; curLiab: number | null; retained: number | null; equity: number | null;
  cash: number | null; ebitQ: number | null; revenueQ: number | null; revenueQPrev: number | null; ocfY: number | null; interestY: number | null;
  buybackY: number | null; sharesNow: number | null; sharesYearAgo: number | null; asOf: string | null;
}
export const EMPTY_FIN: Fin = { assets: null, liabilities: null, curAssets: null, curLiab: null, retained: null, equity: null, cash: null, ebitQ: null, revenueQ: null, revenueQPrev: null, ocfY: null, interestY: null, buybackY: null, sharesNow: null, sharesYearAgo: null, asOf: null };

export interface Event8K { date: string; items: string[]; url: string }
export interface LateFiling { form: string; date: string; url: string }
export interface GoingConcern { date: string; url: string; form: string }
export interface InsiderAgg { buys: number; sells: number; buyValue: number; sellValue: number; buyers: number }
export interface PriceStats { last: number; hi52: number; lo52: number; ddPct: number; offLowPct: number; r3m: number | null; rv20: number | null; above50: boolean | null }
export interface NewsHit { t: number; title: string; url: string; src: string; tags: string[]; side: 'weak' | 'turn' | 'none' }

export interface DistressInput {
  sym: string; name: string; sector: string; industry: string; hq: string; state: string; lat: number | null; lon: number | null;
  fin: Fin | null; events: Event8K[] | null; late: LateFiling[] | null; goingConcern: GoingConcern | null | undefined;
  insiders: InsiderAgg | null; price: PriceStats | null; shortVol: number | null; news: NewsHit[] | null;
  /** undefined = not read; null = read, nothing found */
  warn?: WarnAgg | null; jobs?: JobsAgg | null;
}
export type Side = 'weak' | 'turn';
export interface Signal { id: string; side: Side; pts: number; text: string; src: string; date?: string; url?: string }
export type Label = 'distressed' | 'watch' | 'turnaround' | 'healthy';
export interface DistressRow {
  sym: string; name: string; sector: string; industry: string; hq: string; state: string; lat: number | null; lon: number | null;
  weak: number; turn: number; label: Label; signals: Signal[];
  z: number | null; runwayMo: number | null; cover: number | null; shareChgPct: number | null; revChgPct: number | null;
  price: PriceStats | null; shortVol: number | null; news: NewsHit[]; missing: string[];
  warn: WarnAgg | null; jobs: JobsAgg | null;
  ai?: { summary: string; watch: string; model: string; at: number };
}

/** What each 8-K item number means (the ones that matter here). */
export const ITEM_TEXT: Record<string, string> = {
  '1.02': 'ended a material contract', '1.03': 'bankruptcy or receivership', '2.04': 'debt acceleration triggered', '2.05': 'exit / layoff / restructuring costs',
  '2.06': 'asset write-down (impairment)', '3.01': 'listing notice (a rule breach, or just a move to another exchange)', '4.01': 'changed auditor', '4.02': 'past financials can no longer be relied on',
  '5.02': 'director or officer left / joined', '1.01': 'new material agreement', '2.01': 'bought or sold a business', '8.01': 'other news',
};
const ITEM_PTS: Record<string, number> = { '1.03': 40, '2.04': 20, '3.01': 18, '4.02': 15, '2.05': 10, '2.06': 8, '4.01': 5, '1.02': 4 };

/** Headline keyword rules. Plain patterns so every tag can be explained; they miss nuance, so each hit is worth little. */
export const NEWS_RULES: { tag: string; side: Side; pts: number; re: RegExp }[] = [
  { tag: 'layoffs', side: 'weak', pts: 4, re: /\b(lay ?offs?|laid off|lays? off|laying off|job cuts?|cut(s|ting)? (\d[\d,]* )?(jobs|workforce|staff)|workforce reduction|headcount reduction)\b/i },
  { tag: 'restructuring', side: 'weak', pts: 3, re: /\b(restructur\w+|cost[- ]cutting|plant closures?|clos(e|es|ing) (plants?|stores?|factor(y|ies)))\b/i },
  { tag: 'guidance cut', side: 'weak', pts: 4, re: /\b(cuts?|lowers?|slash\w*|withdraw\w*|reduces?) (its |full[- ]year |annual )?(guidance|outlook|forecast)\b|\bwarns? (on|of) (profit|sales|revenue)/i },
  { tag: 'downgrade', side: 'weak', pts: 2, re: /\bdowngrade[sd]?\b/i },
  { tag: 'credit stress', side: 'weak', pts: 6, re: /\b(chapter 11|bankrupt\w*|default(s|ed)?|missed (a |an )?(interest |debt |bond )?payment|going concern|debt restructuring|distressed exchange|junk|liquidity crunch)\b/i },
  { tag: 'probe', side: 'weak', pts: 3, re: /\b(probe|investigation|subpoena|sec charges|fraud|class action|recall)\b/i },
  { tag: 'exec exit', side: 'weak', pts: 2, re: /\b(ceo|cfo|chief executive|chief financial)\b.{0,40}\b(resign\w*|steps? down|depart\w*|ousted|fired|exit\w*|leav\w*)\b/i },
  { tag: 'dividend cut', side: 'weak', pts: 4, re: /\b(cuts?|suspends?|slash\w*|eliminat\w*) (its |the )?(quarterly )?dividend\b/i },
  { tag: 'price cuts', side: 'weak', pts: 2, re: /\b(price cuts?|cuts? prices|discounting|price war)\b/i },
  { tag: 'guidance raised', side: 'turn', pts: 4, re: /\b(raises?|lifts?|boosts?|ups) (its |full[- ]year |annual )?(guidance|outlook|forecast)\b/i },
  { tag: 'upgrade', side: 'turn', pts: 2, re: /\bupgrade[sd]?\b/i },
  { tag: 'new hire', side: 'turn', pts: 2, re: /\b(names?|appoints?|hires?|taps?)\b.{0,40}\b(ceo|cfo|chief executive|chief financial|president)\b/i },
  { tag: 'buyback', side: 'turn', pts: 3, re: /\b(buyback|share repurchase|repurchase program|buy back)\b/i },
  { tag: 'big contract', side: 'turn', pts: 2, re: /\b(wins?|awarded|secures?|lands?) .{0,30}\b(contract|deal|order)\b/i },
  { tag: 'price increase', side: 'turn', pts: 2, re: /\b(price (increases?|hikes?)|raises? prices)\b/i },
  { tag: 'insider buying', side: 'turn', pts: 3, re: /\binsiders? (buy|bought|purchase)\w*\b/i },
];

export function tagHeadline(title: string): { tags: string[]; side: 'weak' | 'turn' | 'none' } {
  const hits = NEWS_RULES.filter((r) => r.re.test(title));
  // "price cuts" alone is weak; "raises prices" is turn; a headline with both sides is left neutral
  const w = hits.some((h) => h.side === 'weak'), t = hits.some((h) => h.side === 'turn');
  return { tags: hits.map((h) => h.tag), side: w && !t ? 'weak' : t && !w ? 'turn' : 'none' };
}

const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** Altman Z'' (the version for non-manufacturers, book equity instead of market value). Not used for banks, insurers and REITs. */
export function zScore(f: Fin, sector = ''): number | null {
  if (/financ|real estate|utilit/i.test(sector)) return null; // banks, insurers, REITs and utilities run on leverage by design
  const ta = f.assets, tl = f.liabilities;
  if (!ok(ta) || ta <= 0 || !ok(tl) || tl <= 0 || !ok(f.curAssets) || !ok(f.curLiab) || !ok(f.retained) || !ok(f.ebitQ)) return null;
  const eq = ok(f.equity) ? f.equity : ta - tl;
  return 6.56 * ((f.curAssets - f.curLiab) / ta) + 3.26 * (f.retained / ta) + 6.72 * ((f.ebitQ * 4) / ta) + 1.05 * (eq / tl);
}
/** Months of cash left at last year's operating cash burn (null when the company makes cash). */
export function runwayMonths(f: Fin): number | null {
  if (!ok(f.ocfY) || f.ocfY >= 0 || !ok(f.cash)) return null;
  return f.cash / (-f.ocfY / 12);
}
/** Operating profit (last quarter x 4) over last year's interest expense. */
export function interestCover(f: Fin): number | null {
  if (!ok(f.ebitQ) || !ok(f.interestY) || f.interestY <= 0) return null;
  return (f.ebitQ * 4) / f.interestY;
}
/** Share count change over a year, %. A jump that is close to a whole-number ratio (2:1, 3:1, 1:10…) is a stock split, not
 *  dilution or buybacks, so it returns null rather than a fake signal. */
export function shareChange(f: Fin): number | null {
  if (!ok(f.sharesNow) || !ok(f.sharesYearAgo) || f.sharesYearAgo <= 0 || f.sharesNow <= 0) return null;
  const r = f.sharesNow / f.sharesYearAgo;
  return splitRatio(f) != null ? null : (r - 1) * 100;
}
/** Share count ratio when it looks like a split: 4 = 4-for-1, 0.1 = 1-for-10 reverse split. */
export function splitRatio(f: Fin): number | null {
  if (!ok(f.sharesNow) || !ok(f.sharesYearAgo) || f.sharesYearAgo <= 0 || f.sharesNow <= 0) return null;
  const r = f.sharesNow / f.sharesYearAgo;
  for (const k of [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50]) { if (Math.abs(r / k - 1) < 0.06) return k; if (Math.abs(r * k - 1) < 0.06) return 1 / k; }
  return null;
}

/** Daily closes (oldest first) -> drawdown, distance from the low, 3-month return, 20-day realized volatility (annualized %). */
export function priceStats(closes: number[]): PriceStats | null {
  const c = closes.filter((x) => ok(x) && x > 0);
  if (c.length < 30) return null;
  const y = c.slice(-252), last = y[y.length - 1];
  const hi52 = Math.max(...y), lo52 = Math.min(...y);
  const r3m = c.length > 63 ? (last / c[c.length - 64] - 1) * 100 : null;
  const rets = c.slice(-21).map((v, i, a) => (i ? Math.log(v / a[i - 1]) : NaN)).slice(1);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1));
  const ma50 = c.length >= 50 ? c.slice(-50).reduce((a, b) => a + b, 0) / 50 : null;
  return { last, hi52, lo52, ddPct: (last / hi52 - 1) * 100, offLowPct: (last / lo52 - 1) * 100, r3m, rv20: rets.length >= 10 ? sd * Math.sqrt(252) * 100 : null, above50: ma50 == null ? null : last > ma50 };
}

const daysAgo = (d: string, today: string) => (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d.slice(0, 10)}T00:00:00Z`)) / 86400_000;
const fmtB = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : Math.abs(v) >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`);

/** Score one company. weak = signs of distress (0-100), turn = signs of strength or recovery (0-100). */
export function scoreCompany(x: DistressInput, today: string): DistressRow {
  const s: Signal[] = [];
  const missing: string[] = [];
  const add = (sig: Signal) => s.push(sig);

  // SEC 8-K items in the last 180 days
  if (x.events == null) missing.push('8-K filings');
  else {
    const recent = x.events.filter((e) => daysAgo(e.date, today) <= 180);
    const lowPrice = !!x.price && (x.price.last < 5 || x.price.ddPct <= -50);
    for (const [item, base] of Object.entries(ITEM_PTS)) {
      const hits = recent.filter((e) => e.items.includes(item));
      const pts = item === '3.01' && !lowPrice ? 4 : base;
      if (hits.length) add({ id: `8k-${item}`, side: 'weak', pts: Math.min(pts * hits.length, pts * 2), text: `8-K item ${item}: ${ITEM_TEXT[item]}${hits.length > 1 ? ` (${hits.length} times)` : ''}`, src: 'SEC 8-K', date: hits[0].date, url: hits[0].url });
    }
    const exec = recent.filter((e) => e.items.includes('5.02') && daysAgo(e.date, today) <= 120);
    if (exec.length >= 3) add({ id: '8k-5.02', side: 'weak', pts: Math.min(2 * exec.length, 6), text: `${exec.length} officer or director changes in 4 months (8-K 5.02)`, src: 'SEC 8-K', date: exec[0].date, url: exec[0].url });
  }
  if (x.late == null) missing.push('late-filing notices');
  else {
    const late = x.late.filter((l) => daysAgo(l.date, today) <= 365);
    if (late.length) add({ id: 'late', side: 'weak', pts: 20, text: `Filed late (${late.map((l) => l.form).join(', ')})`, src: 'SEC EDGAR', date: late[0].date, url: late[0].url });
  }
  if (x.goingConcern === undefined) missing.push('going-concern search');
  else if (x.goingConcern) add({ id: 'gc', side: 'weak', pts: 30, text: `Going-concern doubt wording in its ${x.goingConcern.form} (open the filing to check)`, src: 'SEC full-text search', date: x.goingConcern.date, url: x.goingConcern.url });

  // financials
  const f = x.fin;
  const z = f ? zScore(f, x.sector) : null;
  const runway = f ? runwayMonths(f) : null;
  const cover = f ? interestCover(f) : null;
  const shareChg = f ? shareChange(f) : null;
  const revChg = f && ok(f.revenueQ) && ok(f.revenueQPrev) && f.revenueQPrev > 0 ? (f.revenueQ / f.revenueQPrev - 1) * 100 : null;
  if (!f) missing.push('financials');
  else {
    if (z != null) {
      // Z'' reads low for big companies that bought back most of their stock (negative retained earnings). If cash flow is positive
      // and profit covers interest 3x+, it is shown but counts little.
      const cushioned = ok(f.ocfY) && f.ocfY > 0 && cover != null && cover >= 3;
      if (z < 1.1) add({ id: 'z', side: 'weak', pts: cushioned ? 4 : 18, text: `Altman Z'' ${z.toFixed(2)}: distress zone (under 1.1)${cushioned ? `, but cash flow is positive and profit covers interest ${cover!.toFixed(0)}x (Z'' often misreads heavy buyback companies)` : ''}`, src: 'SEC XBRL, calculated', date: f.asOf ?? undefined });
      else if (z < 2.6) add({ id: 'z', side: 'weak', pts: cushioned ? 2 : 6, text: `Altman Z'' ${z.toFixed(2)}: grey zone (1.1 to 2.6)`, src: 'SEC XBRL, calculated', date: f.asOf ?? undefined });
      else add({ id: 'z', side: 'turn', pts: 6, text: `Altman Z'' ${z.toFixed(2)}: safe zone`, src: 'SEC XBRL, calculated', date: f.asOf ?? undefined });
    }
    if (runway != null) {
      if (runway < 12) add({ id: 'runway', side: 'weak', pts: 15, text: `About ${runway.toFixed(0)} months of cash at last year's burn`, src: 'SEC XBRL, calculated' });
      else if (runway < 24) add({ id: 'runway', side: 'weak', pts: 7, text: `About ${runway.toFixed(0)} months of cash at last year's burn`, src: 'SEC XBRL, calculated' });
    } else if (ok(f.ocfY) && f.ocfY > 0) add({ id: 'ocf', side: 'turn', pts: 4, text: `Positive operating cash flow (${fmtB(f.ocfY)} last year)`, src: 'SEC XBRL' });
    if (cover != null && cover < 1.5) add({ id: 'cover', side: 'weak', pts: cover < 1 ? 12 : 7, text: cover < 0 ? 'Operating loss: no profit to cover interest' : `Operating profit covers interest only ${cover.toFixed(1)}x`, src: 'SEC XBRL, calculated' });
    const sp = splitRatio(f);
    if (sp != null && sp < 1) add({ id: 'rsplit', side: 'weak', pts: 8, text: `Reverse stock split (about 1-for-${Math.round(1 / sp)}) in the last year, often done to keep a listing`, src: 'SEC XBRL share count' });
    const acquired = (x.events ?? []).some((e) => e.items.includes('2.01'));
    if (shareChg != null && shareChg > 5) add({ id: 'dilution', side: 'weak', pts: acquired ? 2 : shareChg > 15 ? 10 : 6, text: acquired ? `Share count up ${shareChg.toFixed(1)}% in a year, with a completed acquisition (8-K 2.01): likely paid in stock` : `Share count up ${shareChg.toFixed(1)}% in a year (dilution)`, src: 'SEC XBRL' });
    if (shareChg != null && shareChg < -2) add({ id: 'shrink', side: 'turn', pts: shareChg < -4 ? 10 : 6, text: `Share count down ${Math.abs(shareChg).toFixed(1)}% in a year (buybacks)`, src: 'SEC XBRL' });
    else if (ok(f.buybackY) && f.buybackY > 0 && (!ok(f.assets) || f.buybackY > f.assets * 0.005)) add({ id: 'buyback', side: 'turn', pts: 3, text: `Bought back ${fmtB(f.buybackY)} of stock last year`, src: 'SEC XBRL' });
    if (revChg != null && revChg < -15) add({ id: 'rev', side: 'weak', pts: 6, text: `Quarterly revenue down ${Math.abs(revChg).toFixed(0)}% from a year earlier`, src: 'SEC XBRL' });
    if (revChg != null && revChg > 15) add({ id: 'rev', side: 'turn', pts: 4, text: `Quarterly revenue up ${revChg.toFixed(0)}% from a year earlier`, src: 'SEC XBRL' });
  }

  // insiders: open-market buys and sells only
  if (x.insiders == null) missing.push('insider filings');
  else {
    const i = x.insiders;
    if (i.buys > 0) add({ id: 'ins-buy', side: 'turn', pts: i.buyers >= 2 ? 22 : 14, text: `${i.buyers} insider${i.buyers === 1 ? '' : 's'} bought${i.buyValue > 0 ? ` ${fmtB(i.buyValue)}` : ''} on the open market (90 days)${i.buyValue > 0 ? '' : ', price not stated in the filing'}`, src: 'SEC Form 4' });
    if (i.sells > 0 && i.buys === 0 && i.sellValue >= 5e6) add({ id: 'ins-sell', side: 'weak', pts: 3, text: `Insiders sold ${fmtB(i.sellValue)}, no open-market buys (90 days). Often routine.`, src: 'SEC Form 4' });
  }

  // price
  const p = x.price;
  if (!p) missing.push('price history');
  else {
    if (p.ddPct <= -50) add({ id: 'dd', side: 'weak', pts: 12, text: `${Math.abs(p.ddPct).toFixed(0)}% below its 52-week high`, src: 'Yahoo prices (unofficial)' });
    else if (p.ddPct <= -30) add({ id: 'dd', side: 'weak', pts: 6, text: `${Math.abs(p.ddPct).toFixed(0)}% below its 52-week high`, src: 'Yahoo prices (unofficial)' });
    if (p.r3m != null && p.r3m <= -25) add({ id: 'r3m', side: 'weak', pts: 5, text: `Down ${Math.abs(p.r3m).toFixed(0)}% in 3 months`, src: 'Yahoo prices (unofficial)' });
    if (p.ddPct <= -25 && p.offLowPct >= 15 && p.above50) add({ id: 'off-low', side: 'turn', pts: 10, text: `Up ${p.offLowPct.toFixed(0)}% from its low and above its 50-day average`, src: 'Yahoo prices (unofficial)' });
  }
  if (x.shortVol != null && x.shortVol >= 0.55) add({ id: 'short', side: 'weak', pts: 3, text: `Short sales were ${(x.shortVol * 100).toFixed(0)}% of volume (5-day average)`, src: 'FINRA daily short volume' });

  // state WARN layoff notices (last 90 days) and open jobs on the company's own job board
  if (x.warn === undefined) missing.push("WARN notices");
  if (x.warn) {
    const w = x.warn;
    add({ id: 'warn', side: 'weak', pts: (w.jobs >= 500 ? 10 : w.jobs >= 100 ? 6 : 3) + (w.closure ? 3 : 0), text: `WARN layoff notices: ${w.jobs ? `${w.jobs.toLocaleString('en-US')} jobs` : `${w.notices} notice${w.notices === 1 ? '' : 's'}`} in ${w.states.join(', ')} (90 days)${w.closure ? ', including a site closure' : ''}`, src: WARN_SRC, date: w.latest, url: WARN_LINK });
  }
  const jb = x.jobs;
  if (jb) {
    const chg = (base: number | null) => (base != null && base >= 15 ? (jb.count / base - 1) * 100 : null);
    const c90 = chg(jb.d90), c30 = chg(jb.d30);
    if (c90 != null && c90 <= -40) add({ id: 'jobs', side: 'weak', pts: jb.count === 0 ? 8 : 6, text: `Open jobs down ${Math.abs(c90).toFixed(0)}% in 90 days (${jb.d90} to ${jb.count}): hiring slowdown`, src: `${jb.ats} job board`, url: jb.url });
    else if (c30 != null && c30 <= -35) add({ id: 'jobs', side: 'weak', pts: 4, text: `Open jobs down ${Math.abs(c30).toFixed(0)}% in 30 days (${jb.d30} to ${jb.count})`, src: `${jb.ats} job board`, url: jb.url });
    else if (c90 != null && c90 >= 30) add({ id: 'jobs', side: 'turn', pts: 5, text: `Open jobs up ${c90.toFixed(0)}% in 90 days (${jb.d90} to ${jb.count}): hiring`, src: `${jb.ats} job board`, url: jb.url });
  }

  // headlines (last 30 days), capped so news can never dominate
  const news = (x.news ?? []).filter((n) => daysAgo(new Date(n.t).toISOString(), today) <= 30);
  if (x.news == null) missing.push('news');
  for (const side of ['weak', 'turn'] as const) {
    const tags = new Map<string, NewsHit>();
    news.filter((n) => n.side === side).forEach((n) => n.tags.forEach((t) => { if (!tags.has(t)) tags.set(t, n); }));
    const pts = Math.min(side === 'weak' ? 15 : 12, [...tags.keys()].reduce((a, t) => a + (NEWS_RULES.find((r) => r.tag === t && r.side === side)?.pts ?? 0), 0));
    if (pts > 0) { const first = [...tags.values()][0]; add({ id: `news-${side}`, side, pts, text: `Headlines: ${[...tags.keys()].join(', ')}`, src: `${first.src} (keyword rules)`, date: new Date(first.t).toISOString().slice(0, 10), url: first.url }); }
  }

  const weak = Math.min(100, s.filter((g) => g.side === 'weak').reduce((a, g) => a + g.pts, 0));
  const turn = Math.min(100, s.filter((g) => g.side === 'turn').reduce((a, g) => a + g.pts, 0));
  const beaten = p ? p.ddPct <= -25 : weak >= 20;
  const label: Label = weak >= 40 ? 'distressed' : beaten && turn >= 20 && turn > weak ? 'turnaround' : weak >= 20 ? 'watch' : 'healthy';
  s.sort((a, b) => b.pts - a.pts);
  return {
    sym: x.sym, name: x.name, sector: x.sector, industry: x.industry, hq: x.hq, state: x.state, lat: x.lat, lon: x.lon,
    weak, turn, label, signals: s, z, runwayMo: runway, cover, shareChgPct: shareChg, revChgPct: revChg, price: p, shortVol: x.shortVol,
    news: news.filter((n) => n.side !== 'none').slice(0, 6), missing, warn: x.warn ?? null, jobs: x.jobs ?? null,
  };
}

export interface GroupRoll { key: string; n: number; distressed: number; watch: number; turnaround: number; avgWeak: number; avgTurn: number; medDd: number | null; stress: number; top: string[] }
/** Roll rows up by sector, industry or state. stress = average weak score + 40 x share of names flagged distressed or watch. */
export function rollup(rows: DistressRow[], by: (r: DistressRow) => string): GroupRoll[] {
  const g = new Map<string, DistressRow[]>();
  rows.forEach((r) => { const k = by(r); if (k) g.set(k, [...(g.get(k) ?? []), r]); });
  return [...g.entries()].map(([key, rs]) => {
    const dds = rs.map((r) => r.price?.ddPct).filter(ok).sort((a, b) => a - b);
    const n = rs.length, distressed = rs.filter((r) => r.label === 'distressed').length, watch = rs.filter((r) => r.label === 'watch').length;
    const avgWeak = rs.reduce((a, r) => a + r.weak, 0) / n;
    return {
      key, n, distressed, watch, turnaround: rs.filter((r) => r.label === 'turnaround').length, avgWeak, avgTurn: rs.reduce((a, r) => a + r.turn, 0) / n,
      medDd: dds.length ? dds[Math.floor(dds.length / 2)] : null, stress: avgWeak + 40 * ((distressed + watch) / n),
      top: [...rs].sort((a, b) => b.weak - a.weak).slice(0, 3).map((r) => r.sym),
    };
  }).sort((a, b) => b.stress - a.stress);
}

/** "Santa Clara, California" or "Dublin, Ireland" -> two-letter US state, or '' outside the US. */
const STATES: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'washington, d.c.': 'DC', 'd.c.': 'DC' };
export function stateOf(hq: string): string {
  const parts = hq.split(',').map((p) => p.trim().toLowerCase());
  for (let i = parts.length - 1; i >= 0; i--) { const v = STATES[parts[i]]; if (v) return v; if (/^[a-z]{2}$/.test(parts[i]) && Object.values(STATES).includes(parts[i].toUpperCase())) return parts[i].toUpperCase(); }
  return '';
}

export interface DistressFile {
  version: 1; asOf: number; today: string; universe: number; rows: DistressRow[]; sectors: GroupRoll[]; industries: GroupRoll[]; states: GroupRoll[];
  /** WARN notices per state for every employer (not only listed companies), last 90 days */
  layoffStates?: Record<string, StateLayoffs>;
  sources: Record<string, string>; errors: Record<string, string>; coverage: Record<string, number>;
}
/** Shape check for the published file (it comes from a GitHub Action, so never trust it blindly). */
export function parseDistressFile(j: any): { ok: true; file: DistressFile } | { ok: false; error: string } {
  if (!j || j.version !== 1) return { ok: false, error: 'missing version 1' };
  if (!Array.isArray(j.rows) || !Array.isArray(j.sectors)) return { ok: false, error: 'rows or sectors missing' };
  const bad = j.rows.find((r: any) => typeof r?.sym !== 'string' || !Number.isFinite(r?.weak) || !Number.isFinite(r?.turn) || !Array.isArray(r?.signals));
  if (bad) return { ok: false, error: `bad row ${String(bad?.sym ?? '?')}` };
  return { ok: true, file: j as DistressFile };
}
