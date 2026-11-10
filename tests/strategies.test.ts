import { describe, expect, it } from 'vitest';
import { FAMILIES, STRATEGIES, familyCounts, filterStrategies } from '../shared/strategyLibrary';
import { PRESET_FILTERS } from '../src/lib/playbook';

describe('strategy library', () => {
  it('has 12 to 20 cards with unique ids and every field filled', () => {
    expect(STRATEGIES.length).toBeGreaterThanOrEqual(12);
    expect(STRATEGIES.length).toBeLessThanOrEqual(20);
    expect(new Set(STRATEGIES.map((s) => s.id)).size).toBe(STRATEGIES.length);
    for (const s of STRATEGIES) {
      for (const k of ['name', 'idea', 'needs', 'freeNote', 'optionsNote'] as const) expect(s[k].length).toBeGreaterThan(10);
      expect(['yes', 'partly', 'no']).toContain(s.free);
      expect(FAMILIES.map((f) => f.id)).toContain(s.family);
    }
  });
  it('covers every family', () => {
    for (const n of Object.values(familyCounts(STRATEGIES))) expect(n).toBeGreaterThan(0);
  });
  it('scanner buttons point at real preset filters', () => {
    const ids = new Set(PRESET_FILTERS.map((f) => f.id));
    for (const s of STRATEGIES) if (s.launch?.kind === 'scanner') expect(ids.has(s.launch.filterId)).toBe(true);
  });
  it('filters by family and by free data', () => {
    expect(filterStrategies(STRATEGIES, 'vol').every((s) => s.family === 'vol')).toBe(true);
    const free = filterStrategies(STRATEGIES, 'all', true);
    expect(free.some((s) => s.free === 'no')).toBe(false);
    expect(free.length).toBeLessThan(STRATEGIES.length);
    expect(filterStrategies(STRATEGIES)).toHaveLength(STRATEGIES.length);
  });
  it('never labels a card bullish or bearish', () => {
    expect(JSON.stringify(STRATEGIES).toLowerCase()).not.toMatch(/bullish|bearish/);
  });
});
