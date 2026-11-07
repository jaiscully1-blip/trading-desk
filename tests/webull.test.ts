import { describe, expect, it } from 'vitest';
import { pyQuote, webullSign } from '../api/_lib/webull';
import { fillsFromOrders, normBalance, normPositions, realized } from '../shared/webull';
import { botWatchlist, messageText, tickersIn, toMessages } from '../shared/discord';

describe('webull signing', () => {
  // Expected values were produced by Webull's official Python SDK (default_signature_composer.calc_signature)
  // with the same timestamp and nonce pinned.
  const base = { host: 'api.webull.com', appKey: 'APPKEY123', secret: 'SECRET456', timestamp: '2026-11-07T15:00:00Z', nonce: '48ef5afed43d4d91ae514aaeafbc29ba' };
  it('matches the SDK for a GET with query params', () => {
    const { signature, headers } = webullSign({ ...base, path: '/trading/orders/historical-orders/list', query: { account_id: 'ACC1', start_time: '2026-10-01T00:00:00.000+0000' } });
    expect(signature).toBe('7gWqYhgxoWtjXnqESZsfGfyufKwzHjolu3FaHdr2tzI=');
    expect(headers['x-signature-algorithm']).toBe('HMAC-SHA256');
  });
  it('matches the SDK for a POST with a body', () => {
    expect(webullSign({ ...base, path: '/auth/tokens/create', body: { token: 'abc' } }).signature).toBe('XG3Y9uOVCKIDLcWjuwGPJqfTF87n0rdV++8B+vBOrg4=');
  });
  it('quotes like Python urllib', () => {
    expect(pyQuote("a/b c!'()*~")).toBe('a%2Fb%20c%21%27%28%29%2A~');
  });
});

describe('webull normalizers', () => {
  it('reads positions and balance under common field names', () => {
    const pos = normPositions({ data: [{ symbol: 'nvda', quantity: '10', cost_price: '100', last_price: '110', market_value: '1100', unrealized_profit_loss: '100', unrealized_profit_loss_rate: '0.1' }] });
    expect(pos[0]).toMatchObject({ sym: 'NVDA', qty: 10, avgCost: 100, unreal: 100, option: false });
    expect(pos[0].unrealPct).toBeCloseTo(10);
    expect(normBalance({ total_asset: '25000', account_currency_assets: [{ buying_power: '50000', cash_balance: '5000' }] })).toMatchObject({ total: 25000, buyingPower: 50000, cash: 5000, dayPnl: null });
  });
  it('finds filled orders (including combo legs) and FIFO-matches realized P&L by ET day', () => {
    const t0 = Date.parse('2026-11-02T15:00:00Z');
    const raw = [{ orders: [
      { order_id: '1', symbol: 'AMD', side: 'BUY', filled_quantity: '10', filled_price: '100', filled_time: t0, status: 'FILLED' },
      { order_id: '2', symbol: 'AMD', side: 'SELL', filled_quantity: '4', filled_price: '110', filled_time: t0 + 3600_000 },
      { order_id: '3', symbol: 'AMD', side: 'SELL', filled_quantity: '6', filled_price: '95', filled_time: t0 + 86400_000 },
      { order_id: '4', symbol: 'TSLA', side: 'SELL', filled_quantity: '2', filled_price: '300', filled_time: t0 },
      { order_id: '5', symbol: 'MU', side: 'SELL_SHORT', filled_quantity: '5', filled_price: '50', filled_time: t0 },
      { order_id: '6', symbol: 'MU', side: 'BUY', filled_quantity: '5', filled_price: '48', filled_time: t0 + 7200_000 },
      { order_id: '7', symbol: 'AMD', side: 'BUY', filled_quantity: '0', status: 'CANCELLED', place_time: t0 },
    ] }];
    const fills = fillsFromOrders(raw);
    expect(fills).toHaveLength(6);
    const r = realized(fills);
    expect(r.days.map((d) => [d.day, Math.round(d.pnl)])).toEqual([['2026-11-02', 50], ['2026-11-03', -30]]);
    expect(r.days[0]).toMatchObject({ trades: 2, wins: 2 });
    expect(r.unmatched).toEqual([{ sym: 'TSLA', qty: 2 }]);
    expect(r.closed.find((c) => c.sym === 'MU')?.side).toBe('short');
  });
});

describe('discord', () => {
  it('reads content and embeds, cashtags and known tickers only', () => {
    const m = { id: '9', timestamp: '2026-11-06T13:00:00Z', author: { username: 'deskbot', bot: true }, content: 'Watch $nvda and AMD today. RSI high, CEO talks AM.', embeds: [{ title: 'Plan', fields: [{ name: 'Swing', value: 'MU above 120' }] }] };
    expect(messageText(m)).toContain('Swing: MU above 120');
    const known = new Set(['AMD', 'MU', 'NVDA', 'CEO', 'AM']);
    expect(tickersIn(messageText(m), known).sort()).toEqual(['AMD', 'MU', 'NVDA']);
    const msgs = toMessages([m], 'before', 'G1', 'C1', known);
    expect(msgs[0].url).toBe('https://discord.com/channels/G1/C1/9');
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    expect(botWatchlist(msgs, '2026-11-06', day).map((w) => w.sym).sort()).toEqual(['AMD', 'MU', 'NVDA']);
  });
});
