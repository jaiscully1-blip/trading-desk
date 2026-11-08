import { describe, expect, it } from 'vitest';
import { arkNet, diff13F, normName, parse13F, parseArkTrades, parsePolTrades, polBook } from '../shared/smartmoney';
import { basketCurve, parseEtfProfile, parseTvScan, parseYahooSpark, squarify, stateAgg, holdingsMove } from '../shared/markets';
import { parseCandles, parseKalshiEvents, pickSeries, ECON_TOPICS } from '../shared/econodds';

const row = (name: string, cusip: string, value: number, sh: number, pc = '') => `<ns1:infoTable><ns1:nameOfIssuer>${name}</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>${cusip}</ns1:cusip><ns1:value>${value}</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>${sh}</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt>${pc ? `<ns1:putCall>${pc}</ns1:putCall>` : ''}</ns1:infoTable>`;
const doc = (...r: string[]) => `<?xml version="1.0"?><ns1:informationTable xmlns:ns1="x">${r.join('')}</ns1:informationTable>`;

describe('13F', () => {
  it('parses prefixed XML, sums managers, keeps puts separate, diffs quarters', () => {
    const cur = parse13F(doc(row('APPLE INC', '037833100', 600, 10), row('APPLE INC', '037833100', 400, 5), row('AT&amp;T INC', '00206R102', 100, 50), row('SPDR S&amp;P', '78462F103', 50, 1, 'Put')));
    expect(cur[0]).toMatchObject({ name: 'APPLE INC', value: 1000, shares: 15 });
    expect(cur.find((r) => r.putCall === 'PUT')?.name).toBe('SPDR S&P');
    const prev = parse13F(doc(row('APPLE INC', '037833100', 900, 10), row('OLD CO', '000000001', 70, 7)));
    const d = diff13F(cur, prev);
    expect(d.find((p) => p.cusip === '037833100')).toMatchObject({ change: 'added', chgPct: 50 });
    expect(d.find((p) => p.cusip === '00206R102')?.change).toBe('new');
    expect(d.find((p) => p.cusip === '000000001')).toMatchObject({ change: 'sold', prevValue: 70 });
    expect(parse13F(doc(row('X', '1', 5, 1)), true)[0].value).toBe(5000);
  });
  it('normalizes issuer names for ticker matching', () => {
    expect(normName('APPLE INC')).toBe(normName('Apple Inc.'));
    expect(normName('ALPHABET INC CL A')).toBe('ALPHABET');
  });
});

describe('ARK + politicians', () => {
  it('reads ARK trades and nets them', () => {
    const t = parseArkTrades({ trades: [{ fund: 'ARKK', date: '2026-11-05', ticker: 'TSLA', company: 'TESLA', direction: 'Sell', shares: 100, etf_percent: 0.1 }, { fund: 'ARKW', date: '2026-11-06', ticker: 'TSLA', company: 'TESLA', direction: 'Sell', shares: 50, etf_percent: 0.05 }, { fund: 'ARKK', date: '2026-11-06', ticker: 'AMD', company: 'AMD', direction: 'Buy', shares: 10, etf_percent: 0.2 }] });
    expect(t[0].date).toBe('2026-11-06');
    expect(arkNet(t)[0]).toMatchObject({ sym: 'TSLA', sells: 2, netShares: -150, days: 2, funds: ['ARKK', 'ARKW'] });
  });
  it('builds a rough politician book from ranges', () => {
    const p = parsePolTrades({ trades: [
      { politician_canonical: 'Nancy Pelosi', party: 'D', state: 'CA', symbol: 'NVDA', asset_name: 'NVIDIA', asset_type_code: 'OP', transaction_type: 'BUY', transaction_date: '2026-06-01', amount_min: '1000001', amount_max: '5000000', owner_code: 'SPOUSE' },
      { symbol: 'AAPL', transaction_type: 'SALE', transaction_date: '2026-07-01', amount_min: '1000', amount_max: '15000' },
      { symbol: 'AAPL', transaction_type: 'BUY', transaction_date: '2026-01-01', amount_min: '1000', amount_max: '15000' },
      { symbol: null, asset_name: 'Fund LP', transaction_type: 'BUY', transaction_date: '2026-08-01', amount_min: '1', amount_max: '2' },
    ] });
    expect(p.name).toBe('Nancy Pelosi');
    const b = polBook(p.trades);
    expect(b.find((x) => x.sym === 'NVDA')).toMatchObject({ status: 'likely held', option: true, bought: 3000000.5 });
    expect(b.find((x) => x.sym === 'AAPL')).toMatchObject({ status: 'sold', lastType: 'SELL' });
    expect(b).toHaveLength(2);
  });
});

