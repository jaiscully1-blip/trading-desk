// Market-wide insider activity from SEC Form 4: who is buying and selling their own company's stock with their own money.
// Built nightly by scripts/insiders-build.ts into published/insiders.json (open-market purchases "P" and larger sales "S" only).
// Pure functions here, tested. Facts about filings, not a signal: insiders sell for many reasons (taxes, diversification, planned
// schedules) but usually buy for one, and they are still often wrong. Not advice. Nothing here can trade.
import type { InsiderTx } from './insider.js';

export interface Row { d: string; f: string; sym: string; co: string; who: string; role: string; code: 'P' | 'S'; sh: number; px: number | null; val: number; plan: boolean; url: string }
export interface ShortRow { sym: string; ratio: number; vol: number }
export interface InsidersFile { built: string; days: string[]; rows: Row[]; shortVol: { date: string; rows: ShortRow[] } | null; errors: Record<string, string>; source: string }

export const MIN_SELL = 250_000; // sales are kept only above this value (most small sales are routine)
export function toRow(t: InsiderTx, i: { sym: string; name: string; plan: boolean }): Row | null {
  if ((t.code !== 'P' && t.code !== 'S') || t.value == null || !i.sym) return null;
  if (t.code === 'S' && t.value < MIN_SELL) return null;
  return { d: t.date, f: t.filed, sym: i.sym, co: i.name, who: t.who, role: t.role, code: t.code, sh: Math.round(t.shares), px: t.price, val: Math.round(t.value), plan: i.plan, url: t.url };
}
/** merge new rows into old ones, dropping duplicates and anything older than `keepDays` */
export function mergeRows(old: Row[], add: Row[], today: string, keepDays = 45): Row[] {
  const cut = new Date(Date.parse(`${today}T12:00:00Z`) - keepDays * 86400_000).toISOString().slice(0, 10);
  const seen = new Set<string>(); const out: Row[] = [];
  for (const r of [...add, ...old]) { const k = `${r.url}|${r.who}|${r.code}|${r.d}|${r.sh}|${r.px}`; if (seen.has(k) || r.d < cut) continue; seen.add(k); out.push(r); }
  return out.sort((a, b) => b.d.localeCompare(a.d) || b.val - a.val);
}

const isTop = (role: string) => /\b(CEO|Chief Executive|CFO|Chief Financial|President|Chair)/i.test(role);
export interface Tick { sym: string; co: string; buyers: number; buyVal: number; sellers: number; sellVal: number; topBuy: boolean; lastBuy: string; rows: Row[] }

/** rows from the last `days` days (by transaction date), grouped by ticker. `noPlan` leaves out sales under a 10b5-1 plan. */
export function byTicker(rows: Row[], today: string, days = 30, noPlan = false): Tick[] {
  const cut = new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400_000).toISOString().slice(0, 10);
  const m = new Map<string, Tick & { b: Set<string>; s: Set<string> }>();
  for (const r of rows) {
    if (r.d < cut || (noPlan && r.plan && r.code === 'S')) continue;
    let t = m.get(r.sym);
    if (!t) { t = { sym: r.sym, co: r.co, buyers: 0, buyVal: 0, sellers: 0, sellVal: 0, topBuy: false, lastBuy: '', rows: [], b: new Set(), s: new Set() }; m.set(r.sym, t); }
    t.rows.push(r);
    if (r.code === 'P') { t.b.add(r.who); t.buyVal += r.val; if (isTop(r.role)) t.topBuy = true; if (r.d > t.lastBuy) t.lastBuy = r.d; }
    else { t.s.add(r.who); t.sellVal += r.val; }
  }
  return [...m.values()].map(({ b, s, ...t }) => ({ ...t, buyers: b.size, sellers: s.size }));
}
export const clusterBuys = (t: Tick[], minPeople = 3) => t.filter((x) => x.buyers >= minPeople).sort((a, b) => b.buyers - a.buyers || b.buyVal - a.buyVal);
export const topBuys = (rows: Row[], today: string, days = 30, n = 15) => { const cut = new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400_000).toISOString().slice(0, 10); return rows.filter((r) => r.code === 'P' && r.d >= cut).sort((a, b) => b.val - a.val).slice(0, n); };
export const topSells = (rows: Row[], today: string, days = 30, n = 15, noPlan = false) => { const cut = new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400_000).toISOString().slice(0, 10); return rows.filter((r) => r.code === 'S' && r.d >= cut && !(noPlan && r.plan)).sort((a, b) => b.val - a.val).slice(0, n); };
/** weekly totals of insider buying and selling ($), oldest first */
export function weekly(rows: Row[], today: string, weeks = 6): { start: string; buy: number; sell: number }[] {
  const t0 = Date.parse(`${today}T12:00:00Z`);
  const out = Array.from({ length: weeks }, (_, i) => ({ start: new Date(t0 - (weeks - i) * 7 * 86400_000 + 86400_000).toISOString().slice(0, 10), buy: 0, sell: 0 }));
  for (const r of rows) { const age = Math.floor((t0 - Date.parse(`${r.d}T12:00:00Z`)) / (7 * 86400_000)); const k = weeks - 1 - age; if (k >= 0 && k < weeks) { if (r.code === 'P') out[k].buy += r.val; else out[k].sell += r.val; } }
  return out;
}
