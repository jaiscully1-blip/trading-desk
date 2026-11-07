// Broker CSV import: fills (orders) and cash transfers. Columns are auto-detected and can be remapped in the UI.
import { etToUtc } from '../../shared/clock';
import type { Fill, Trade, Transfer } from './journal';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row.map((x) => x.trim()));
  return rows;
}

export type FillField = 'symbol' | 'side' | 'qty' | 'price' | 'time' | 'status' | 'fee';
export type TransferField = 'time' | 'amount' | 'type';
export interface Mapping { kind: 'fills' | 'transfers'; cols: Partial<Record<FillField | TransferField, number>> }

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, '');
// Aliases checked in priority order (first match wins). Webull's order history export uses Filled / Avg Price / Filled Time.
const FILL_ALIASES: Record<FillField, string[]> = {
  // Webull, Robinhood (Instrument / Trans Code / Activity Date), Schwab (Action / Fees & Comm), Fidelity (Run Date / Price ($)),
  // IBKR (Date/Time / T. Price / Comm/Fee, signed Quantity), E*TRADE (TransactionDate), thinkorswim (Exec Time / Side / Qty)
  symbol: ['symbol', 'ticker', 'instrument', 'security', 'underlyingsymbol'],
  side: ['side', 'action', 'buysell', 'transcode', 'transactiontype', 'type'],
  qty: ['filled', 'filledqty', 'filledquantity', 'qty', 'quantity', 'shares', 'totalqty'],
  price: ['avgprice', 'averagefillprice', 'averageprice', 'fillprice', 'executionprice', 'tprice', 'price', 'netprice'],
  time: ['filledtime', 'executiontime', 'exectime', 'filltime', 'time', 'datetime', 'activitydate', 'rundate', 'transactiondate', 'tradedate', 'date', 'placedtime'],
  status: ['status', 'orderstatus'],
  fee: ['fee', 'fees', 'commission', 'commissions', 'feescomm', 'commfee', 'commissionfees'],
};
const TRANSFER_ALIASES: Record<TransferField, string[]> = {
  time: ['date', 'time', 'datetime', 'transferdate', 'completedtime', 'createdtime', 'activitydate', 'rundate', 'transactiondate', 'tradedate', 'settledate'],
  amount: ['amount', 'netamount', 'value', 'cashamount'],
  type: ['type', 'transactiontype', 'description', 'activity', 'action', 'direction'],
};

function pick(headers: string[], aliases: string[]): number | undefined {
  const n = headers.map(norm);
  for (const a of aliases) { const i = n.indexOf(a); if (i >= 0) return i; }
  return undefined;
}

/** Many brokers put account info or a title above the real header (Schwab, Fidelity). Start at the first row that looks like one. */
export function trimToHeader(rows: string[][]): string[][] {
  const known = new Set([...Object.values(FILL_ALIASES).flat(), ...Object.values(TRANSFER_ALIASES).flat()]);
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const hits = rows[i].filter((c) => known.has(norm(c))).length;
    if (hits >= 3) return rows.slice(i);
  }
  return rows;
}

/** Guess whether a file is fills or cash transfers, and which column is which. */
export function detect(rows: string[][]): Mapping {
  const h = rows[0] ?? [];
  const body = rows.slice(1, 40);
  const transferish = body.filter((r) => r.some((c) => /deposit|withdraw|ach|wire|transfer/i.test(c))).length;
  const hasSymbol = pick(h, FILL_ALIASES.symbol) != null;
  if (!hasSymbol && transferish > 0) {
    const cols: Mapping['cols'] = {};
    for (const k of Object.keys(TRANSFER_ALIASES) as TransferField[]) cols[k] = pick(h, TRANSFER_ALIASES[k]);
    return { kind: 'transfers', cols };
  }
  const cols: Mapping['cols'] = {};
  for (const k of Object.keys(FILL_ALIASES) as FillField[]) cols[k] = pick(h, FILL_ALIASES[k]);
  return { kind: 'fills', cols };
}

/**
 * Parse a broker timestamp as US Eastern unless it carries an explicit offset/Z.
 * Handles "11/03/2026 09:45:12 EST", "2026-11-03 09:45", "11/3/26 9:45 AM", ISO with Z.
 */
