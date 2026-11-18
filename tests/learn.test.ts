import { describe, expect, it } from 'vitest';
import { GLOSSARY, PATH, RESOURCES, STRATEGIES, TOPICS, resourceById, searchResources } from '../shared/learn';
import { baseRate, outcome, pickCut, SHOW } from '../shared/chartgame';

describe('learn content', () => {
  it('has unique ids, https links and every topic covered', () => {
    const ids = RESOURCES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of RESOURCES) expect(r.url.startsWith('https://')).toBe(true);
    for (const t of TOPICS) expect(RESOURCES.some((r) => r.topics.includes(t.id))).toBe(true);
  });
  it('strategy sources and path steps point at real resources', () => {
    for (const s of STRATEGIES) for (const id of s.sources) expect(resourceById(id), `${s.id} -> ${id}`).toBeTruthy();
    for (const l of PATH) for (const st of l.steps) if (st.res) expect(resourceById(st.res), st.id).toBeTruthy();
    expect(new Set(GLOSSARY.map((g) => g.term)).size).toBe(GLOSSARY.length);
  });
  it('searches across title, author, description and tags', () => {
    expect(searchResources('momentum').length).toBeGreaterThan(2);
    expect(searchResources('sells courses').every((r) => r.tags?.includes('Sells courses') || /sells/i.test(r.why))).toBe(true);
    expect(searchResources('').length).toBe(RESOURCES.length);
  });
});

describe('chart game', () => {
  const bars = Array.from({ length: 200 }, (_, i) => ({ time: i * 86400, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
  it('keeps the cut inside the history', () => {
    expect(pickCut(200, 20, () => 0)).toBe(SHOW);
    expect(pickCut(200, 20, () => 0.9999)).toBe(179);
    expect(pickCut(100, 20)).toBeNull();
  });
  it('measures the move and the base rate', () => {
    expect(outcome(bars, 150, 10)).toBeCloseTo((260 - 250) / 250 * 100);
    expect(baseRate(bars, 10)).toBe(1);
  });
});
