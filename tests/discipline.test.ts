import { describe, expect, it } from 'vitest';
import { leftSummary, painCheck, passCounts, postExit, sizeAdvice, type DBar, type ExitRow } from '../shared/discipline';

const bars: DBar[] = [
  { day: '2026-11-02', high: 101, low: 99, close: 100 }, // exit day
  { day: '2026-11-03', high: 106, low: 100, close: 104 },
  { day: '2026-11-04', high: 110, low: 103, close: 108 },
  { day: '2026-11-05', high: 109, low: 104, close: 105 },
];
describe('discipline', () => {
  it('measures how far price ran after an exit', () => {
    const r = postExit('long', 100, '2026-11-02', bars, 10)!;
    expect(r.sessions).toBe(3); expect(r.runPct).toBeCloseTo(10); expect(r.endPct).toBeCloseTo(5); expect(r.peak).toBe(110);
    const s = postExit('short', 100, '2026-11-02', bars, 2)!; // price only rose, so a short gets no favorable run
    expect(s.runPct).toBe(0); expect(s.endPct).toBeCloseTo(-7.4, 0);
    expect(postExit('long', 100, '2026-11-05', bars)).toBeNull();
  });
  it('summarizes and estimates the 10% runner', () => {
    const rows: ExitRow[] = [{ id: 'a', sym: 'X', side: 'long', exitPx: 100, qty: 100, realized: 500, win: true, res: postExit('long', 100, '2026-11-02', bars, 3) }, { id: 'b', sym: 'Y', side: 'long', exitPx: 5, qty: 10, realized: -20, win: false, res: null }];
    const s = leftSummary(rows);
    expect(s).toMatchObject({ n: 2, withData: 1, ranPast5: 1 }); expect(s.avgRun).toBeCloseTo(10);
    expect(s.keptRunning).toBeCloseTo(0.1 * 100 * 5); // 10% of 100 shares x (105 - 100)
  });
  it('tells you to size down when losses hurt', () => {
    expect(sizeAdvice(['hurt', 'hurt', 'fine'], 1)).toMatchObject({ cut: true, suggestPct: 0.5 });
    expect(sizeAdvice(['hurt', 'fine', 'fine'], 1).cut).toBe(false);
    expect(sizeAdvice([], 1).cut).toBe(false);
  });
  it('compares risk per trade to your pain point and counts passes', () => {
    expect(painCheck(10000, 1, 50)).toEqual({ riskUsd: 100, over: true });
    expect(painCheck(10000, 0.5, 100).over).toBe(false);
    expect(painCheck(null, 1, 100).over).toBeNull();
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const now = Date.parse('2026-11-17T15:00:00Z');
    expect(passCounts([{ t: now - 1000, why: 'x' }, { t: now - 3 * 86400_000, why: 'y' }], [now - 500], now, day)).toEqual({ passToday: 1, tradesToday: 1, passWeek: 2, tradesWeek: 1 });
  });
});
