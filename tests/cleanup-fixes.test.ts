import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, expiryCloseMs, guard, viewTrade, type Fill, type Trade } from '../src/lib/journal';
import { etToUtc } from '../shared/clock';
import { botWatchlist, tickersIn, type DcMessage } from '../shared/discord';
import { ratingTone } from '../src/lib/rating';

const at = (h: number, m: number, d = 4) => etToUtc(2026, 11, d, h, m);
let n = 0;
const fill = (t: number, action: 'buy' | 'sell', qty: number, price: number): Fill => ({ id: `f${n++}`, t, action, qty, price, src: 'manual' });
const trade = (p: Partial<Trade> & { fills: Fill[] }): Trade => ({
  id: `t${n++}`, created: p.fills[0]?.t ?? 0, updated: 0, sym: 'AAA', side: 'long', initialStop: null, stop: null, stopHistory: [], target: null, plannedSize: null,
  thesis: '', setup: '', emotion: null, grade: null, checklist: [], ...p,
});

describe('expired options', () => {
  const opt = trade({ sym: 'NVDA 150C', mult: 100, opt: { root: 'NVDA', type: 'call', strike: 150, expiry: '2026-11-06' }, fills: [fill(at(10, 0, 4), 'buy', 2, 1.5)] });
  it('stays open until its expiry close, then closes at $0 and says so', () => {
    expect(viewTrade(opt, { now: expiryCloseMs('2026-11-06') - 60_000 }).status).toBe('open');
    const v = viewTrade(opt, { now: at(10, 0, 9) });
    expect(v.status).toBe('closed');
    expect(v.assumedExpired).toBe(true);
    expect(v.realized).toBeCloseTo(-300); // 2 contracts x $1.50 x 100
    expect(v.closedAt).toBe(expiryCloseMs('2026-11-06'));
  });
  it('a logged sell before expiry means nothing is assumed', () => {
    const sold = { ...opt, fills: [...opt.fills, fill(at(11, 0, 5), 'sell', 2, 2)] };
    const v = viewTrade(sold, { now: at(10, 0, 9) });
    expect(v.assumedExpired).toBeUndefined();
    expect(v.realized).toBeCloseTo(100);
  });
  it('`trades.map(viewTrade)` passes an index, which is never read as the time', () => {
    expect([opt].map(viewTrade)[0].status).toBe('closed'); // today is after Nov 6, 2026
  });
  it('shares never expire', () => {
    expect(viewTrade(trade({ fills: [fill(at(10, 0), 'buy', 10, 5)] }), { now: at(10, 0, 30) }).status).toBe('open');
  });
});

describe('guard and the start date', () => {
  it('trades and transfers before the start date are already in the starting balance', () => {
    const old = trade({ fills: [fill(at(10, 0, 2), 'buy', 100, 10), fill(at(11, 0, 2), 'sell', 100, 12)] }); // +200 on Nov 2
    const S = { ...DEFAULT_SETTINGS, startBalance: 10_000, startDate: at(8, 0, 3) };
    const g = guard([viewTrade(old)], [{ id: 'x', t: at(9, 0, 1), amount: 5000, note: '', src: 'manual', updated: 0 }], S, at(12, 0, 4));
    expect(g.startOfDay).toBe(10_000);
    const g2 = guard([viewTrade(old)], [], { ...S, startDate: at(8, 0, 1) }, at(12, 0, 4));
    expect(g2.startOfDay).toBe(10_200);
  });
});

describe('Discord', () => {
  const msg = (p: Partial<DcMessage>): DcMessage => ({ id: String(n++), ch: 'before', t: at(8, 0), author: 'x', bot: false, text: '', tickers: [], url: '', ...p });
  it('the bot watchlist counts bot posts only', () => {
    const w = botWatchlist([msg({ bot: true, tickers: ['NVDA'] }), msg({ tickers: ['TSLA'] }), msg({ tickers: ['TSLA'] }), msg({ tom: true, tickers: ['NVDA', 'AMD'] })], '2026-11-04', () => '2026-11-04');
    expect(w.map((x) => [x.sym, x.n])).toEqual([['NVDA', 2], ['AMD', 1]]);
  });
  it('cashtags must be real tickers when the list is known', () => {
    const known = new Set(['NVDA', 'AMD', 'BRK.B']);
    expect(tickersIn('$NVDA and $USD up, $CALLS cheap, $5 off, $BRK.B', known)).toEqual(['NVDA', 'BRK.B']);
    expect(tickersIn('$TSLA vs $USD and $K', undefined)).toEqual(['TSLA']);
  });
});

describe('AI verdict colour', () => {
  it('the first verdict word decides, negations are ignored', () => {
    expect(ratingTone('SELL, not a buy')).toBe('down');
    expect(ratingTone('Buy. No sell signal yet')).toBe('up');
    expect(ratingTone('HOLD: not a buy until earnings')).toBe('');
    expect(ratingTone('Overweight')).toBe('up');
    expect(ratingTone('')).toBe('');
  });
});
