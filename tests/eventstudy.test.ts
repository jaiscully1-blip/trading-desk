import { describe, expect, it } from 'vitest';
import { POST, PRE, earningsEvents, eventStudy, summarize, type DayClose } from '../shared/eventstudy';

const days = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10));
const noise = (i: number) => (Math.sin(i * 7.77) * 1e4) % 1;
describe('event study', () => {
  it('finds a planted jump beyond the market and ignores the market move', () => {
    const d = days(400); let m = 100, s = 50;
    const mkt: DayClose[] = [], stock: DayClose[] = [];
    d.forEach((x, i) => { const mr = noise(i) * 1; m *= 1 + mr / 100; s *= 1 + (1.2 * mr + noise(i + 900) * 0.3 + (i === 300 ? 8 : 0)) / 100; mkt.push({ d: x, c: m }); stock.push({ d: x, c: s }); });
    const ev = eventStudy(stock, mkt, [{ date: d[300], group: 'News', label: 'x' }]);
    expect(ev).toHaveLength(1); expect(ev[0].beta).toBeCloseTo(1.2, 0);
    const jump = ev[0].car[PRE] - ev[0].car[PRE - 1]; expect(jump).toBeGreaterThan(6); expect(jump).toBeLessThan(10);
    const s0 = summarize(ev)[0]; expect(s0.n).toBe(1); expect(s0.path).toHaveLength(PRE + POST + 1);
  });
  it('moves after-close news to the next session and skips events without enough history', () => {
    const d = days(300), c = d.map((x, i) => ({ d: x, c: 100 + i }));
    expect(eventStudy(c, c, [{ date: d[200], group: 'g', label: 'x', after: true }])[0].day0).toBe(d[201]);
    expect(eventStudy(c, c, [{ date: d[10], group: 'g', label: 'x' }])).toHaveLength(0);
  });
  it('groups earnings by surprise', () => {
    const e = earningsEvents([{ date: '2024-01-01', eps: 1.1, est: 1, surprisePct: 10, time: 'post-market' }, { date: '2024-04-01', eps: 0.9, est: 1, surprisePct: null }, { date: '2024-07-01', eps: null, est: null, surprisePct: null }]);
    expect(e.map((x) => x.group)).toEqual(['Big beat (≥ 5%)', 'Big miss (≤ −5%)', 'Report (no estimate)']); expect(e[0].after).toBe(true);
  });
});
