// Turns Webull OpenAPI responses into desk rows: positions, balance, fills and a realized-P&L calendar.
// Webull's docs don't publish every response field, so each value is looked up under the names Webull uses
// across its APIs, and anything not found stays null (shown as "—", never guessed).

export interface WbPosition { sym: string; qty: number; avgCost: number | null; last: number | null; value: number | null; unreal: number | null; unrealPct: number | null; option: boolean }
export interface WbBalance { total: number | null; cash: number | null; buyingPower: number | null; dayPnl: number | null; unreal: number | null }
export interface WbFill { id: string; sym: string; side: 'BUY' | 'SELL'; qty: number; price: number; t: number; mult: number; short?: boolean }
export interface WbDay { day: string; pnl: number; trades: number; wins: number; losses: number; syms: string[] }
export interface WbClosed { sym: string; day: string; qty: number; entry: number; exit: number; pnl: number; side: 'long' | 'short'; tOpen: number; tClose: number }

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
export function pick(o: any, keys: string[]): number | null {
  for (const k of keys) { const v = num(o?.[k]); if (v != null) return v; }
  return null;
}
const pickStr = (o: any, keys: string[]): string => { for (const k of keys) if (typeof o?.[k] === 'string' && o[k]) return o[k]; return ''; };

/** The list inside a response, whatever Webull wraps it in. */
export function listOf(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  for (const k of ['data', 'items', 'list', 'positions', 'holdings', 'orders', 'accounts', 'records', 'result']) {
    const v = raw?.[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') { const inner = listOf(v); if (inner.length) return inner; }
  }
  return [];
}

const isOption = (o: any) => /OPTION/i.test(pickStr(o, ['instrument_type', 'category', 'asset_type', 'security_type']));
const symOf = (o: any) => (pickStr(o, ['symbol', 'ticker', 'disSymbol', 'display_symbol']) || pickStr(o?.instrument ?? o?.ticker_info ?? {}, ['symbol', 'ticker'])).toUpperCase();

export function normPositions(raw: any): WbPosition[] {
  return listOf(raw).map((p) => {
    const qty = pick(p, ['quantity', 'qty', 'position', 'total_quantity', 'holding_quantity']) ?? 0;
    const avgCost = pick(p, ['cost_price', 'avg_cost', 'average_cost', 'cost_price_per_share', 'avg_price']);
    const last = pick(p, ['last_price', 'market_price', 'price', 'close_price']);
    const value = pick(p, ['market_value', 'marketValue', 'position_value']);
    const unreal = pick(p, ['unrealized_profit_loss', 'unrealized_pnl', 'unrealizedProfitLoss', 'unrealized_profit']);
    let unrealPct = pick(p, ['unrealized_profit_loss_rate', 'unrealized_pnl_rate', 'unrealizedProfitLossRate']);
    if (unrealPct != null && Math.abs(unrealPct) <= 5) unrealPct *= 100; // rates come as fractions
    return { sym: symOf(p), qty, avgCost, last, value, unreal, unrealPct, option: isOption(p) };
  }).filter((p) => p.sym);
}

export function normBalance(raw: any): WbBalance {
  const b = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
  const cur = listOf(b?.account_currency_assets ?? b?.currency_assets ?? [])[0] ?? {};
  const both = (keys: string[]) => pick(b, keys) ?? pick(cur, keys);
  return {
    total: both(['total_asset', 'total_net_liquidation_value', 'net_liquidation_value', 'net_liquidation', 'total_assets']),
    cash: both(['total_cash_value', 'cash_balance', 'cash', 'settled_cash']),
    buyingPower: both(['buying_power', 'day_buying_power', 'overnight_buying_power']),
    dayPnl: both(['day_profit_loss', 'today_profit_loss', 'day_pnl']),
    unreal: both(['unrealized_profit_loss', 'total_unrealized_profit_loss']),
  };
}

const toMs = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = num(v);
  if (n != null) return n > 1e12 ? n : n > 1e9 ? n * 1000 : null;
  const t = Date.parse(String(v).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isFinite(t) ? t : null;
};

/** Every filled order (or filled leg) found anywhere in an order-history response. */
export function fillsFromOrders(raw: any): WbFill[] {
  const out: WbFill[] = [];
  const seen = new Set<string>();
  const visit = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(visit); return; }
    const side = pickStr(o, ['side', 'action', 'order_side']).toUpperCase();
    const sym = symOf(o);
    if (sym && /^(BUY|SELL|SELL_SHORT|BUY_TO_COVER|SHORT)/.test(side)) {
      const qty = pick(o, ['filled_quantity', 'filled_qty', 'filledQuantity', 'executed_quantity']);
      const price = pick(o, ['filled_price', 'avg_filled_price', 'average_filled_price', 'filledPrice', 'avg_price', 'executed_price']);
      const t = toMs(o.filled_time ?? o.filled_time_at ?? o.last_filled_time ?? o.update_time ?? o.updated_at ?? o.place_time ?? o.create_time);
      const id = String(o.order_id ?? o.client_order_id ?? o.id ?? `${sym}:${side}:${t}:${qty}`);
      if (qty && qty > 0 && price != null && t != null && !seen.has(id)) {
        seen.add(id);
        out.push({ id, sym, side: side.startsWith('BUY') ? 'BUY' : 'SELL', qty, price, t, mult: isOption(o) ? 100 : 1, ...(/SHORT/.test(side) ? { short: true } : {}) });
      }
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v);
  };
  visit(raw);
  return out.sort((a, b) => a.t - b.t);
}

