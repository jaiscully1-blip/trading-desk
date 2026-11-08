import { describe, expect, it } from 'vitest';
import { webullSign } from '../api/_lib/webull';
import { DEFAULT_CAPS, canonical, describe as say, orderProblems, parseDraft, webullBody, type OrderDraft } from '../shared/orders';
import { checkPin, claimTicket, idsFromTicket, makeTicket, pinOk, reserveDaily, ticketOk } from '../api/_lib/broker/webull-orders';
import { normOpenOrders } from '../shared/webull';

describe('webull signature (docs worked example)', () => {
  it('reproduces kvlS6opdZDhEBo5jq40nHYXaLvM= from developer.webull.com/apis/docs/authentication/signature', () => {
    const { signature } = webullSign({
      host: 'api.webull.com', path: '/trade/place_order', algo: 'sha1',
      appKey: '776da210ab4a452795d74e726ebd74b6', secret: '0f50a2e853334a9aae1a783bee120c1f',
      timestamp: '2022-01-04T03:55:31Z', nonce: '48ef5afed43d4d91ae514aaeafbc29ba',
      query: { a1: 'webull', a2: '123', a3: 'xxx', q1: 'yyy' },
      body: { k1: 123, k2: 'this is the api request body', k3: true, k4: { foo: [1, 2] } },
    });
    expect(signature).toBe('kvlS6opdZDhEBo5jq40nHYXaLvM=');
  });
});

const buy: OrderDraft = { sym: 'NVDA', side: 'BUY', type: 'LIMIT', qty: 5, limit: 180, tif: 'DAY', session: 'CORE' };
describe('order checks', () => {
  it('accepts a normal limit buy inside the caps', () => expect(orderProblems(buy, DEFAULT_CAPS, 0)).toEqual([]));
  it('blocks over the dollar cap, market orders, fractions and shorts', () => {
    expect(orderProblems({ ...buy, qty: 10 }, DEFAULT_CAPS, 0).join(' ')).toMatch(/per-order cap/);
    expect(orderProblems({ ...buy, type: 'MARKET', limit: null }, DEFAULT_CAPS, 0, 100).join(' ')).toMatch(/Market orders are switched off/);
    expect(orderProblems({ ...buy, qty: 1.5 }, DEFAULT_CAPS, 0).join(' ')).toMatch(/whole number/);
    expect(orderProblems({ ...buy, side: 'SELL' }, DEFAULT_CAPS, 2).join(' ')).toMatch(/open a short/);
    expect(orderProblems({ ...buy, side: 'SELL' }, DEFAULT_CAPS, null).join(' ')).toMatch(/blocked/);
    expect(orderProblems({ ...buy, side: 'SHORT' as never }, DEFAULT_CAPS, 0).join(' ')).toMatch(/no shorting/);
  });
  it('checks bracket legs and extended-hours rules', () => {
    expect(orderProblems({ ...buy, takeProfit: 175, stopLoss: 170 }, DEFAULT_CAPS, 0).join(' ')).toMatch(/Take-profit must be above/);
    expect(orderProblems({ ...buy, takeProfit: 195, stopLoss: 185 }, DEFAULT_CAPS, 0).join(' ')).toMatch(/Stop-loss must be below/);
    expect(orderProblems({ ...buy, type: 'STOP_LOSS', stop: 170, limit: null, session: 'ALL' }, DEFAULT_CAPS, 0).join(' ')).toMatch(/Extended hours/);
  });
  it('parses loose form input', () => {
    expect(parseDraft({ sym: ' nvda ', side: 'BUY', type: 'LIMIT', qty: '5', limit: '180', stop: '' })).toMatchObject({ sym: 'NVDA', qty: 5, limit: 180, stop: null, tif: 'DAY', session: 'CORE' });
  });
});

