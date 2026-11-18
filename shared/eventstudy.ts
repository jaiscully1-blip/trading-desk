// Event study: the standard way to ask "did this kind of event move the stock?". For each dated event, the stock's
// normal relation to the market (alpha and beta) is fitted on the 120 trading days before it; the abnormal return is
// what the stock did beyond that each day, summed from 5 days before to 20 days after (cumulative abnormal return,
// CAR). Averaging many events of the same kind, with a t statistic across them, separates a real reaction from noise.
// Pure functions (tested).

export interface DayClose { d: string; c: number } // "YYYY-MM-DD"
export interface EventIn { date: string; group: string; label: string; after?: boolean } // after = announced after the close
export interface EventOut extends EventIn { day0: string; car: number[]; beta: number }
export interface GroupStat { group: string; n: number; path: number[]; react: number; drift: number; total: number; t: number; tDrift: number; pctUp: number }

export const PRE = 5, POST = 20, EST = 120;

const rets = (xs: DayClose[]) => xs.map((x, i) => (i ? (x.c / xs[i - 1].c - 1) * 100 : NaN));

export function eventStudy(stock: DayClose[], mkt: DayClose[], events: EventIn[]): EventOut[] {
  const m = new Map(mkt.map((x, i) => [x.d, i])), mr = rets(mkt), sr = rets(stock), out: EventOut[] = [];
  for (const e of events) {
    let i = stock.findIndex((x) => x.d >= e.date); if (i < 0) continue;
    if (e.after && stock[i].d === e.date) i++; // news after the close lands on the next session
    if (i - PRE - EST - 2 < 1 || i + POST >= stock.length) continue;
    // estimation window ends 6 days before day 0, so the run-up doesn't contaminate "normal"
    const xs: number[] = [], ys: number[] = [];
    for (let k = i - PRE - EST - 1; k < i - PRE - 1; k++) { const j = m.get(stock[k].d); if (j == null || !Number.isFinite(mr[j]) || !Number.isFinite(sr[k])) continue; xs.push(mr[j]); ys.push(sr[k]); }
    if (xs.length < EST * 0.7) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const vx = xs.reduce((a, b) => a + (b - mx) ** 2, 0); const beta = vx ? xs.reduce((a, b, k) => a + (b - mx) * (ys[k] - my), 0) / vx : 1, alpha = my - beta * mx;
    const car: number[] = []; let cum = 0, ok = true;
    for (let k = i - PRE; k <= i + POST; k++) { const j = m.get(stock[k].d); if (j == null || !Number.isFinite(sr[k])) { ok = false; break; } cum += sr[k] - (alpha + beta * mr[j]); car.push(cum); }
    if (ok) out.push({ ...e, day0: stock[i].d, car, beta });
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / (v.length || 1);
const tstat = (v: number[]) => { if (v.length < 3) return 0; const m = mean(v), sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); return sd ? m / (sd / Math.sqrt(v.length)) : 0; };

/** Average path and headline numbers per group. react = day -1 to +1; drift = day +2 to +20 (after the news is out). */
export function summarize(ev: EventOut[]): GroupStat[] {
  const by = new Map<string, EventOut[]>(); for (const e of ev) by.set(e.group, [...(by.get(e.group) ?? []), e]);
  const at = (e: EventOut, day: number) => e.car[day + PRE];
  return [...by].map(([group, xs]) => {
    const react = xs.map((e) => at(e, 1) - (PRE >= 2 ? at(e, -2) : 0)), drift = xs.map((e) => at(e, POST) - at(e, 1));
    return { group, n: xs.length, path: xs[0].car.map((_, k) => mean(xs.map((e) => e.car[k]))), react: mean(react), drift: mean(drift), total: mean(xs.map((e) => at(e, POST))), t: tstat(react), tDrift: tstat(drift), pctUp: xs.filter((e) => at(e, 1) - at(e, -2) > 0).length / xs.length };
  }).sort((a, b) => b.n - a.n);
}

/** Earnings rows -> events grouped by surprise. */
export function earningsEvents(rows: { date: string; eps: number | null; est: number | null; surprisePct: number | null; time?: string }[]): EventIn[] {
  return rows.filter((r) => r.date).map((r) => {
    const s = r.surprisePct ?? (r.eps != null && r.est ? ((r.eps - r.est) / Math.abs(r.est)) * 100 : null);
    const group = s == null ? 'Report (no estimate)' : s >= 5 ? 'Big beat (≥ 5%)' : s > 0 ? 'Beat' : s > -5 ? 'Miss' : 'Big miss (≤ −5%)';
    return { date: r.date, group, label: s == null ? 'Earnings report' : `EPS ${r.eps?.toFixed(2)} vs ${r.est?.toFixed(2)} (${s >= 0 ? '+' : ''}${s.toFixed(1)}%)`, after: /post|after/i.test(r.time ?? '') };
  });
}
