import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, equityByDay, guard, openRisk, sizeFor, stats, tiltScore, timeOfDay, unrealized, viewTrade, violations, type CheckIn, type Fill, type Trade } from '../src/lib/journal';
import { etToUtc } from '../shared/clock';

const at = (h: number, m: number, d = 4) => etToUtc(2026, 11, d, h, m);
let n = 0;
const fill = (t: number, action: 'buy' | 'sell', qty: number, price: number): Fill => ({ id: `f${n++}`, t, action, qty, price, src: 'manual' });
const trade = (p: Partial<Trade> & { fills: Fill[] }): Trade => ({
  id: `t${n++}`, created: p.fills[0]?.t ?? 0, updated: 0, sym: 'AAA', side: 'long', initialStop: 99, stop: 99, stopHistory: [], target: null, plannedSize: 100,
  thesis: '', setup: '', emotion: null, grade: null, checklist: [], ...p,
});
const S = { ...DEFAULT_SETTINGS, startBalance: 25_000, startDate: at(8, 0, 2) };
const checkin = (day: string): CheckIn => ({ day, t: 0, sleep: 4, mood: 4, stress: 2, chasing: false, note: '', tilt: 10, updated: 0 });

describe('trade math', () => {
  it('long round trip with a partial exit: realized, R, average prices', () => {
    const v = viewTrade(trade({ fills: [fill(at(9, 40), 'buy', 100, 100), fill(at(10, 0), 'sell', 50, 102), fill(at(10, 30), 'sell', 50, 104)] }));
    expect(v.status).toBe('closed');
    expect(v.realized).toBeCloseTo(300);
    expect(v.risk).toBeCloseTo(100); // (100-99) x 100
    expect(v.r).toBeCloseTo(3);
    expect(v.avgExit).toBeCloseTo(103);
    expect(v.events.map((e) => e.pnl)).toEqual([100, 200]);
  });
  it('short trade and fees', () => {
    const t = trade({ side: 'short', initialStop: 52, stop: 52, fills: [{ ...fill(at(9, 45), 'sell', 200, 50), fee: 1 }, { ...fill(at(11, 0), 'buy', 200, 49), fee: 1 }] });
    const v = viewTrade(t);
    expect(v.realized).toBeCloseTo(200 - 2);
    expect(v.r).toBeCloseTo(198 / 400);
  });
  it('open trade: unrealized and risk to current stop (0 once stop is past entry)', () => {
    const t = trade({ fills: [fill(at(9, 40), 'buy', 100, 100)], stop: 99 });
    const v = viewTrade(t);
    expect(v.status).toBe('open');
    expect(unrealized(v, 101.5)).toBeCloseTo(150);
    expect(openRisk(v, 101.5)).toBeCloseTo(250);
    expect(openRisk(viewTrade({ ...t, stop: 102 }), 103)).toBeCloseTo(100);
    expect(openRisk(viewTrade({ ...t, stop: 101 }), 100.5)).toBe(0);
  });
});

describe('stats', () => {
  it('win rate, expectancy in R and $, profit factor', () => {
    const vs = [
      viewTrade(trade({ fills: [fill(at(9, 40), 'buy', 100, 100), fill(at(10, 0), 'sell', 100, 102)] })), // +2R
      viewTrade(trade({ fills: [fill(at(9, 50), 'buy', 100, 100), fill(at(10, 5), 'sell', 100, 99)] })), // -1R
      viewTrade(trade({ fills: [fill(at(10, 40), 'buy', 100, 100)] })), // open: ignored
    ];
    const s = stats(vs);
    expect(s).toMatchObject({ trades: 2, wins: 1, losses: 1, winRate: 50, expectancyR: 0.5, expectancy$: 50, profitFactor: 2, net: 100 });
  });
});