export function parseTime(s: string): number | null {
  const x = s.trim();
  if (!x) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(x) && /\d{4}-\d{2}-\d{2}T/.test(x)) { const t = Date.parse(x); return Number.isFinite(t) ? t : null; }
  const clean = x.replace(/\b(EST|EDT|ET|US\/Eastern)\b/i, '').trim();
  let y: number, mo: number, d: number, rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T]?(.*)$/.exec(clean);
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; rest = m[4]; }
  else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ ,]*(.*)$/.exec(clean))) { mo = +m[1]; d = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; rest = m[4]; }
  else return null;
  let h = 0, mi = 0, sec = 0;
  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i.exec(rest.trim());
  if (tm) {
    h = +tm[1]; mi = +tm[2]; sec = +(tm[3] ?? 0);
    if (tm[4]) { const pm = tm[4].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  }
  return etToUtc(y, mo, d, h, mi) + sec * 1000;
}

const money = (s: string) => {
  const neg = /^\(.*\)$/.test(s.trim()) || /^-/.test(s.trim());
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
};
/** Stable id from content so re-importing the same file never doubles fills. */
export function rowId(parts: (string | number)[]) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return `csv-${(h >>> 0).toString(36)}`;
}

export interface ParsedFill extends Fill { sym: string }
export interface ParseResult<T> { items: T[]; skipped: { row: number; why: string }[] }

export function toFills(rows: string[][], m: Mapping): ParseResult<ParsedFill> {
  const c = m.cols, items: ParsedFill[] = [], skipped: { row: number; why: string }[] = [];
  const seen = new Map<string, number>();
  rows.slice(1).forEach((r, i) => {
    const get = (k: FillField) => (c[k] != null ? r[c[k]!] ?? '' : '');
    const status = get('status');
    if (status && !/fill|executed|complete/i.test(status)) return skipped.push({ row: i + 2, why: `status ${status}` });
    const sym = get('symbol').toUpperCase().replace(/\s.*$/, '');
    const sideRaw = get('side').toLowerCase();
    let action: 'buy' | 'sell' | null = /buy|bot|bought|long|cover/.test(sideRaw) ? 'buy' : /sell|sld|sold|short/.test(sideRaw) ? 'sell' : null;
    const qtyRaw = money(get('qty'));
    // IBKR has no side column: a negative quantity is a sell
    if (!action && c.side == null && Number.isFinite(qtyRaw) && qtyRaw !== 0) action = qtyRaw < 0 ? 'sell' : 'buy';
    const qty = Math.abs(qtyRaw);
    const price = Math.abs(money(get('price')));
    const t = parseTime(get('time'));
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return skipped.push({ row: i + 2, why: 'no symbol' });
    if (!action) return skipped.push({ row: i + 2, why: c.side == null ? 'no side column (map one)' : `side "${get('side')}"` });
    if (!(qty > 0) || !(price > 0)) return skipped.push({ row: i + 2, why: 'no qty/price (unfilled?)' });
    if (t == null) return skipped.push({ row: i + 2, why: `time "${get('time')}"` });
    const base = rowId([sym, action, qty, price, t]);
    const n = (seen.get(base) ?? 0) + 1; // identical fills in one file stay distinct
    seen.set(base, n);
    const fee = c.fee != null ? Math.abs(money(get('fee'))) : undefined;
    items.push({ id: n > 1 ? `${base}-${n}` : base, sym, t, action, qty, price, src: 'csv', fee: Number.isFinite(fee) ? fee : undefined });
  });
  return { items: items.sort((a, b) => a.t - b.t), skipped };
}

