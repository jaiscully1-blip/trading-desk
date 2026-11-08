// Level ladder: every chart level (prior-day, premarket, opening range, VWAP, gamma walls and flip) in price order, with
// where the last price sits between them and how far each one is. Pure, so it is unit-tested.
export interface LadderIn { key: string; short: string; label: string; value: number | null; kind: 'level' | 'gamma' }
export interface LadderRow { key: string; short: string; label: string; value: number; kind: 'level' | 'gamma' | 'last'; dist: number }
/** Levels kept by the "Swing" preset: prior-day range and the options walls; the intraday ones (VWAP, opening range, premarket) are hidden. */
export const SWING_KEYS = new Set(['pdh', 'pdl', 'pdc', 'callWall', 'putWall', 'flip']);

export function buildLadder(items: LadderIn[], last: number, swing: boolean): LadderRow[] {
  if (!(last > 0)) return [];
  const rows: LadderRow[] = items
    .filter((i) => i.value != null && Number.isFinite(i.value) && (!swing || SWING_KEYS.has(i.key)))
    .map((i) => ({ key: i.key, short: i.short, label: i.label, value: i.value as number, kind: i.kind, dist: ((i.value as number) / last - 1) * 100 }));
  rows.push({ key: 'last', short: 'LAST', label: 'Last price', value: last, kind: 'last', dist: 0 });
  return rows.sort((a, b) => b.value - a.value);
}
/** key of the level nearest to the last price (never the "last" row itself) */
export const nearestKey = (rows: LadderRow[]): string | null => rows.filter((r) => r.kind !== 'last').sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist))[0]?.key ?? null;
/** "+0.4%" / "-1.2%" */
export const distLabel = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(Math.abs(d) < 10 ? 1 : 0)}%`;
