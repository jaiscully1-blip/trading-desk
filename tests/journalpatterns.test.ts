import { describe, expect, it } from 'vitest';
import { journalPatterns } from '../src/lib/journalPatterns';

const ET = (d: string, hm: string) => Date.parse(`${d}T${hm}:00-05:00`);
const v = (i: number, d: string, open: string, close: string, pnl: number, setup = 'ORB') => ({ t: { id: `t${i}`, deleted: false, setup, side: 'long' } as any, status: 'closed' as const, openQty: 0, maxQty: 100, avgEntry: 10, avgExit: 10, openedAt: ET(d, open), closedAt: ET(d, close), realized: pnl, fees: 0, risk: null, r: null } as any);

describe('journal patterns', () => {
  it('slices trades and finds the worst time of day', () => {
    const xs = [];
    for (let i = 0; i < 6; i++) xs.push(v(i, `2026-11-0${(i % 5) + 2}`, '09:40', '09:55', 100));
    for (let i = 0; i < 6; i++) xs.push(v(10 + i, `2026-11-0${(i % 5) + 2}`, '13:10', '13:40', -80, 'Chase'));
    const p = journalPatterns(xs, [{ day: '2026-11-02', violations: 1, followed: 'no', mood: 'fomo' }]);
    expect(p.n).toBe(12);
    const hour = p.lenses.find((l) => l.id === 'hour')!;
    expect(hour.buckets.map((b) => b.key)).toEqual(['9:30–10:00', '12–2 pm']);
    expect(hour.buckets[1].avg).toBe(-80);
    expect(p.findings.some((f) => f.tone === 'down' && f.text.startsWith('12–2 pm'))).toBe(true);
    expect(p.lenses.find((l) => l.id === 'setup')!.buckets.length).toBe(2);
  });
});
