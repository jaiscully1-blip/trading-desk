import { describe, expect, it } from 'vitest';
import { arbSpread, lockupEnd, offExchangeShare, parseDisplayName, parseFtd, parseIbBorrow, parseShortVol, rebalanceCalendar, unusualOptions } from '../shared/plumbing';

describe('market plumbing parsers', () => {
  it('FINRA short volume, SEC fails to deliver, IBKR borrow file', () => {
    expect(parseShortVol('Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n20261112|HOOD|3171679.17|0|6045921.5|B,Q,N\n').get('HOOD')).toEqual({ short: 3171679.17, total: 6045921.5 });
    expect(parseFtd('SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE\n20261014|770700102|HOOD|9718|ROBINHOOD|110.52\n20261014|X|AAPL|5|APPLE|1', 'HOOD')).toEqual([{ date: '2026-10-14', qty: 9718, price: 110.52 }]);
    const b = parseIbBorrow('#BOF|2026.11.17|20:40:02\n#SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE|FIGI|\nHOOD|USD|ROBINHOOD|1|X|3.4665|0.4135|>10000000|B|\n049323AB4|USD|BOND|1|X|3.6|0.25|2800000|B|\nGME|USD|GAMESTOP|1|X|-10|15.5|200000|B|');
    expect(b).toEqual({ HOOD: [0.4135, 3.4665, 10000000], GME: [15.5, -10, 200000] });
  });
  it('unusual options: volume over open interest with real size, by premium', () => {
    const c = (K: number, vol: number, oi: number, last: number) => ({ exp: '2026-12-18', dte: 30, T: 0.1, K, cp: 'P' as const, iv: 0.5, oi, vol, last });
    const u = unusualOptions([c(140, 2803, 1051, 2), c(150, 100, 10, 5), c(160, 5000, 9000, 1), c(170, 900, 200, 10)]);
    expect(u.map((x) => x.K)).toEqual([170, 140]);
  });
  it('calendars, lockups, EDGAR names, off-exchange share and merger spreads', () => {
    expect(rebalanceCalendar(2026).find((r) => r.date === '2026-12-18' && r.index.startsWith('S&P'))).toBeTruthy();
    expect(rebalanceCalendar(2026).find((r) => r.index.startsWith('Russell'))?.date).toBe('2026-06-26');
    expect(lockupEnd('2026-05-14')).toBe('2026-11-10');
    expect(parseDisplayName('Fervo Energy Co  (FRVO)  (CIK 0001853868)')).toEqual({ name: 'Fervo Energy Co', ticker: 'FRVO', cik: '0001853868' });
    expect(parseDisplayName('Some Trust  (CIK 0000000001)')).toEqual({ name: 'Some Trust', ticker: null, cik: '0000000001' });
    expect(offExchangeShare(20, 30, 100)).toBe(0.5);
    const s = arbSpread({ targetPx: 48, cash: 50, closeDate: '2027-11-17', now: Date.parse('2026-11-17T00:00:00Z') })!;
    expect(s.spread).toBeCloseTo(4.1667, 3);
    expect(s.annualized).toBeCloseTo(4.1667, 1);
    expect(arbSpread({ targetPx: 10, ratio: 0.5, acquirerPx: 30 })!.value).toBe(15);
  });
});
