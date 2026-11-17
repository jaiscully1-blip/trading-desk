// Cross-fund 13F patterns: what most funds are buying, selling, trimming, adding, holding. Pure functions; the nightly/weekly
// script (scripts/f13-build.ts) feeds them the filings and writes published/f13.json. CALCULATED from public filings, 45+ days
// after quarter-end, long equity positions only (no shorts). Information, not advice. Nothing here can trade.
import type { F13Row } from './smartmoney.js';

export interface FundSnap { cik: string; who: string; cat: string; period: string; cur: F13Row[]; prev: F13Row[] | null }
export interface Holder { cik: string; who: string; weight: number; value: number; change: 'new' | 'added' | 'trimmed' | 'same' | 'sold' }
export interface StockAgg {
  cusip: string; name: string; sym: string | null;
  holders: number; holdersPrev: number; value: number; valuePrev: number; avgWeight: number; maxWeight: number;
  newN: number; addedN: number; trimmedN: number; soldN: number; sameN: number; netShares: number; netValue: number; netPct: number | null;
  top: Holder[];
}
export interface FundAgg { cik: string; who: string; cat: string; period: string; total: number; count: number; top10: number; newN: number; addedN: number; trimmedN: number; soldN: number; turnover: number | null }
export interface F13File { built: string; period: string; funds: number; skipped: Record<string, string>; stocks: StockAgg[]; fundStats: FundAgg[]; source: string }

const eq = (r: F13Row) => !r.putCall;

export function aggregate(snaps: FundSnap[], tickers: Record<string, string> = {}, keep = 600): { stocks: StockAgg[]; fundStats: FundAgg[] } {
  const by = new Map<string, StockAgg & { _pxs: number }>();
  const fundStats: FundAgg[] = [];
  for (const f of snaps) {
    const cur = f.cur.filter(eq), prev = f.prev ? f.prev.filter(eq) : null;
    const total = cur.reduce((s, r) => s + r.value, 0) || 1;
    const pm = new Map((prev ?? []).map((r) => [r.cusip, r]));
    const seen = new Set<string>();
    let newN = 0, addedN = 0, trimmedN = 0, soldN = 0, sameN = 0;
    const cm = new Map(cur.map((r) => [r.cusip, r]));
    const touch = (cusip: string, name: string) => {
      let a = by.get(cusip);
      if (!a) { a = { cusip, name, sym: tickers[cusip] ?? null, holders: 0, holdersPrev: 0, value: 0, valuePrev: 0, avgWeight: 0, maxWeight: 0, newN: 0, addedN: 0, trimmedN: 0, soldN: 0, sameN: 0, netShares: 0, netValue: 0, netPct: null, top: [], _pxs: 0 }; by.set(cusip, a); }
      return a;
    };
    for (const r of cur) {
      seen.add(r.cusip);
      const p = pm.get(r.cusip);
      const a = touch(r.cusip, r.name);
      const w = r.value / total;
      const px = r.shares ? r.value / r.shares : 0;
      if (px) a._pxs = a._pxs ? Math.max(a._pxs, px) : px;
      let change: Holder['change'] = 'same';
      if (prev) {
        if (!p) { change = 'new'; a.newN++; newN++; }
        else { const pct = p.shares ? ((r.shares - p.shares) / p.shares) * 100 : 0; if (Math.abs(pct) < 0.5) { a.sameN++; sameN++; } else if (pct > 0) { change = 'added'; a.addedN++; addedN++; } else { change = 'trimmed'; a.trimmedN++; trimmedN++; } }
      }
      a.holders++; a.value += r.value; a.avgWeight += w; a.maxWeight = Math.max(a.maxWeight, w);
      if (prev) { a.netShares += r.shares - (p?.shares ?? 0); a.valuePrev += p?.value ?? 0; if (p) a.holdersPrev++; }
      a.top.push({ cik: f.cik, who: f.who, weight: w, value: r.value, change });
    }
    if (prev) for (const p of prev) {
      if (cm.has(p.cusip)) continue;
      const a = touch(p.cusip, p.name);
      a.soldN++; soldN++; a.holdersPrev++; a.valuePrev += p.value; a.netShares -= p.shares;
      a.top.push({ cik: f.cik, who: f.who, weight: 0, value: 0, change: 'sold' });
      if (!a._pxs && p.shares) a._pxs = p.value / p.shares;
    }
    const top10 = [...cur].sort((x, y) => y.value - x.value).slice(0, 10).reduce((s, r) => s + r.value, 0) / total;
    const base = prev ? new Set([...prev.map((r) => r.cusip), ...cur.map((r) => r.cusip)]).size : 0;
    fundStats.push({ cik: f.cik, who: f.who, cat: f.cat, period: f.period, total: cur.reduce((s, r) => s + r.value, 0), count: cur.length, top10, newN, addedN, trimmedN, soldN, turnover: prev && base ? (newN + addedN + trimmedN + soldN) / base : null });
  }
  const stocks = [...by.values()].map(({ _pxs, ...a }) => {
    a.avgWeight = a.holders ? a.avgWeight / a.holders : 0;
    a.netValue = a.netShares * _pxs;
    a.netPct = a.valuePrev && _pxs ? (a.netShares * _pxs) / a.valuePrev : null; // net change as a share of what the same funds held before
    a.top = a.top.sort((x, y) => y.value - x.value).slice(0, 8);
    return a as StockAgg;
  }).sort((x, y) => y.value - x.value).slice(0, keep);
  return { stocks, fundStats };
}

