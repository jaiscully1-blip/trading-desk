import { describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
(globalThis as any).window = Object.assign((globalThis as any).window ?? {}, { location: { search: '', hostname: 'x' } });

describe('notification mute', () => {
  it('mutes for a while, ends by itself, and can be set to manual', async () => {
    const { isMuted, setMute } = await import('../src/lib/mute');
    expect(isMuted()).toBe(false);
    setMute({ until: Date.now() + 60_000 });
    expect(isMuted()).toBe(true);
    expect(isMuted(Date.now() + 120_000)).toBe(false); // an hour-style mute ends on its own
    setMute({ until: 'manual' });
    expect(isMuted(Date.now() + 1e10)).toBe(true);
    setMute(null);
    expect(isMuted()).toBe(false);
  });
  it('finds the next 9:30 ET within a day', async () => {
    const { msToNextOpen } = await import('../src/lib/mute');
    const ms = msToNextOpen(Date.UTC(2026, 10, 17, 18, 0)); // 1:00 PM ET -> next 9:30 AM is 20.5 h away
    expect(ms).toBe(20.5 * 3600_000);
  });
});
