// Phone alerts while the desk is closed. A GitHub Action checks your alert list every ~10 minutes in market hours and
// pushes to the free ntfy app (ntfy.sh): big moves, prior-day high / low breaks, and names entering or leaving the distress list.
// Information only: alerts never place, change or suggest trades. Pure functions here; sending lives in api/_lib/notify.ts.
import type { DistressRow, Label } from './distress.js';

export interface DayBar { last: number; prevClose: number; prevHigh: number; prevLow: number; at: number }
export interface Alert { id: string; title: string; message: string; tags: string[]; priority: 3 | 4 }

/** Yahoo v8 chart (range=5d, interval=1d; unofficial) -> today's last price and yesterday's close, high and low. */
export function parseDayBars(j: any): DayBar | null {
  const r = j?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  const ts: number[] = r?.timestamp ?? [];
  const last = Number(r?.meta?.regularMarketPrice);
  if (!q || ts.length < 2 || !Number.isFinite(last)) return null;
  const today = new Date(Number(r.meta.regularMarketTime) * 1000).toISOString().slice(0, 10);
  // the newest bar is today's (partial) bar when it is dated today; the one before it is "yesterday"
  let i = ts.length - 1;
  if (new Date(ts[i] * 1000).toISOString().slice(0, 10) === today) i -= 1;
  const [c, h, l] = [q.close?.[i], q.high?.[i], q.low?.[i]].map(Number);
  if (![c, h, l].every(Number.isFinite)) return null;
  return { last, prevClose: c, prevHigh: h, prevLow: l, at: Number(r.meta.regularMarketTime) * 1000 };
}

/** Alerts for one ticker today. Each id includes the day, so an alert fires once a day. */
export function priceAlerts(sym: string, b: DayBar, day: string, movePct = 4): Alert[] {
  const out: Alert[] = [];
  const chg = (b.last / b.prevClose - 1) * 100;
  const px = (v: number) => `$${v.toFixed(2)}`;
  for (const step of [movePct, movePct * 2]) {
    if (Math.abs(chg) >= step) out.push({ id: `${day}:${sym}:move${chg > 0 ? '+' : '-'}${step}`, title: `${sym} ${chg > 0 ? 'up' : 'down'} ${Math.abs(chg).toFixed(1)}%`, message: `${sym} ${px(b.last)} vs ${px(b.prevClose)} yesterday.`, tags: [chg > 0 ? 'chart_with_upwards_trend' : 'chart_with_downwards_trend'], priority: step > movePct ? 4 : 3 });
  }
  if (b.last > b.prevHigh) out.push({ id: `${day}:${sym}:pdh`, title: `${sym} above yesterday's high`, message: `${sym} ${px(b.last)}, yesterday's high was ${px(b.prevHigh)}.`, tags: ['arrow_up'], priority: 3 });
  if (b.last < b.prevLow) out.push({ id: `${day}:${sym}:pdl`, title: `${sym} below yesterday's low`, message: `${sym} ${px(b.last)}, yesterday's low was ${px(b.prevLow)}.`, tags: ['arrow_down'], priority: 3 });
  return out;
}

const RANK: Record<Label, number> = { healthy: 0, turnaround: 1, watch: 2, distressed: 3 };
/** Names on your list whose distress label changed since the last nightly read. */
export function distressAlerts(prev: DistressRow[], next: DistressRow[], watch: Set<string>, day: string): Alert[] {
  const before = new Map(prev.map((r) => [r.sym, r]));
  const out: Alert[] = [];
  for (const r of next) {
    if (watch.size && !watch.has(r.sym)) continue;
    const p = before.get(r.sym);
    if (!p || p.label === r.label) continue;
    const worse = RANK[r.label] > RANK[p.label] && r.label !== 'turnaround';
    if (r.label === 'healthy' && p.label === 'turnaround') continue;
    out.push({ id: `${day}:${r.sym}:label:${r.label}`, title: `${r.sym}: ${p.label} → ${r.label}`, message: `Weakness ${r.weak}, strength ${r.turn}. ${r.signals[0]?.text ?? ''} (calculated, not advice)`, tags: [worse ? 'warning' : 'seedling'], priority: worse && r.label === 'distressed' ? 4 : 3 });
  }
  return out;
}

/** US regular session, 9:30 to 16:00 New York time, Monday to Friday (exchange holidays are not checked: no moves, no alerts). */
export function marketOpen(ms: number): boolean {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  if (p.weekday === 'Sat' || p.weekday === 'Sun') return false;
  const m = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return m >= 9 * 60 + 30 && m < 16 * 60;
}

/** One ticker per line, # comments allowed. */
export const readTickers = (text: string) => [...new Set(text.split('\n').map((s) => s.replace(/#.*/, '').trim().toUpperCase()).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))];