// ---- views the page shows (all computed in the browser from the file) ----
export type Board = { key: string; title: string; note: string; rows: StockAgg[]; val: (s: StockAgg) => number; fmt: 'usd' | 'n' | 'pct'; diverge?: boolean };

const top = (xs: StockAgg[], f: (s: StockAgg) => number, n: number, dir: 1 | -1 = 1) => [...xs].sort((a, b) => dir * (f(b) - f(a))).slice(0, n);
export function boards(stocks: StockAgg[], n = 12): Board[] {
  const big = stocks.filter((s) => s.holders >= 3);
  return [
    { key: 'owned', title: 'Most widely owned', note: 'Number of tracked funds holding it now.', rows: top(stocks, (s) => s.holders, n), val: (s) => s.holders, fmt: 'n' },
    { key: 'bought', title: 'Biggest net buying ($)', note: 'Estimated dollars added across all funds (share change × recent price).', rows: top(stocks, (s) => s.netValue, n), val: (s) => s.netValue, fmt: 'usd' },
    { key: 'sold', title: 'Biggest net selling ($)', note: 'Estimated dollars sold across all funds.', rows: top(stocks, (s) => s.netValue, n, -1), val: (s) => s.netValue, fmt: 'usd' },
    { key: 'new', title: 'Most new positions', note: 'Funds that bought it for the first time this quarter.', rows: top(stocks, (s) => s.newN, n), val: (s) => s.newN, fmt: 'n' },
    { key: 'exit', title: 'Most full exits', note: 'Funds that sold the entire position.', rows: top(stocks, (s) => s.soldN, n), val: (s) => s.soldN, fmt: 'n' },
    { key: 'added', title: 'Most funds adding', note: 'Funds that bought more of a stock they already owned.', rows: top(stocks, (s) => s.addedN, n), val: (s) => s.addedN, fmt: 'n' },
    { key: 'trimmed', title: 'Most funds trimming', note: 'Funds that sold some but kept the rest.', rows: top(stocks, (s) => s.trimmedN, n), val: (s) => s.trimmedN, fmt: 'n' },
    { key: 'fav', title: 'Gaining favor (holders vs last quarter)', note: 'Change in the number of funds holding it.', rows: top(big, (s) => s.holders - s.holdersPrev, n), val: (s) => s.holders - s.holdersPrev, fmt: 'n' },
    { key: 'unfav', title: 'Losing favor (holders vs last quarter)', note: 'Fewer funds hold it than last quarter.', rows: top(big, (s) => s.holders - s.holdersPrev, n, -1), val: (s) => s.holders - s.holdersPrev, fmt: 'n' },
    { key: 'conv', title: 'Highest conviction (avg % of portfolio)', note: 'Average weight among funds that hold it (3+ holders). Big weight means a big bet for those funds.', rows: top(big, (s) => s.avgWeight, n), val: (s) => s.avgWeight, fmt: 'pct' },
    { key: 'crowd', title: 'Most crowded ($ held)', note: 'Total value held by the tracked funds. Crowded trades can unwind together.', rows: top(stocks, (s) => s.value, n), val: (s) => s.value, fmt: 'usd' },
    { key: 'split', title: 'Most disagreement', note: 'Funds buying and funds selling at the same time (the smaller side counts).', rows: top(stocks.filter((s) => s.holders >= 4), (s) => Math.min(s.newN + s.addedN, s.trimmedN + s.soldN), n), val: (s) => Math.min(s.newN + s.addedN, s.trimmedN + s.soldN), fmt: 'n' },
  ];
}

/** buyers vs sellers: share of funds that moved in each direction among those that changed anything */
export function breadth(stocks: StockAgg[]) { const b = stocks.reduce((s, x) => s + x.newN + x.addedN, 0), t = stocks.reduce((s, x) => s + x.trimmedN + x.soldN, 0); return { buys: b, sells: t, ratio: b + t ? b / (b + t) : null }; }