export const etDay = (t: number) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** FIFO match fills into closed trades. Closes with no opening fill in the window are counted, not priced. */
export function realized(fills: WbFill[]): { closed: WbClosed[]; days: WbDay[]; unmatched: { sym: string; qty: number }[] } {
  const lots: Record<string, { qty: number; price: number; t: number; mult: number }[]> = {};
  const closed: WbClosed[] = [];
  const unmatched: Record<string, number> = {};
  for (const f of fills) {
    const sign = f.side === 'BUY' ? 1 : -1;
    const book = (lots[f.sym] ??= []);
    let left = f.qty;
    while (left > 0 && book.length && Math.sign(book[0].qty) === -sign) {
      const lot = book[0], take = Math.min(left, Math.abs(lot.qty));
      const long = lot.qty > 0;
      const pnl = (long ? f.price - lot.price : lot.price - f.price) * take * lot.mult;
      closed.push({ sym: f.sym, day: etDay(f.t), qty: take, entry: lot.price, exit: f.price, pnl, side: long ? 'long' : 'short', tOpen: lot.t, tClose: f.t });
      lot.qty -= Math.sign(lot.qty) * take;
      left -= take;
      if (lot.qty === 0) book.shift();
    }
    if (left > 0) {
      // a plain SELL with nothing open is the close of shares bought before this window
      if (sign < 0 && !book.length && !f.short) unmatched[f.sym] = (unmatched[f.sym] ?? 0) + left;
      else book.push({ qty: sign * left, price: f.price, t: f.t, mult: f.mult });
    }
  }
  const byDay = new Map<string, WbDay>();
  for (const c of closed) {
    const d = byDay.get(c.day) ?? { day: c.day, pnl: 0, trades: 0, wins: 0, losses: 0, syms: [] };
    d.pnl += c.pnl; d.trades++; if (c.pnl > 0) d.wins++; else if (c.pnl < 0) d.losses++;
    if (!d.syms.includes(c.sym)) d.syms.push(c.sym);
    byDay.set(c.day, d);
  }
  return { closed, days: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)), unmatched: Object.entries(unmatched).map(([sym, qty]) => ({ sym, qty })) };
}

/** Webull's time format for order history: yyyy-MM-dd'T'HH:mm:ss.SSSZ */
export const wbTime = (t: number) => new Date(t).toISOString().replace('Z', '+0000');

/** Open (resting) orders, read under the field names Webull's order endpoints use. Combo legs are flattened. */
export interface WbOpenOrder { id: string; sym: string; side: string; type: string; qty: number | null; filled: number | null; limit: number | null; stop: number | null; status: string; tif: string; placed: number | null; combo: string }
export function normOpenOrders(raw: any): WbOpenOrder[] {
  const out: WbOpenOrder[] = [];
  const add = (o: any) => {
    const id = String(o?.client_order_id ?? o?.clientOrderId ?? '');
    if (!id) return;
    const t = o?.place_time ?? o?.create_time ?? o?.placed_time;
    out.push({
      id, sym: String(o?.symbol ?? '').toUpperCase(), side: String(o?.side ?? ''), type: String(o?.order_type ?? ''),
      qty: num(o?.quantity ?? o?.total_quantity ?? o?.qty), filled: num(o?.filled_quantity ?? o?.filled_qty), limit: num(o?.limit_price), stop: num(o?.stop_price),
      status: String(o?.status ?? o?.order_status ?? ''), tif: String(o?.time_in_force ?? ''), placed: t == null ? null : typeof t === 'number' ? t : Date.parse(String(t)) || null,
      combo: String(o?.combo_type ?? ''),
    });
  };
  for (const g of listOf(raw)) {
    const legs = Array.isArray(g?.orders) ? g.orders : Array.isArray(g?.items) ? g.items : null;
    if (legs) legs.forEach(add); else add(g);
  }
  return out;
}
