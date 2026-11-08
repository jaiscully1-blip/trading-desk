// Ping rules for starred stocks: pure functions so they can be tested. The app calls them on each data update.
import type { Bar } from '../types';
import { analyze } from '../../shared/patterns';

export type PingKind = 'news' | 'earnings' | 'move' | 'level' | 'rotation';
export interface Ping { id: string; t: number; sym: string; kind: PingKind; text: string; url?: string; tone?: 'up' | 'down' }

/** Move pings fire once per day each time the day's change crosses another multiple of the threshold (3%, 6%, 9%…). */
export function movePing(sym: string, chgPct: number, threshold: number, day: string, fired: Set<string>): Ping | null {
  if (!Number.isFinite(chgPct) || threshold <= 0) return null;
  const k = Math.floor(Math.abs(chgPct) / threshold);
  if (k < 1) return null;
  const id = `move:${sym}:${day}:${chgPct > 0 ? '+' : '-'}${k}`;
  if (fired.has(id)) return null;
  fired.add(id);
  return { id, t: Date.now(), sym, kind: 'move', tone: chgPct > 0 ? 'up' : 'down', text: `${chgPct > 0 ? 'up' : 'down'} ${Math.abs(chgPct).toFixed(1)}% today (past ${chgPct > 0 ? '+' : '−'}${k * threshold}%)` };
}

export interface WatchLevel { key: string; label: string; price: number }
/** Levels worth a ping: prior-day high/low, plus each live pattern's trigger (from the same engine as the Patterns page). */
export function watchLevels(daily: Bar[], todayStart: number): WatchLevel[] {
  const done = daily.filter((b) => b.time < todayStart);
  const prev = done.at(-1);
  const out: WatchLevel[] = [];
  if (prev) out.push({ key: `pdh:${prev.time}`, label: 'yesterday’s high', price: prev.high }, { key: `pdl:${prev.time}`, label: 'yesterday’s low', price: prev.low });
  if (done.length >= 30) {
    for (const h of analyze(done, '').charts) {
      if (h.status === 'forming' && h.trigger != null) out.push({ key: `pat:${h.id}:${h.start}`, label: `${h.name.toLowerCase()} trigger`, price: h.trigger });
    }
  }
  return out;
}
export function levelPings(sym: string, prev: number, cur: number, levels: WatchLevel[], fired: Set<string>): Ping[] {
  const out: Ping[] = [];
  if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev === cur) return out;
  for (const l of levels) {
    const up = prev < l.price && cur >= l.price, dn = prev > l.price && cur <= l.price;
    if (!up && !dn) continue;
    const id = `level:${sym}:${l.key}:${up ? 'up' : 'dn'}`;
    if (fired.has(id)) continue;
    fired.add(id);
    out.push({ id, t: Date.now(), sym, kind: 'level', tone: up ? 'up' : 'down', text: `crossed ${up ? 'above' : 'below'} ${l.label} ${l.price.toFixed(2)} (last ${cur.toFixed(2)})` });
  }
  return out;
}

export interface EarnLike { sym: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
const when = (h: string) => (h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : 'time not set');
/** Day-before reminder, report-day reminder, and a "reported" ping once actual EPS shows up. */
export function earningsPings(rows: EarnLike[], today: string, tomorrow: string, fired: Set<string>): Ping[] {
  const out: Ping[] = [];
  const add = (id: string, p: Omit<Ping, 'id' | 't'>) => { if (!fired.has(id)) { fired.add(id); out.push({ id, t: Date.now(), ...p }); } };
  for (const r of rows) {
    const est = r.epsEst != null ? ` · EPS est ${r.epsEst.toFixed(2)}` : '';
    if (r.epsAct != null) {
      const beat = r.epsEst != null ? (r.epsAct > r.epsEst ? 'beat' : r.epsAct < r.epsEst ? 'missed' : 'matched') : 'reported';
      add(`earn:${r.sym}:${r.date}:act`, { sym: r.sym, kind: 'earnings', tone: beat === 'beat' ? 'up' : beat === 'missed' ? 'down' : undefined, text: `reported: EPS ${r.epsAct.toFixed(2)}${r.epsEst != null ? ` vs ${r.epsEst.toFixed(2)} est (${beat})` : ''}${r.revAct != null && r.revEst != null ? `, revenue ${r.revAct >= r.revEst ? 'above' : 'below'} est` : ''} · delayed` });
    } else if (r.date === today) add(`earn:${r.sym}:${r.date}:day`, { sym: r.sym, kind: 'earnings', text: `reports today ${when(r.hour)}${est}` });
    else if (r.date === tomorrow) add(`earn:${r.sym}:${r.date}:pre`, { sym: r.sym, kind: 'earnings', text: `reports tomorrow ${when(r.hour)}${est}` });
  }
  return out;
}
