import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, pickResolution, simulateGhost, type ExitRules } from '../src/lib/replay';
import { buildRecap, journalCsv } from '../src/lib/recap';
import { DEFAULT_SETTINGS, viewTrade, violations, type CheckIn, type Trade } from '../src/lib/journal';
import { encodeEtWall } from '../shared/parse';
import { etToUtc } from '../shared/clock';
import type { Bar } from '../src/types';

const enc = (hm: string, d = '2026-11-04') => encodeEtWall(`${d} ${hm}:00`);
/** 5-minute bars from 9:30 with given [high, low, close] (open = previous close). */
function bars(hlc: [number, number, number][], d = '2026-11-04', startPx = 100): Bar[] {
  let prev = startPx;
  return hlc.map(([h, l, c], i) => { const b = { time: enc('09:30', d) + i * 300, open: prev, high: h, low: l, close: c, volume: 1000 }; prev = c; return b; });
}
const trade = (p: Partial<Trade> = {}): Trade => ({
  id: 't1', created: 0, updated: 0, sym: 'AAA', side: 'long', initialStop: 99, stop: 99, stopHistory: [], target: 102, plannedSize: 100,
  thesis: '', setup: 'ORB', emotion: null, grade: null, checklist: [],
  fills: [{ id: 'a', t: etToUtc(2026, 11, 4, 9, 31), action: 'buy', qty: 100, price: 100, src: 'manual' }, { id: 'b', t: etToUtc(2026, 11, 4, 9, 50), action: 'sell', qty: 100, price: 100.5, src: 'manual' }],
  ...p,
});
const only = (r: Partial<ExitRules>): ExitRules => ({ stop: true, targetR: null, trail: { on: false, startR: 1, distR: 1 }, timeStopMin: null, eod: false, ...r });

describe('ghost exit', () => {
  const v = viewTrade(trade());
  const run = (b: Bar[], r: ExitRules) => simulateGhost(b, v, enc('09:31'), r, 300)!;

  it('hits the 2R target; ghost beats the actual exit by 1.5R / $150', () => {
    const g = run(bars([[100.2, 99.8, 100.1], [100.8, 100, 100.6], [101.5, 100.5, 101.2], [102.3, 101, 102.1]]), only({ targetR: 2 }));
    expect(g).toMatchObject({ reason: 'target', price: 102, r: 2, pnl: 200 });
    expect(g.r - v.r!).toBeCloseTo(1.5);
  });
  it('stop wins when stop and target are inside the same bar (conservative)', () => {
    expect(run(bars([[100.2, 99.8, 100], [102.5, 98.5, 100]]), only({ targetR: 2 }))).toMatchObject({ reason: 'stop', price: 99, r: -1 });
  });
  it('gap through the stop fills at the open', () => {
    const b = bars([[100.2, 99.8, 100], [100, 97, 97.5]]);
    b[1].open = 97.8;
    expect(run(b, only({}))).toMatchObject({ reason: 'stop', price: 97.8 });
  });
  it('trailing stop locks in profit after +1R', () => {
    // runs to 102.5 (best), trail = 101.5, then falls through it
    const g = run(bars([[100.2, 99.8, 100], [101.2, 100, 101.1], [102.5, 101, 102.4], [102.4, 101.2, 101.3]]), only({ trail: { on: true, startR: 1, distR: 1 } }));
    expect(g).toMatchObject({ reason: 'trail', price: 101.5, r: 1.5 });
  });
  it('time stop exits at the bar close once N minutes have passed', () => {
    const g = run(bars(Array(10).fill([100.3, 99.7, 100.1])), only({ timeStopMin: 30 }));
    expect(g.reason).toBe('time');
    expect(g.time).toBe(enc('10:00')); // entry 9:31 + 30 min = 10:01 -> first bar closing after that is the 10:00 bar
  });
  it('flat at the close, then end of data', () => {
    const day = bars(Array(78).fill([100.3, 99.7, 100.2]));
    expect(run(day, only({ eod: true }))).toMatchObject({ reason: 'end of day', time: enc('15:55') });
    expect(run(day.slice(0, 20), only({}))).toMatchObject({ reason: 'end of data' });
  });
  it('short trades mirror the math; no stop = no ghost', () => {
    const sv = viewTrade(trade({ side: 'short', initialStop: 101, stop: 101, fills: [{ id: 'a', t: etToUtc(2026, 11, 4, 9, 31), action: 'sell', qty: 100, price: 100, src: 'manual' }] }));
    const g = simulateGhost(bars([[100.2, 99.8, 99.9], [99.9, 97.8, 98.1]]), sv, enc('09:31'), only({ targetR: 2 }), 300)!;
    expect(g).toMatchObject({ reason: 'target', price: 98, r: 2 });
    expect(simulateGhost(bars([[1, 1, 1]]), viewTrade(trade({ initialStop: null })), enc('09:31'), DEFAULT_RULES, 300)).toBeNull();
  });
  it('picks the finest candle resolution that covers the entry', () => {
    expect(pickResolution(1000, 500, 100)).toBe('5m');
    expect(pickResolution(400, 500, 100)).toBe('1H');
    expect(pickResolution(50, 500, 100)).toBe('D');
  });
});

describe('end-of-day recap', () => {
  const S = { ...DEFAULT_SETTINGS, startBalance: 25_000 };
  const mk = (id: string, h: number, entry: number, exit: number, qty = 100, extra: Partial<Trade> = {}): Trade => trade({
    id, ...extra, fills: [{ id: id + 'a', t: etToUtc(2026, 11, 4, h, 0), action: 'buy', qty, price: entry, src: 'manual' }, { id: id + 'b', t: etToUtc(2026, 11, 4, h, 20), action: 'sell', qty, price: exit, src: 'manual' }],
    initialStop: entry - 1, stop: entry - 1,
  });
  const ci: CheckIn = { day: '2026-11-04', t: 0, sleep: 4, mood: 4, stress: 2, chasing: false, note: '', tilt: 10, updated: 0 };

  it('clean green day grades A with best/worst and a lesson', () => {
    const vs = [mk('a', 10, 100, 102), mk('b', 11, 50, 49.5)].map(viewTrade);
    const r = buildRecap('2026-11-04', vs, violations(vs, [], S, [ci]), ci)!;
    expect(r).toMatchObject({ trades: 2, pnl: 150, r: 1.5, winRate: 50, grade: 'A', best: { id: 'a', pnl: 200 }, worst: { id: 'b', pnl: -50 } });
    expect(r.lesson).toMatch(/Clean day/);
  });
  it('broken rules drag the grade down and drive the lesson, even when green', () => {
    const vs = [mk('a', 10, 100, 103, 100), mk('b', 11, 100, 101, 400)].map(viewTrade); // b risks 400 vs 125 allowed
    const r = buildRecap('2026-11-04', vs, violations(vs, [], S, []), undefined)!;
    expect(r.violations.n).toBeGreaterThanOrEqual(2); // oversized + no check-in
    expect(r.grade).not.toBe('A');
    expect(r.lesson.length).toBeGreaterThan(10);
  });
  it('no trades, no recap', () => {
    expect(buildRecap('2026-11-04', [], [], ci)).toBeNull();
  });
  it('CSV backup escapes commas and quotes', () => {
    const csv = journalCsv([viewTrade(mk('a', 10, 100, 102, 100, { thesis: 'Gap, "clean" ORB' }))], []);
    const [head, row] = csv.trim().split('\n');
    expect(head.split(',')).toContain('realized');
    expect(row).toContain('"Gap, ""clean"" ORB"');
    expect(row).toContain('200.00');
  });
});