export function toTransfers(rows: string[][], m: Mapping): ParseResult<Transfer> {
  const c = m.cols, items: Transfer[] = [], skipped: { row: number; why: string }[] = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k: TransferField) => (c[k] != null ? r[c[k]!] ?? '' : '');
    const type = get('type') || r.join(' ');
    const isDep = /deposit|incoming|transfer in|ach in|wire in/i.test(type);
    const isWd = /withdraw|outgoing|transfer out|ach out|wire out/i.test(type);
    const amt = money(get('amount'));
    const t = parseTime(get('time'));
    if (!Number.isFinite(amt) || t == null) return skipped.push({ row: i + 2, why: 'no amount/date' });
    if (!isDep && !isWd) return skipped.push({ row: i + 2, why: `not a deposit/withdrawal (${type.slice(0, 30)})` });
    const amount = isWd ? -Math.abs(amt) : Math.abs(amt);
    items.push({ id: rowId(['tr', t, amount]), t, amount, note: type.slice(0, 60), src: 'csv', updated: Date.now() });
  });
  return { items, skipped };
}

export interface MergeResult { trades: Trade[]; added: number; matched: number; created: number; duplicate: number }

/**
 * Group fills into round trips per symbol (flat -> position -> flat) and attach each round trip to a journal trade:
 * same symbol and side, logged without broker fills (or with manual fills) within 30 min before the first fill.
 * Unmatched round trips become "imported" trades (no plan, flagged as a rule violation).
 */
export function mergeFills(trades: Trade[], fills: ParsedFill[], now = Date.now()): MergeResult {
  const existing = new Set(trades.flatMap((t) => t.fills.map((f) => f.id)));
  const fresh = fills.filter((f) => !existing.has(f.id));
  const duplicate = fills.length - fresh.length;
  const out = trades.map((t) => ({ ...t, fills: [...t.fills] }));
  let matched = 0, created = 0;
  const bySym = new Map<string, ParsedFill[]>();
  for (const f of fresh) bySym.set(f.sym, [...(bySym.get(f.sym) ?? []), f]);

  for (const [sym, fs] of bySym) {
    // split into round trips
    let pos = 0;
    let cur: ParsedFill[] = [];
    const trips: ParsedFill[][] = [];
    for (const f of fs) {
      cur.push(f);
      pos += f.action === 'buy' ? f.qty : -f.qty;
      if (Math.abs(pos) < 1e-9) { trips.push(cur); cur = []; pos = 0; }
    }
    if (cur.length) trips.push(cur);
    for (const trip of trips) {
      const side = trip[0].action === 'buy' ? 'long' : 'short';
      const start = trip[0].t;
      const target = out
        .filter((t) => !t.deleted && t.sym === sym && t.side === side && !t.fills.some((f) => f.src === 'csv') && t.created <= start + 60_000 && t.created >= start - 30 * 60_000)
        .sort((a, b) => Math.abs(a.created - start) - Math.abs(b.created - start))[0];
      const clean = trip.map(({ sym: _s, ...f }) => f);
      if (target) {
        target.fills = [...target.fills.filter((f) => f.src !== 'manual'), ...clean]; // broker fills replace hand-entered ones
        target.updated = now;
        matched++;
      } else {
        out.push({
          id: `imp-${trip[0].id}`, created: start, updated: now, sym, side, initialStop: null, stop: null, stopHistory: [], target: null, plannedSize: null,
          thesis: '', setup: '', emotion: null, grade: null, checklist: [], fills: clean, imported: true,
        });
        created++;
      }
    }
  }
  return { trades: out, added: fresh.length, matched, created, duplicate };
}

/** Both readings of one file: brokers like Robinhood and Schwab put trades and deposits in the same export. */
export function detectAll(rows: string[][]): { fills: Mapping; transfers: Mapping } {
  const h = rows[0] ?? [];
  const fills: Mapping = { kind: 'fills', cols: {} }, transfers: Mapping = { kind: 'transfers', cols: {} };
  for (const k of Object.keys(FILL_ALIASES) as FillField[]) fills.cols[k] = pick(h, FILL_ALIASES[k]);
  for (const k of Object.keys(TRANSFER_ALIASES) as TransferField[]) transfers.cols[k] = pick(h, TRANSFER_ALIASES[k]);
  return { fills, transfers };
}
/** enough columns to read trades (side may come from a signed quantity) */
export const fillsReady = (m: Mapping) => (['symbol', 'qty', 'price', 'time'] as const).every((k) => m.cols[k] != null);
export const transfersReady = (m: Mapping) => m.cols.time != null && m.cols.amount != null;