describe('market snapshot + maps', () => {
  it('reads TradingView and Yahoo spark shapes', () => {
    expect(parseTvScan({ data: [{ s: 'NASDAQ:NVDA', d: ['NVDA', 190, 1.5, 4.6e12] }, { s: 'NYSE:BRK.B', d: ['BRK.B', 500, -0.2, 1e12] }] })).toEqual({ NVDA: { p: 190, c: 1.5, mc: 4.6e12 }, 'BRK.B': { p: 500, c: -0.2, mc: 1e12 } });
    const y = parseYahooSpark({ spark: { result: [{ symbol: 'BRK-B', response: [{ meta: { regularMarketPrice: 110, chartPreviousClose: 100 } }] }] } });
    expect(y['BRK.B'].c).toBeCloseTo(10);
    expect(parseYahooSpark({ AAPL: { symbol: 'AAPL', close: [99, 101], chartPreviousClose: 100 } }).AAPL.c).toBeCloseTo(1);
  });
  it('groups companies by state with average moves', () => {
    const s = stateAgg({ AAPL: { p: 1, c: 2, mc: 3e12 }, NVDA: { p: 1, c: 4, mc: 1e12 } });
    const ca = s.find((x) => x.ab === 'CA')!;
    expect(ca.n).toBeGreaterThan(40);
    expect(ca.priced).toBe(2);
    expect(ca.avg).toBeCloseTo(3);
    expect(ca.capWtd).toBeCloseTo(2.5);
  });
  it('squarify fills the box exactly', () => {
    const r = squarify([{ v: 6 }, { v: 6 }, { v: 4 }, { v: 3 }, { v: 2 }, { v: 2 }, { v: 1 }], { x: 0, y: 0, w: 6, h: 4 });
    expect(r.reduce((s, x) => s + x.w * x.h, 0)).toBeCloseTo(24);
    expect(r.every((x) => x.x >= -1e-9 && x.y >= -1e-9 && x.x + x.w <= 6 + 1e-9 && x.y + x.h <= 4 + 1e-9)).toBe(true);
  });
  it('ETF profile + weighted move', () => {
    const e = parseEtfProfile('XLK', { net_assets: '1e11', holdings: [{ symbol: 'NVDA', description: 'NVIDIA', weight: '0.15' }, { symbol: 'n/a', description: 'US DOLLAR', weight: '0.0' }, { symbol: 'AAPL', description: 'n/a', weight: '0.05' }] });
    expect(e.holdings.map((h) => h.sym)).toEqual(['NVDA', 'AAPL']);
    expect(e.holdings[1].name).toBe('');
    expect(() => parseEtfProfile('X', { Information: 'limit' })).toThrow('limit');
    expect(holdingsMove(e.holdings, { NVDA: { p: 1, c: 2, mc: null } })).toEqual({ move: 2, covered: 0.15 });
  });
  it('basket curve is equal weight vs benchmark', () => {
    const c = basketCurve({ A: [[1, 10], [2, 11], [3, 11]], B: [[1, 20], [2, 20], [3, 22]], SPY: [[1, 100], [2, 101], [3, 102]] }, ['A', 'B'], 'SPY', 0);
    expect(c.curve.map((x) => +x.basket.toFixed(2))).toEqual([100, 105, 110.25]);
    expect(c.curve[2].bench).toBeCloseTo(102);
    expect(c.per[0].ret).toBeCloseTo(10);
  });
});

describe('Kalshi econ odds', () => {
  it('parses events in strike order and candles', () => {
    const ev = parseKalshiEvents({ events: [{ event_ticker: 'KXCPI-26NOV', title: 'CPI in Nov', markets: [
      { ticker: 'A', yes_sub_title: 'Above 0.3%', floor_strike: 0.3, last_price_dollars: '0.40', yes_bid_dollars: '0.39', yes_ask_dollars: '0.41', close_time: '2026-12-10T13:30:00Z', status: 'active' },
      { ticker: 'B', yes_sub_title: 'Above 0.1%', floor_strike: 0.1, last_price_dollars: '0.05', yes_bid_dollars: '0.80', yes_ask_dollars: '0.84', close_time: '2026-12-10T13:30:00Z', status: 'active' },
      { ticker: 'C', yes_sub_title: 'Above 0.2%', floor_strike: 0.2, last_price: 60, close_time: '2026-12-10T13:30:00Z', status: 'active' },
    ] }] });
    expect(ev[0].outcomes.map((o) => o.ticker)).toEqual(['B', 'C', 'A']);
    expect(ev[0].outcomes[0].p).toBeCloseTo(0.82); // stale last trade ignored
    expect(ev[0].outcomes[1].p).toBeCloseTo(0.6);
    const cs = parseCandles({ candlesticks: [{ end_period_ts: 5, price: { close_dollars: '0.3' } }, { end_period_ts: 6, price: {}, yes_bid: { close: 40 }, yes_ask: { close: 44 } }] });
    expect(cs[0]).toEqual([5, 0.3]);
    expect(cs[1][1]).toBeCloseTo(0.42);
  });
  it('picks known series, else by title', () => {
    const rec = ECON_TOPICS.find((t) => t.id === 'recession')!;
    expect(pickSeries(rec, [{ ticker: 'KXRECSSNBER', title: 'x' }])).toBe('KXRECSSNBER');
    expect(pickSeries(rec, [{ ticker: 'KXNEWREC', title: 'Recession in 2027?' }])).toBe('KXNEWREC');
    expect(pickSeries(rec, [])).toBe('KXRECSSNBER');
    expect(pickSeries(rec, [{ ticker: 'KXOTHER', title: 'Weather' }])).toBeNull();
  });
});
