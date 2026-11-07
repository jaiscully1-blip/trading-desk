import { describe, expect, it } from 'vitest';
import { earningsPings, levelPings, movePing, watchLevels } from '../src/lib/pings';
import { barsFrom, ramp } from './helpers';

describe('pings', () => {
  it('move pings fire once per threshold multiple per day', () => {
    const f = new Set<string>();
    expect(movePing('NVDA', 2.9, 3, '2026-11-06', f)).toBeNull();
    expect(movePing('NVDA', 3.2, 3, '2026-11-06', f)?.text).toMatch(/up 3.2% today \(past \+3%\)/);
    expect(movePing('NVDA', 4.0, 3, '2026-11-06', f)).toBeNull();
    expect(movePing('NVDA', 6.1, 3, '2026-11-06', f)?.text).toMatch(/past \+6%/);
    expect(movePing('NVDA', -3.5, 3, '2026-11-06', f)?.tone).toBe('down');
    expect(movePing('NVDA', 3.2, 3, '2026-11-07', f)).not.toBeNull();
  });
  it('level pings fire on a cross, once', () => {
    const f = new Set<string>();
    const lv = [{ key: 'pdh:1', label: 'yesterday’s high', price: 100 }];
    expect(levelPings('X', 99, 99.5, lv, f)).toHaveLength(0);
    expect(levelPings('X', 99.5, 100.2, lv, f)[0].text).toMatch(/crossed above yesterday’s high 100.00/);
    expect(levelPings('X', 99.5, 100.4, lv, f)).toHaveLength(0);
  });
  it('watch levels come from the last completed day', () => {
    const b = barsFrom(ramp(50, 60, 40));
    const lv = watchLevels(b, b.at(-1)!.time);
    expect(lv[0].price).toBeCloseTo(b.at(-2)!.high);
    expect(lv[1].price).toBeCloseTo(b.at(-2)!.low);
  });
  it('earnings: tomorrow, today, then reported with beat/miss', () => {
    const f = new Set<string>();
    const rows = [
      { sym: 'A', date: '2026-11-07', hour: 'amc', epsEst: 1.1, epsAct: null, revEst: null, revAct: null },
      { sym: 'B', date: '2026-11-06', hour: 'bmo', epsEst: null, epsAct: null, revEst: null, revAct: null },
      { sym: 'C', date: '2026-11-05', hour: 'amc', epsEst: 1.0, epsAct: 1.2, revEst: 10, revAct: 11 },
    ];
    const p = earningsPings(rows, '2026-11-06', '2026-11-07', f);
    expect(p.map((x) => x.text)).toEqual(['reports tomorrow after the close · EPS est 1.10', 'reports today before the open', 'reported: EPS 1.20 vs 1.00 est (beat), revenue above est · delayed']);
    expect(earningsPings(rows, '2026-11-06', '2026-11-07', f)).toHaveLength(0);
  });
});
