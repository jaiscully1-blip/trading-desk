import { describe, expect, it } from 'vitest';
import { alertStates, chg, countAirlines, countNear, distKm, fredCsv, sectorsFor } from '../shared/realecon';

const st = (cs: string, lat: number, lon: number, ground = false) => ['abc123', cs, 'United States', 0, 0, lon, lat, 1000, ground];

describe('air traffic', () => {
  it('counts airborne flights per airline by callsign prefix (numbers only, ground excluded)', () => {
    const s = [st('DAL1616 ', 33.6, -84.4), st('DAL22', 40, -100), st('DALTON1', 40, -100), st('UAL9', 40, -100), st('AAL1', 33.6, -84.4, true)];
    expect(countAirlines(s)).toEqual({ DAL: 2, UAL: 1 });
  });
  it('counts aircraft within 40 km of an airport', () => {
    const s = [st('X1', 33.65, -84.43), st('X2', 33.64, -84.42, true), st('X3', 35, -80)];
    expect(countNear(s, 33.6407, -84.4277)).toEqual({ airborne: 1, ground: 1 });
    expect(distKm(0, 0, 0, 1)).toBeCloseTo(111.2, 0);
  });
});

describe('weather and series', () => {
  it('maps alerts to US states (marine zones dropped) and to the sectors they touch', () => {
    expect(alertStates({ geocode: { UGC: ['TXZ123', 'PKZ001', 'LAC001', 'TXZ124'] } })).toEqual(['TX', 'LA']);
    expect(sectorsFor('Hurricane Warning', ['FL'])).toContain('Insurers, Gulf refiners and energy, utilities');
    expect(sectorsFor('Winter Storm Warning', ['TX'])[0]).toMatch(/Natural gas/);
    expect(sectorsFor('Winter Storm Warning', ['ME'])).toEqual([]);
  });
  it('reads FRED CSV and computes changes', () => {
    const s = fredCsv('observation_date,X\n2026-01-01,100\n2026-02-01,.\n2026-03-01,110\n');
    expect(s).toEqual([{ date: '2026-01-01', value: 100 }, { date: '2026-03-01', value: 110 }]);
    expect(chg(s, 1)).toBeCloseTo(10);
    expect(chg(s, 5)).toBeNull();
  });
});
