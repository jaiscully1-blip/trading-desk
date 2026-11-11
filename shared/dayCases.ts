// Daily bull / bear / stagnant cases for an index, weighted by HISTORICAL BASE RATES: how often past days like today closed up,
// flat or down. Not a forecast and not a trade signal: no entries, stops, targets, calls or puts. CALCULATED from daily history.
//
// A day's outcome is measured against that day's normal move (sigma = standard deviation of the prior 20 daily returns):
//   bull = closed up more than 0.25 sigma · bear = closed down more than 0.25 sigma · stagnant = in between.
// "Days like today" are looked at one factor at a time (weekday, premarket gap, volatility regime, each measured event), so every
// percentage can be checked with its own sample size. The blended row shrinks small samples toward the all-days rate.

import type { EventDay, EventStat } from './eventDays.js';

export type Case = 'bull' | 'stag' | 'bear';
export interface Dist { bull: number; stag: number; bear: number; n: number }
export interface Factor { id: string; label: string; dist: Dist }
export interface Bar { date: string; open: number; high: number; low: number; close: number }
export interface Premarket { last: number; high: number | null; low: number | null; at: number }
export interface SymCases {
  sym: string; date: string; prevClose: number; prevHigh: number; prevLow: number; sigmaPct: number; gapPct: number | null; gapBucket: string | null;
  volRegime: 'calm' | 'normal' | 'stormy'; blend: Dist; base: Dist; factors: Factor[];
  levels: { up1: number; down1: number; flatHi: number; flatLo: number; pmHigh: number | null; pmLow: number | null };
  cases: { id: Case; label: string; p: number; confirms: string; range: string }[];
}

export const CASE_THRESHOLD = 0.25;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dow = (s: string) => new Date(`${s}T12:00:00Z`).getUTCDay();

interface Day { date: string; ret: number; sigma: number; outcome: Case; gapSig: number | null; volPct: number }

/** Daily OHLC -> each day's outcome, its gap at the open (in sigmas) and where its volatility sat in the prior year (percentile). */
export function classifyDays(bars: Bar[]): Day[] {
  const out: Day[] = [];
  const sigmas: number[] = [];
  for (let i = 21; i < bars.length; i++) {
    const rets: number[] = [];
    for (let k = i - 20; k < i; k++) rets.push(bars[k].close / bars[k - 1].close - 1);
    const m = rets.reduce((a, b) => a + b, 0) / 20;
    const sigma = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / 19);
    sigmas.push(sigma);
    const ret = bars[i].close / bars[i - 1].close - 1;
    const gap = bars[i].open > 0 ? bars[i].open / bars[i - 1].close - 1 : NaN;
    const prior = sigmas.slice(-252, -1);
    const volPct = prior.length ? prior.filter((s) => s < sigma).length / prior.length : 0.5;
    if (!(sigma > 0) || !Number.isFinite(ret)) continue;
    out.push({ date: bars[i].date, ret, sigma, outcome: ret > CASE_THRESHOLD * sigma ? 'bull' : ret < -CASE_THRESHOLD * sigma ? 'bear' : 'stag', gapSig: Number.isFinite(gap) && gap !== 0 ? gap / sigma : null, volPct });
  }
  return out;
}

export const gapBucket = (g: number | null): string | null => (g == null ? null : g <= -1 ? 'big gap down' : g <= -0.25 ? 'gap down' : g < 0.25 ? 'flat open' : g < 1 ? 'gap up' : 'big gap up');
const volRegime = (p: number): 'calm' | 'normal' | 'stormy' => (p < 0.33 ? 'calm' : p > 0.67 ? 'stormy' : 'normal');

export function dist(days: Day[]): Dist {
  const n = days.length || 1;
  return { bull: days.filter((d) => d.outcome === 'bull').length / n, stag: days.filter((d) => d.outcome === 'stag').length / n, bear: days.filter((d) => d.outcome === 'bear').length / n, n: days.length };
}
/** Blend factor rates with the all-days rate: each factor counts with weight n / (n + 60), so thin samples barely move it. */
export function blend(base: Dist, factors: Factor[]): Dist {
  const lean = { bull: 0, stag: 0, bear: 0 };
  for (const f of factors) {
    const w = f.dist.n / (f.dist.n + 60);
    for (const k of ['bull', 'stag', 'bear'] as const) lean[k] += w * (f.dist[k] - base[k]);
  }
  const raw = { bull: Math.max(0.02, base.bull + lean.bull), stag: Math.max(0.02, base.stag + lean.stag), bear: Math.max(0.02, base.bear + lean.bear) };
  const t = raw.bull + raw.stag + raw.bear;
  return { bull: raw.bull / t, stag: raw.stag / t, bear: raw.bear / t, n: base.n };
}

