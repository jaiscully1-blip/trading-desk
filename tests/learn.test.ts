import { describe, expect, it } from 'vitest';
import { GLOSSARY, PATH, RESOURCES, STRATEGIES, TOPICS, resourceById, searchResources } from '../shared/learn';

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