describe('webull order body', () => {
  it('normal limit order matches the docs shape', () => {
    expect(webullBody(buy, 'ACC', { combo: 'C', legs: ['L1', 'L2', 'L3'] })).toEqual({ account_id: 'ACC', new_orders: [{ client_order_id: 'L1', symbol: 'NVDA', instrument_type: 'EQUITY', market: 'US', time_in_force: 'DAY', support_trading_session: 'CORE', entrust_type: 'QTY', quantity: '5', side: 'BUY', order_type: 'LIMIT', limit_price: '180', combo_type: 'NORMAL' }] });
  });
  it('bracket = MASTER + STOP_PROFIT + STOP_LOSS legs with a combo id', () => {
    const b = webullBody({ ...buy, takeProfit: 195, stopLoss: 170.004 }, 'ACC', { combo: 'C', legs: ['L1', 'L2', 'L3'] });
    expect(b.client_combo_order_id).toBe('C');
    expect(b.new_orders.map((o) => [o.combo_type, o.side, o.order_type, o.limit_price ?? o.stop_price])).toEqual([['MASTER', 'BUY', 'LIMIT', '180'], ['STOP_PROFIT', 'SELL', 'LIMIT', '195'], ['STOP_LOSS', 'SELL', 'STOP_LOSS', '170']]);
  });
  it('describes the order in plain words', () => expect(say({ ...buy, takeProfit: 195 })).toBe('Buy 5 NVDA limit $180, day, with take-profit $195'));
});

describe('confirm ticket and PIN', () => {
  it('ticket is tied to the exact order and expires', () => {
    process.env.WEBULL_APP_SECRET = 's'; process.env.WEBULL_ORDER_PIN = '4821';
    const t = makeTicket(buy, 1000);
    expect(ticketOk(buy, t, 2000)).toBe(true);
    expect(ticketOk({ ...buy, qty: 6 }, t, 2000)).toBe(false);
    expect(ticketOk(buy, t, 1000 + 4 * 60_000)).toBe(false);
    expect(canonical(buy)).toBe('NVDA|BUY|LIMIT|5|180||DAY|CORE||');
    expect(pinOk('4821')).toBe(true);
    expect(pinOk('4822')).toBe(false);
    expect(pinOk(null)).toBe(false);
  });
});

describe('open orders', () => {
  it('flattens combo groups', () => {
    const o = normOpenOrders({ data: [{ client_combo_order_id: 'C', orders: [{ client_order_id: 'a', symbol: 'nvda', side: 'BUY', order_type: 'LIMIT', quantity: '5', limit_price: '180', status: 'SUBMITTED' }, { client_order_id: 'b', symbol: 'NVDA', side: 'SELL', order_type: 'STOP_LOSS', stop_price: '170' }] }] });
    expect(o.map((x) => [x.id, x.sym, x.limit, x.stop])).toEqual([['a', 'NVDA', 180, null], ['b', 'NVDA', null, 170]]);
  });
});

describe('order safety: single use, repeat-proof ids, PIN lockout, daily cap', () => {
  it('a confirmation works once, and its order ids never change', () => {
    process.env.WEBULL_APP_SECRET = 's'; process.env.WEBULL_ORDER_PIN = '4821';
    const t = makeTicket(buy, 1000), t2 = makeTicket(buy, 1000);
    expect(t).not.toBe(t2); // a fresh nonce each preview
    expect(claimTicket(t, 2000)).toBe(true);
    expect(claimTicket(t, 2100)).toBe(false);
    expect(claimTicket(t2, 2200)).toBe(true);
    const a = idsFromTicket(t), b = idsFromTicket(t), c = idsFromTicket(t2);
    expect(a).toEqual(b);
    expect(a.legs[0]).not.toBe(c.legs[0]);
    for (const id of [a.combo, ...a.legs]) expect(id.length).toBeLessThanOrEqual(32);
    expect(new Set([a.combo, ...a.legs]).size).toBe(4);
  });
  it('tampered tickets fail', () => {
    const t = makeTicket(buy, 1000);
    const [e, n, m] = t.split('.');
    expect(ticketOk(buy, `${e}.${n}.${m.slice(0, -2)}xx`, 2000)).toBe(false);
    expect(ticketOk(buy, `${Number(e) + 999999}.${n}.${m}`, 2000)).toBe(false);
    expect(ticketOk(buy, 'x.y', 2000)).toBe(false);
  });
  it('five wrong PINs lock it for 15 minutes, even for the right PIN', () => {
    const t0 = Date.UTC(2030, 0, 1);
    for (let i = 0; i < 5; i++) expect(checkPin('0000', t0 + i * 1000)).toBe('bad');
    expect(checkPin('4821', t0 + 10_000)).toBe('locked');
    expect(checkPin('4821', t0 + 16 * 60_000)).toBe('ok');
  });
  it('daily cap is reserved before sending', () => {
    process.env.WEBULL_MAX_ORDERS_DAY = '2';
    const got = [reserveDaily(), reserveDaily(), reserveDaily()];
    expect(got).toEqual([true, true, false]);
    delete process.env.WEBULL_MAX_ORDERS_DAY;
  });
});