/**
 * Cases for one index today.
 * history: daily bars up to and including the last completed session (oldest first). today: the session being planned.
 * pm: premarket quote if there is one (gives the gap). events: every event day; stats: which kinds have a measured effect.
 */
export function dayCases(sym: string, history: Bar[], today: string, pm: Premarket | null, events: EventDay[], stats: EventStat[], years = 15): SymCases | null {
  if (history.length < 300) return null;
  const all = classifyDays(history);
  const since = `${Number(today.slice(0, 4)) - years}${today.slice(4)}`;
  const days = all.filter((d) => d.date >= since);
  const last = history[history.length - 1];
  const tail = history.slice(-21);
  const rets = tail.slice(1).map((b, i) => b.close / tail[i].close - 1);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sigma = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1));
  const lastDay = all[all.length - 1];
  const regime = volRegime(lastDay?.volPct ?? 0.5);
  const gapPct = pm && Number.isFinite(pm.last) ? (pm.last / last.close - 1) * 100 : null;
  const gb = gapBucket(gapPct != null && sigma > 0 ? gapPct / 100 / sigma : null);

  const base = dist(days);
  const factors: Factor[] = [];
  const wd = dow(today);
  factors.push({ id: 'weekday', label: `${WEEKDAY[wd]}s`, dist: dist(days.filter((d) => dow(d.date) === wd)) });
  if (gb) factors.push({ id: 'gap', label: `Days that opened with a ${gb}`, dist: dist(days.filter((d) => gapBucket(d.gapSig) === gb)) });
  factors.push({ id: 'vol', label: `${regime[0].toUpperCase()}${regime.slice(1)} volatility (by the last 20 days vs the past year)`, dist: dist(days.filter((d) => volRegime(d.volPct) === regime)) });
  const measured = new Map(stats.filter((s) => s.measured).map((s) => [s.kind, s]));
  for (const e of events.filter((x) => x.date === today && measured.has(x.kind))) {
    const dates = new Set(events.filter((x) => x.kind === e.kind).map((x) => x.date));
    factors.push({ id: `event:${e.kind}`, label: measured.get(e.kind)!.label, dist: dist(days.filter((d) => dates.has(d.date))) });
  }
  const b = blend(base, factors);
  const px = (v: number) => v.toFixed(2);
  const up1 = last.close * (1 + sigma), down1 = last.close * (1 - sigma);
  const flatHi = last.close * (1 + CASE_THRESHOLD * sigma), flatLo = last.close * (1 - CASE_THRESHOLD * sigma);
  return {
    sym, date: today, prevClose: last.close, prevHigh: last.high, prevLow: last.low, sigmaPct: sigma * 100, gapPct, gapBucket: gb, volRegime: regime, blend: b, base, factors,
    levels: { up1, down1, flatHi, flatLo, pmHigh: pm?.high ?? null, pmLow: pm?.low ?? null },
    cases: [
      { id: 'bull', label: 'Bull case', p: b.bull, confirms: `holds above ${px(last.close)} (yesterday's close) and clears ${px(last.high)} (yesterday's high)${pm?.high ? ` and ${px(pm.high)} (premarket high)` : ''}`, range: `a normal up day reaches about ${px(up1)}` },
      { id: 'stag', label: 'Stagnant case', p: b.stag, confirms: `stays between ${px(flatLo)} and ${px(flatHi)} at the close (within ±${(CASE_THRESHOLD * sigma * 100).toFixed(2)}%), likely inside ${px(last.low)} to ${px(last.high)}`, range: `a quiet day: option premium decays` },
      { id: 'bear', label: 'Bear case', p: b.bear, confirms: `loses ${px(last.close)} and breaks ${px(last.low)} (yesterday's low)${pm?.low ? ` and ${px(pm.low)} (premarket low)` : ''}`, range: `a normal down day reaches about ${px(down1)}` },
    ],
  };
}

/** After the close: which case played out (for the after-close review and the running hit rate). */
export const caseOf = (ret: number, sigma: number): Case => (ret > CASE_THRESHOLD * sigma ? 'bull' : ret < -CASE_THRESHOLD * sigma ? 'bear' : 'stag');