describe('account + guardrails', () => {
  const loss = (h: number, m: number, d = 4) => trade({ fills: [fill(at(h, m, d), 'buy', 100, 100), fill(at(h, m + 5, d), 'sell', 100, 99)] });

  it('equity = start + realized + deposits - withdrawals, by ET day', () => {
    const vs = [viewTrade(trade({ fills: [fill(at(9, 40, 3), 'buy', 100, 100), fill(at(15, 0, 3), 'sell', 100, 103)] })), viewTrade(loss(9, 45))];
    const tr = [{ id: 'd', t: at(8, 0, 4), amount: 1000, note: 'Deposit', src: 'csv' as const, updated: 0 }];
    const e = equityByDay(vs, tr, 25_000);
    expect(e.map((x) => [x.day, x.pnl, x.transfers, x.equity])).toEqual([['2026-11-03', 300, 0, 25_300], ['2026-11-04', -100, 1000, 26_200]]);
  });

  it('cooldown for 10 minutes after two losses in a row, then clear', () => {
    const vs = [loss(9, 40), loss(10, 0)].map(viewTrade);
    expect(guard(vs, [], S, at(10, 6)).lockout).toBe('Cooldown');
    expect(guard(vs, [], S, at(10, 16)).lockout).toBe('Clear');
    const wonBetween = [loss(9, 40), viewTrade(trade({ fills: [fill(at(9, 50), 'buy', 100, 100), fill(at(9, 55), 'sell', 100, 101)] })), loss(10, 0)];
    expect(guard(wonBetween.map((x) => ('t' in x && 'status' in x ? x : viewTrade(x as Trade))), [], S, at(10, 6)).lockout).toBe('Clear');
  });

  it('locks out at the max daily loss (2% of start-of-day equity)', () => {
    const big = trade({ fills: [fill(at(9, 40), 'buy', 500, 100), fill(at(9, 50), 'sell', 500, 99)] }); // -500 = 2% of 25k
    const g = guard([viewTrade(big)], [], S, at(10, 0));
    expect(g.lockout).toBe('Locked');
    expect(g.riskUsedPct).toBeCloseTo(2);
    expect(guard([viewTrade(big)], [], S, at(10, 0, 5)).lockout).toBe('Clear'); // next day
  });

  it('sizes from stop distance and risk %', () => {
    expect(sizeFor(25_000, 0.5, 50, 49.5)).toMatchObject({ dollars: 125, shares: 250 });
  });
});

describe('violations priced in dollars', () => {
  it('oversized loser costs the share of the loss above plan; traded-in-cooldown costs the loss', () => {
    const over = trade({ fills: [fill(at(9, 40), 'buy', 300, 100), fill(at(9, 50), 'sell', 300, 99)] }); // risk 300 vs 125 allowed
    const v = violations([viewTrade(over)], [], S, [checkin('2026-11-04')]);
    const o = v.find((x) => x.type === 'oversized')!;
    expect(o.cost).toBeCloseTo(300 * (1 - 125 / 300));
    const vs = [trade({ fills: [fill(at(10, 0), 'buy', 100, 100), fill(at(10, 5), 'sell', 100, 99)] }), trade({ fills: [fill(at(10, 10), 'buy', 100, 100), fill(at(10, 15), 'sell', 100, 99)] }), trade({ fills: [fill(at(10, 18), 'buy', 100, 100), fill(at(10, 20), 'sell', 100, 99.5)] })].map(viewTrade);
    const cd = violations(vs, [], S, [checkin('2026-11-04')]).filter((x) => x.type === 'traded-cooldown');
    expect(cd).toHaveLength(1);
    expect(cd[0].cost).toBeCloseTo(50);
  });
  it('widened stop, no plan, no check-in, failed checklist', () => {
    const w = trade({ stopHistory: [{ t: at(9, 45), stop: 98 }], fills: [fill(at(9, 40), 'buy', 100, 100), fill(at(9, 50), 'sell', 100, 98)] });
    const imp = trade({ imported: true, initialStop: null, stop: null, fills: [fill(at(11, 0), 'buy', 10, 50), fill(at(11, 30), 'sell', 10, 49)] });
    const cl = trade({ checklist: [{ label: 'RVOL ≥ 2', auto: 'fail' }], fills: [fill(at(12, 0), 'buy', 50, 100), fill(at(12, 30), 'sell', 50, 101)] });
    const v = violations([w, imp, cl].map(viewTrade), [], S, []);
    const types = v.map((x) => x.type).sort();
    expect(types).toEqual(['checklist-fail', 'no-checkin', 'no-checkin', 'no-plan', 'widened-stop'].sort());
    expect(v.find((x) => x.type === 'widened-stop')!.cost).toBeCloseTo(100); // lost 200 vs 100 planned
    expect(v.find((x) => x.type === 'checklist-fail')!.cost).toBe(0); // winner: logged, $0
  });
});

describe('tilt + time of day', () => {
  it('tilt score', () => {
    expect(tiltScore({ sleep: 5, mood: 5, stress: 1, chasing: false })).toBe(0);
    expect(tiltScore({ sleep: 2, mood: 2, stress: 4, chasing: true })).toBeGreaterThanOrEqual(60);
  });
  it('buckets by entry time', () => {
    const b = timeOfDay([viewTrade(trade({ fills: [fill(at(9, 41), 'buy', 100, 100), fill(at(10, 0), 'sell', 100, 101)] }))]);
    expect(b.find((x) => x.label === '9:30')).toMatchObject({ trades: 1, wins: 1, net: 100, avgR: 1 });
  });
});
