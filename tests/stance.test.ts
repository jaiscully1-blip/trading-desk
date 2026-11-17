import { beforeEach, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
(globalThis as any).window = Object.assign((globalThis as any).window ?? {}, { location: { search: '', hostname: 'x' } });

describe('stance', () => {
  beforeEach(() => mem.clear());
  it('builds a short badge and clears empty stances', async () => {
    const { badge, setStance, allStances, tone } = await import('../src/lib/stance');
    expect(badge(undefined)).toBe('');
    expect(badge({ long: 'bull', short: 'bear', shape: 'channel-up' })).toBe('L▲ S▼ ⟋');
    setStance('NVDA', { long: 'bull' });
    setStance('NVDA', { shape: 'breakout' });
    expect(allStances().NVDA).toEqual({ long: 'bull', shape: 'breakout' });
    expect(tone(allStances().NVDA)).toBe('bull');
    setStance('NVDA', { long: undefined, shape: undefined });
    expect(allStances().NVDA).toBeUndefined();
  });
});
