import { describe, expect, it } from 'vitest';
import { parseAlpacaQuote, parseAlpacaTrades, tapeSummary } from '../shared/tape';

describe('IEX tape', () => {
  // Alpaca returns newest first with sort=desc
  const j = { trades: [
    { t: '2026-11-11T15:00:04Z', p: 100.0, s: 50 },
    { t: '2026-11-11T15:00:03Z', p: 100.1, s: 12000 },
    { t: '2026-11-11T15:00:02Z', p: 100.1, s: 100 },
    { t: '2026-11-11T15:00:01Z', p: 100.05, s: 200 },
    { t: '2026-11-11T15:00:00Z', p: 100.0, s: 300 },
    { t: 'bad', p: 1, s: 1 },
  ] };
  it('sorts oldest first and applies the tick rule', () => {
    const ps = parseAlpacaTrades(j);
    expect(ps.map((p) => p.side)).toEqual(['same', 'up', 'up', 'up', 'down']); // 100.1 twice: still an uptick
    expect(ps.map((p) => p.big)).toEqual([false, false, false, true, false]);
  });
  it('summary: uptick share, VWAP, biggest print', () => {
    const s = tapeSummary(parseAlpacaTrades(j));
    expect(s.n).toBe(5);
    expect(s.upShare).toBeCloseTo(12300 / 12350);
    expect(s.biggest?.s).toBe(12000);
    expect(s.vwap).toBeCloseTo((100 * 300 + 100.05 * 200 + 100.1 * 100 + 100.1 * 12000 + 100 * 50) / 12650);
  });
  it('top of book', () => {
    expect(parseAlpacaQuote({ quote: { bp: 99.9, bs: 3, ap: 100.1, as: 5, t: '2026-11-11T15:00:00Z' } })).toMatchObject({ bid: 99.9, ask: 100.1, bidSize: 3, askSize: 5 });
    expect(parseAlpacaQuote({ quote: { bp: 0, ap: 0, t: '2026-11-11T15:00:00Z' } })).toBeNull();
  });
});
