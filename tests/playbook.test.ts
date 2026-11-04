import { describe, expect, it } from 'vitest';
import { DEFAULT_PLAYBOOKS, gradeRow, matches, PRESET_FILTERS, type Playbook } from '../src/lib/playbook';
import { computeBase, liveRow, type ScanRow } from '../shared/scan';
import { encodeEtWall } from '../shared/parse';
import { barsFrom, ramp } from './helpers';

const row = (patch: Partial<ScanRow> = {}): ScanRow => {
  const b = computeBase('AAA', barsFrom(ramp(50, 100, 120)), encodeEtWall('2026-11-03 17:00:00'), 0, 't');
  return { ...liveRow(b, undefined, undefined), ...patch };
};

const pb = (criteria: Playbook['criteria']): Playbook => ({ id: 'x', name: 'x', criteria });

describe('playbook grading', () => {
  it('scores passed weight over evaluable weight and maps to A+..C', () => {
    const p = pb([
      { id: '1', type: 'rvolMin', weight: 3, enabled: true, min: 2 },
      { id: '2', type: 'aboveSma20', weight: 2, enabled: true },
      { id: '3', type: 'rsRankMin', weight: 5, enabled: true, min: 80 },
    ]);
    expect(gradeRow(p, row({ rvol: 2.5, above20: true, rsRank: 90 })).grade).toBe('A+');
    const g = gradeRow(p, row({ rvol: 1, above20: true, rsRank: 90 })); // 7/10
    expect(g.score).toBeCloseTo(70);
    expect(g.grade).toBe('B');
    expect(gradeRow(p, row({ rvol: 1, above20: false, rsRank: 10 })).grade).toBe('C');
  });

  it('leaves criteria without data out of the score and flags partial grades', () => {
    const p = pb([
      { id: '1', type: 'aboveVwap', weight: 4, enabled: true },
      { id: '2', type: 'catalyst', weight: 4, enabled: true },
      { id: '3', type: 'aboveSma20', weight: 2, enabled: true },
    ]);
    const g = gradeRow(p, row({ above20: true, catalyst: null }), {}); // only 2 of 10 weight evaluable
    expect(g.score).toBe(100);
    expect(g.partial).toBe(true);
    expect(g.results.map((r) => r.status)).toEqual(['na', 'na', 'pass']);
    expect(gradeRow(p, row({ above20: true, catalyst: true, last: 101 }), { vwap: 100 }).partial).toBe(false);
  });

  it('ignores disabled and zero-weight criteria', () => {
    const p = pb([
      { id: '1', type: 'aboveSma20', weight: 2, enabled: true },
      { id: '2', type: 'rvolMin', weight: 5, enabled: false, min: 9 },
      { id: '3', type: 'breakout52w', weight: 0, enabled: true },
    ]);
    expect(gradeRow(p, row({ above20: true })).results).toHaveLength(1);
  });

  it('ships two default playbooks', () => {
    expect(DEFAULT_PLAYBOOKS.map((p) => p.name)).toEqual(['Momentum A+', 'Swing breakout']);
  });
});

describe('filters', () => {
  const f = (id: string) => PRESET_FILTERS.find((x) => x.id === id)!;
  it('gappers use the absolute gap; missing data never matches', () => {
    expect(matches(row({ gapPct: -4 }), f('gappers'))).toBe(true);
    expect(matches(row({ gapPct: 1 }), f('gappers'))).toBe(false);
    expect(matches(row({ gapPct: null }), f('gappers'))).toBe(false);
  });
  it('grade filter uses the playbook grade', () => {
    const g = gradeRow(pb([{ id: '1', type: 'aboveSma20', weight: 1, enabled: true }]), row({ above20: true }));
    expect(matches(row(), f('aplus'), g)).toBe(true);
  });
  it('custom multi-condition filters AND together', () => {
    const custom = { id: 'c', name: 'c', conds: [{ field: 'rvol' as const, op: '>=' as const, value: 2 }, { field: 'rsRank' as const, op: '>=' as const, value: 80 }] };
    expect(matches(row({ rvol: 3, rsRank: 85 }), custom)).toBe(true);
    expect(matches(row({ rvol: 3, rsRank: 50 }), custom)).toBe(false);
  });
});
