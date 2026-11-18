import { describe, expect, it } from 'vitest';
import { basketsFor, phaseOf, scoreboard } from '../shared/macroextra';

describe('macro extras', () => {
  it('beat rates by sector', () => {
    const sec: Record<string, string> = { A: 'Tech', B: 'Tech', C: 'Energy' };
    const r = scoreboard([
      { sym: 'A', date: '', epsEst: 1, epsAct: 1.2, revEst: 10, revAct: 11 },
      { sym: 'B', date: '', epsEst: 1, epsAct: 0.9, revEst: 10, revAct: 9 },
      { sym: 'C', date: '', epsEst: 2, epsAct: 2.2, revEst: null, revAct: null },
      { sym: 'D', date: '', epsEst: 1, epsAct: 2, revEst: null, revAct: null },
      { sym: 'A', date: '', epsEst: 1, epsAct: null, revEst: null, revAct: null },
    ], (s) => sec[s] ?? null);
    expect(r.total.reported).toBe(3);
    expect(r.total.epsBeatPct).toBeCloseTo(66.67, 1);
    expect(r.sectors.find((s) => s.sector === 'Tech')).toMatchObject({ reported: 2, epsBeat: 1, revBeat: 1, revBeatPct: 50 });
  });
  it('maps questions to sector baskets', () => {
    expect(basketsFor('Fed decision in December?')[0].etfs).toContain('XLF');
    expect(basketsFor('Israel x Iran ceasefire')[0].etfs).toContain('XLE');
    expect(basketsFor('Who wins the Super Bowl?')).toEqual([]);
  });
  it('market phases in Eastern time', () => {
    expect(phaseOf(8 * 60, true)).toBe('premarket');
    expect(phaseOf(9 * 60 + 30, true)).toBe('open');
    expect(phaseOf(12 * 60, true)).toBe('midday');
    expect(phaseOf(15 * 60 + 30, true)).toBe('close');
    expect(phaseOf(17 * 60, true)).toBe('after');
    expect(phaseOf(12 * 60, false)).toBe('closed');
  });
});
