import { describe, expect, it } from 'vitest';
import { bsGamma, closeMs, gammaRead, ivSurface, parseCboe, pcRatios } from '../shared/gamma';

const now = Date.parse('2026-11-09T15:00:00Z');
function chain() {
  const options: any[] = [];
  for (const [exp, ymd] of [['261113', 4], ['261120', 11], ['261218', 39]] as const) {
    for (let K = 440; K <= 560; K += 5) {
      const k = String(K * 1000).padStart(8, '0');
      const skew = 0.18 + Math.max(0, (500 - K) / 500) * 0.6;
      options.push({ option: `SPY${exp}C${k}`, iv: skew, open_interest: K === 520 ? 90000 : 2000, volume: 100 });
      options.push({ option: `SPY${exp}P${k}`, iv: skew, open_interest: K === 480 ? 90000 : 2000, volume: 150 });
      void ymd;
    }
  }
  options.push({ option: 'SPY261106C00500000', iv: 0.2, open_interest: 99999 }); // expired: dropped
  return { timestamp: '2026-11-09 14:45:00', data: { current_price: 500, close: 499, options } };
}

describe('gamma', () => {
  it('Black-Scholes gamma matches the textbook value', () => expect(bsGamma(100, 100, 0.2, 1)).toBeCloseTo(0.019848, 5));
  it('close of an expiry is 16:00 New York time', () => expect(new Date(closeMs(2026, 11, 13)).toISOString()).toBe('2026-11-13T21:00:00.000Z'));
  it('parses OSI symbols, drops expired contracts', () => {
    const ch = parseCboe(chain(), 'SPY', now);
    expect(ch.spot).toBe(500);
    expect(ch.asOf).toBe(Date.parse('2026-11-09T14:45:00Z'));
    expect(ch.contracts.length).toBe(3 * 25 * 2);
    expect(ch.contracts[0]).toMatchObject({ exp: '2026-11-13', K: 440, cp: 'C', dte: 4 });
  });
  it('finds the call wall, put wall and a flip between them', () => {
    const g = gammaRead(parseCboe(chain(), 'SPY', now));
    expect(g.callWall).toBe(520);
    expect(g.putWall).toBe(480);
    expect(g.flip).not.toBeNull();
    expect(g.flip!).toBeGreaterThan(480);
    expect(g.flip!).toBeLessThan(520);
    expect(g.strikes.find((s) => s.K === 520)!.call).toBeGreaterThan(0);
    expect(g.strikes.find((s) => s.K === 480)!.put).toBeLessThan(0);
  });
  it('IV surface reads OTM puts below spot and shows put skew', () => {
    const s = ivSurface(parseCboe(chain(), 'SPY', now));
    expect(s.map((r) => r.exp)).toEqual(['2026-11-13', '2026-11-20', '2026-12-18']);
    expect(s[0].atm).toBeCloseTo(18, 5);
    expect(s[0].skew!).toBeGreaterThan(0);
  });
  it('put/call ratios', () => expect(pcRatios(parseCboe(chain(), 'SPY', now)).vol).toBeCloseTo(1.5, 5));
});
