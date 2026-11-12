// Playbooks: your A+ setup defined once as weighted criteria. Every scanned ticker gets graded A+ to C.
import type { ScanRow } from '../../shared/scan';

export type CritType =
  | 'rvolMin' | 'aboveSma20' | 'aboveSma50' | 'gapRange' | 'rsRankMin' | 'catalyst' | 'aboveVwap'
  | 'atrPctRange' | 'breakout20' | 'breakout52w' | 'volTrendMin' | 'bullFlag' | 'cupHandle' | 'priceRange';

export interface Criterion {
  id: string;
  type: CritType;
  weight: number; // 0-5
  enabled: boolean;
  min?: number;
  max?: number;
}
export interface Playbook {
  id: string;
  name: string;
  criteria: Criterion[];
}

type Params = 'min' | 'max' | 'range' | 'none';
export const CRIT_META: Record<CritType, { label: string; params: Params; unit?: string; help: string }> = {
  rvolMin: { label: 'Relative volume ≥', params: 'min', unit: 'x', help: "Today's volume vs 20-day average, time-of-day adjusted" },
  aboveSma20: { label: 'Price above 20-day average', params: 'none', help: 'Last price > 20-day simple moving average' },
  aboveSma50: { label: 'Price above 50-day average', params: 'none', help: 'Last price > 50-day simple moving average' },
  gapRange: { label: 'Gap % between', params: 'range', unit: '%', help: "Today's open vs prior close" },
  rsRankMin: { label: 'RS percentile ≥', params: 'min', help: 'Relative strength rank vs SPY (5/20/60 days) within your scan universe' },
  catalyst: { label: 'Catalyst present', params: 'none', help: 'Company news in the last 24 hours' },
  aboveVwap: { label: 'Above VWAP', params: 'none', help: 'Last price above session VWAP. Only for tickers with intraday candles loaded (SPY, QQQ, the chart ticker)' },
  atrPctRange: { label: 'ATR % between', params: 'range', unit: '%', help: '14-day average true range as % of price' },
  breakout20: { label: 'Above 20-day high', params: 'none', help: 'Last price above the highest high of the prior 20 sessions' },
  breakout52w: { label: 'Above 52-week high', params: 'none', help: 'Last price above the highest high of the prior 252 sessions' },
  volTrendMin: { label: 'Volume rising ≥', params: 'min', unit: 'x', help: '5-day average volume vs 20-day average' },
  bullFlag: { label: 'Bull flag', params: 'none', help: 'Pole ≥15% in ≤10 bars, then a 3-15 bar flag holding ≥50% on lighter volume' },
  cupHandle: { label: 'Cup and handle', params: 'none', help: '12-35% rounded cup with matching rims and a shallow handle in the upper half' },
  priceRange: { label: 'Price between', params: 'range', unit: '$', help: 'Last price range' },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const c = (type: CritType, weight: number, min?: number, max?: number): Criterion => ({ id: uid(), type, weight, enabled: true, min, max });

export const DEFAULT_PLAYBOOKS: Playbook[] = [
  {
    id: 'momo-a-plus',
    name: 'Momentum A+',
    criteria: [c('rvolMin', 3, 2), c('aboveSma20', 2), c('aboveSma50', 2), c('gapRange', 1, 2, 15), c('rsRankMin', 3, 80), c('catalyst', 2), c('aboveVwap', 2), c('atrPctRange', 1, 3, 10)],
  },
  {
    id: 'swing-breakout',
    name: 'Swing breakout',
    criteria: [c('breakout20', 3), c('rsRankMin', 3, 70), c('aboveSma50', 2), c('volTrendMin', 2, 1.3), c('rvolMin', 1, 1.5), c('bullFlag', 1), c('cupHandle', 1)],
  },
];

export type CritStatus = 'pass' | 'fail' | 'na';
export interface CritResult { c: Criterion; status: CritStatus; value: string }
export type Grade = 'A+' | 'A' | 'B' | 'C';
export interface GradeResult { grade: Grade; score: number; results: CritResult[]; partial: boolean }

const f1 = (x: number) => x.toFixed(1);
const inRange = (x: number, c: Criterion) => (c.min == null || x >= c.min) && (c.max == null || x <= c.max);

export function evaluate(c: Criterion, r: ScanRow, ctx: { vwap?: number } = {}): CritResult {
  const res = (status: CritStatus, value: string): CritResult => ({ c, status, value });
  const bool = (v: boolean | null, label: string) => (v == null ? res('na', 'no data') : res(v ? 'pass' : 'fail', label));
  switch (c.type) {
    case 'rvolMin': return r.rvol == null ? res('na', 'no volume yet') : res(r.rvol >= (c.min ?? 0) ? 'pass' : 'fail', `${f1(r.rvol)}x`);
    case 'aboveSma20': return bool(r.above20, r.base.sma20 ? `20D ${r.base.sma20.toFixed(2)}` : '');
    case 'aboveSma50': return bool(r.above50, r.base.sma50 ? `50D ${r.base.sma50.toFixed(2)}` : '');
    case 'gapRange': return r.gapPct == null ? res('na', 'before open') : res(inRange(r.gapPct, c) ? 'pass' : 'fail', `${f1(r.gapPct)}%`);
    case 'rsRankMin': return r.rsRank == null ? res('na', 'not ranked') : res(r.rsRank >= (c.min ?? 0) ? 'pass' : 'fail', `${r.rsRank}`);
    case 'catalyst': return r.catalyst == null ? res('na', 'news n/a') : res(r.catalyst ? 'pass' : 'fail', r.catalyst ? `${r.base.catalyst?.count} headline(s)` : 'none in 24h');
    case 'aboveVwap': return ctx.vwap == null ? res('na', 'no intraday') : res(r.last > ctx.vwap ? 'pass' : 'fail', `VWAP ${ctx.vwap.toFixed(2)}`);
    case 'atrPctRange': return r.atrPct == null ? res('na', 'no data') : res(inRange(r.atrPct, c) ? 'pass' : 'fail', `${f1(r.atrPct)}%`);
    case 'breakout20': return bool(r.brk20, r.base.hi20 ? `20D hi ${r.base.hi20.toFixed(2)}` : '');
    case 'breakout52w': return bool(r.brk52, r.base.hi252 ? `52W hi ${r.base.hi252.toFixed(2)}` : '');
    case 'volTrendMin': return Number.isFinite(r.volTrend) ? res(r.volTrend >= (c.min ?? 0) ? 'pass' : 'fail', `${f1(r.volTrend)}x`) : res('na', 'no data');
    case 'bullFlag': return res(r.bullFlag.ok ? 'pass' : 'fail', r.bullFlag.detail ?? 'none');
    case 'cupHandle': return res(r.cupHandle.ok ? 'pass' : 'fail', r.cupHandle.detail ?? 'none');
    case 'priceRange': return Number.isFinite(r.last) ? res(inRange(r.last, c) ? 'pass' : 'fail', r.last.toFixed(2)) : res('na', 'no price');
  }
}

export const GRADE_CUTS: [Grade, number][] = [['A+', 90], ['A', 80], ['B', 65], ['C', 0]];

/** Score = weight passed / weight that could be evaluated. "partial" when under half the weight had data. */
export function gradeRow(pb: Playbook, r: ScanRow, ctx: { vwap?: number } = {}): GradeResult {
  const results = pb.criteria.filter((c) => c.enabled && c.weight > 0).map((c) => evaluate(c, r, ctx));
  const total = results.reduce((s, x) => s + x.c.weight, 0);
  const evald = results.filter((x) => x.status !== 'na').reduce((s, x) => s + x.c.weight, 0);
  const passed = results.filter((x) => x.status === 'pass').reduce((s, x) => s + x.c.weight, 0);
  const score = evald ? (passed / evald) * 100 : 0;
  const grade = GRADE_CUTS.find(([, cut]) => score >= cut)![0];
  return { grade, score, results, partial: total > 0 && evald / total < 0.5 };
}

export const gradeRank = (g: Grade) => ['C', 'B', 'A', 'A+'].indexOf(g);

/* ---------------- saved filters ---------------- */
export type FilterField =
  | 'absGap' | 'gapPct' | 'rvol' | 'rsRank' | 'chgPct' | 'atrPct' | 'last'
  | 'above20' | 'above50' | 'brk20' | 'brk50' | 'brk52' | 'gapAndGo' | 'squeeze' | 'bullFlag' | 'cupHandle' | 'catalyst' | 'grade' | 'floatM' | 'siFloatPct';
export interface Cond { field: FilterField; op: '>=' | '<=' | 'is'; value: number }
export interface SavedFilter { id: string; name: string; conds: Cond[]; builtin?: boolean }

export const FIELD_META: Record<FilterField, { label: string; kind: 'num' | 'bool' | 'grade' }> = {
  absGap: { label: '|Gap %|', kind: 'num' }, gapPct: { label: 'Gap %', kind: 'num' }, rvol: { label: 'RVOL', kind: 'num' },
  rsRank: { label: 'RS rank', kind: 'num' }, chgPct: { label: 'Change %', kind: 'num' }, atrPct: { label: 'ATR %', kind: 'num' },
  last: { label: 'Price', kind: 'num' }, above20: { label: 'Above 20D avg', kind: 'bool' }, above50: { label: 'Above 50D avg', kind: 'bool' },
  brk20: { label: '20-day breakout', kind: 'bool' }, brk50: { label: '50-day breakout', kind: 'bool' }, brk52: { label: '52-week breakout', kind: 'bool' },
  gapAndGo: { label: 'Gap-and-go', kind: 'bool' }, squeeze: { label: 'Squeeze', kind: 'bool' }, bullFlag: { label: 'Bull flag', kind: 'bool' },
  cupHandle: { label: 'Cup & handle', kind: 'bool' }, catalyst: { label: 'Catalyst', kind: 'bool' }, grade: { label: 'Grade ≥', kind: 'grade' },
  floatM: { label: 'Float (M shares, est.)', kind: 'num' }, siFloatPct: { label: 'Short % of float', kind: 'num' },
};

export const PRESET_FILTERS: SavedFilter[] = [
  { id: 'all', name: 'All', conds: [], builtin: true },
  { id: 'gappers', name: 'Gappers ≥3%', conds: [{ field: 'absGap', op: '>=', value: 3 }], builtin: true },
  { id: 'rvol', name: 'RVOL ≥2', conds: [{ field: 'rvol', op: '>=', value: 2 }], builtin: true },
  { id: 'brk', name: '20/50D breakout', conds: [{ field: 'brk20', op: 'is', value: 1 }], builtin: true },
  { id: 'hi52', name: '52W high', conds: [{ field: 'brk52', op: 'is', value: 1 }], builtin: true },
  { id: 'gapgo', name: 'Gap-and-go', conds: [{ field: 'gapAndGo', op: 'is', value: 1 }], builtin: true },
  { id: 'squeeze', name: 'Squeeze', conds: [{ field: 'squeeze', op: 'is', value: 1 }], builtin: true },
  { id: 'lowfloat', name: 'Float ≤50M', conds: [{ field: 'floatM', op: '<=', value: 50 }], builtin: true },
  { id: 'patterns', name: 'Flag / cup', conds: [], builtin: true },
  { id: 'aplus', name: 'Grade A+', conds: [{ field: 'grade', op: '>=', value: 3 }], builtin: true },
];

export function fieldValue(r: ScanRow, f: FilterField, g?: GradeResult): number | boolean | null {
  switch (f) {
    case 'absGap': return r.gapPct == null ? null : Math.abs(r.gapPct);
    case 'bullFlag': return r.bullFlag.ok;
    case 'cupHandle': return r.cupHandle.ok;
    case 'grade': return g ? gradeRank(g.grade) : null;
    default: return (r as unknown as Record<string, number | boolean | null>)[f] ?? null;
  }
}

export function matches(r: ScanRow, f: SavedFilter, g?: GradeResult): boolean {
  if (f.id === 'patterns') return r.bullFlag.ok || r.cupHandle.ok;
  return f.conds.every((c) => {
    const v = fieldValue(r, c.field, g);
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return false;
    if (c.op === 'is') return Boolean(v) === Boolean(c.value);
    return c.op === '>=' ? (v as number) >= c.value : (v as number) <= c.value;
  });
}
