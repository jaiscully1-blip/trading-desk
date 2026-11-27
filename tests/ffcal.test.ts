// Real Forex Factory weekly file (week of 2026-11-22).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFf, usForecast, worldList } from '../shared/ffcal';

const ev = parseFf(JSON.parse(readFileSync(new URL('./fixtures/ff-week.json', import.meta.url), 'utf8')));

describe('Forex Factory weekly calendar', () => {
  it('reads every release with New York date and time', () => {
    expect(ev.length).toBe(77);
    const pce = ev.find((e) => e.title === 'Core PCE Price Index m/m')!;
    expect(pce).toMatchObject({ ccy: 'USD', date: '2026-11-25', time: '08:30', impact: 3, forecast: '0.3%', previous: '0.3%' });
    expect(ev.every((e, i) => i === 0 || ev[i - 1].at <= e.at)).toBe(true);
  });
  it('gives the desk US releases their forecast and previous, on the same day only', () => {
    expect(usForecast('pce', '2026-11-25', ev)).toEqual({ title: 'Core PCE Price Index m/m', forecast: '0.3%', previous: '0.3%' });
    expect(usForecast('gdp', '2026-11-25', ev)?.title).toBe('Prelim GDP q/q'); // not the GDP price index
    expect(usForecast('claims', '2026-11-25', ev)).toMatchObject({ forecast: '201K', previous: '203K' });
    expect(usForecast('pce', '2026-11-24', ev)).toBeNull();
    expect(usForecast('nope', '2026-11-25', ev)).toBeNull();
  });
  it('lists non-US medium / high releases and holidays', () => {
    const w = worldList(ev, 0);
    expect(w.some((e) => e.ccy === 'USD')).toBe(false);
    expect(w.every((e) => e.impact >= 2 || e.impact === 0)).toBe(true);
    expect(w.find((e) => e.ccy === 'AUD' && e.title === 'CPI y/y')).toMatchObject({ impact: 3, forecast: '4.7%', previous: '4.3%' });
  });
});
