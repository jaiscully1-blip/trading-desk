// Patterns in your own trading: slices closed trades by time of day, weekday, setup, hold time, size, side, trade
// number in the day, what came right before, and day-level habits (rule breaks, following the plan). Each slice has
// its count, total and average P&L and win rate, and the strongest differences are turned into plain sentences.
// Small samples are flagged. Pure (tested).
import type { TradeView } from './journal';

export interface Bucket { key: string; n: number; pnl: number; avg: number; win: number }
export interface Lens { id: string; title: string; buckets: Bucket[] }
export interface Finding { text: string; tone: 'up' | 'down'; strength: number; lens: string }
export const MIN_N = 5;

const etParts = (ms: number) => { const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(new Date(ms)); const g = (t: string) => f.find((p) => p.type === t)?.value ?? ''; return { h: +g('hour') % 24, m: +g('minute'), wd: g('weekday'), day: `${g('year')}-${g('month')}-${g('day')}` }; };

function bucketize<T>(xs: T[], key: (x: T) => string | null, pnl: (x: T) => number, order?: string[]): Bucket[] {
  const m = new Map<string, number[]>();
  for (const x of xs) { const k = key(x); if (k == null) continue; m.set(k, [...(m.get(k) ?? []), pnl(x)]); }
  const out = [...m].map(([k, v]) => ({ key: k, n: v.length, pnl: v.reduce((a, b) => a + b, 0), avg: v.reduce((a, b) => a + b, 0) / v.length, win: v.filter((p) => p > 0).length / v.length }));
  return order ? out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : out.sort((a, b) => b.n - a.n);
}

export function journalPatterns(views: TradeView[], days: { day: string; violations: number; followed?: string; grade?: string; mood?: string }[] = []): { lenses: Lens[]; findings: Finding[]; n: number } {
  const closed = views.filter((v) => !v.t.deleted && v.status === 'closed' && v.openedAt != null && v.closedAt != null).sort((a, b) => a.openedAt! - b.openedAt!);
  const p = (v: TradeView) => v.realized;
  const hour = (v: TradeView) => { const { h, m } = etParts(v.openedAt!); const t = h + m / 60; return t < 9.5 ? 'Pre-market' : t < 10 ? '9:30–10:00' : t < 11 ? '10–11' : t < 12 ? '11–12' : t < 14 ? '12–2 pm' : t < 16 ? '2–4 pm' : 'After hours'; };
  const hold = (v: TradeView) => { const mins = (v.closedAt! - v.openedAt!) / 60000; return mins < 5 ? 'Under 5 min' : mins < 30 ? '5–30 min' : mins < 120 ? '30 min–2 h' : etParts(v.openedAt!).day === etParts(v.closedAt!).day ? '2 h+ same day' : 'Overnight+'; };
  const notional = closed.map((v) => (v.avgEntry ?? 0) * v.maxQty).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (f: number) => notional[Math.floor(f * (notional.length - 1))] ?? 0;
  const size = (v: TradeView) => { const x = (v.avgEntry ?? 0) * v.maxQty; if (!x || notional.length < 8) return null; return x <= q(0.33) ? 'Smaller size' : x <= q(0.66) ? 'Middle size' : 'Larger size'; };
  // trade number within the day and what came right before
  const nth = new Map<string, number>(), prev = new Map<string, number | null>();
  const perDay = new Map<string, TradeView[]>();
  for (const v of closed) { const d = etParts(v.openedAt!).day; perDay.set(d, [...(perDay.get(d) ?? []), v]); }
  for (const vs of perDay.values()) vs.forEach((v, i) => nth.set(v.t.id, i + 1));
  closed.forEach((v, i) => prev.set(v.t.id, i ? closed[i - 1].realized : null));
  const dayInfo = new Map(days.map((d) => [d.day, d]));
  const lenses: Lens[] = [
    { id: 'hour', title: 'Time you entered (ET)', buckets: bucketize(closed, hour, p, ['Pre-market', '9:30–10:00', '10–11', '11–12', '12–2 pm', '2–4 pm', 'After hours']) },
    { id: 'wd', title: 'Weekday', buckets: bucketize(closed, (v) => etParts(v.openedAt!).wd, p, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) },
    { id: 'setup', title: 'Setup', buckets: bucketize(closed, (v) => (v.t as any).setup?.trim() || 'No setup tagged', p).slice(0, 8) },
    { id: 'hold', title: 'How long you held', buckets: bucketize(closed, hold, p, ['Under 5 min', '5–30 min', '30 min–2 h', '2 h+ same day', 'Overnight+']) },
    { id: 'size', title: 'Position size', buckets: bucketize(closed, size, p, ['Smaller size', 'Middle size', 'Larger size']) },
    { id: 'side', title: 'Long or short', buckets: bucketize(closed, (v) => ((v.t as any).side === 'short' ? 'Short' : 'Long'), p) },
    { id: 'nth', title: 'Trade number that day', buckets: bucketize(closed, (v) => { const k = nth.get(v.t.id) ?? 1; return k === 1 ? '1st trade' : k === 2 ? '2nd trade' : k <= 4 ? '3rd–4th' : '5th or later'; }, p, ['1st trade', '2nd trade', '3rd–4th', '5th or later']) },
    { id: 'after', title: 'Right after a…', buckets: bucketize(closed, (v) => { const x = prev.get(v.t.id); return x == null ? null : x > 0 ? 'Win' : x < 0 ? 'Loss' : null; }, p, ['Win', 'Loss']) },
    { id: 'rules', title: 'Days with broken rules', buckets: bucketize(closed, (v) => { const d = dayInfo.get(etParts(v.closedAt!).day); return d ? (d.violations > 0 ? 'Rules broken that day' : 'Clean day') : null; }, p, ['Clean day', 'Rules broken that day']) },
    { id: 'plan', title: 'Followed your plan (day notes)', buckets: bucketize(closed, (v) => { const f = dayInfo.get(etParts(v.closedAt!).day)?.followed; return f === 'yes' ? 'Followed' : f === 'no' ? 'Did not follow' : f === 'partly' ? 'Partly' : null; }, p, ['Followed', 'Partly', 'Did not follow']) },
    { id: 'mood', title: 'Mood that day (day notes)', buckets: bucketize(closed, (v) => dayInfo.get(etParts(v.closedAt!).day)?.mood ?? null, p) },
  ].filter((l) => l.buckets.length > 1);
  // findings: per lens, the best and worst bucket with enough trades, against the overall average
  const all = closed.length ? closed.reduce((a, v) => a + v.realized, 0) / closed.length : 0;
  const findings: Finding[] = [];
  for (const l of lenses) {
    const ok = l.buckets.filter((b) => b.n >= MIN_N); if (ok.length < 2) continue;
    const best = ok.reduce((a, b) => (b.avg > a.avg ? b : a)), worst = ok.reduce((a, b) => (b.avg < a.avg ? b : a));
    const spread = best.avg - worst.avg; if (spread <= 0) continue;
    const name = (b: Bucket) => `${l.title.toLowerCase().replace(/\(.*\)/, '').trim()}: ${b.key}`;
    if (worst.avg < 0) findings.push({ lens: l.id, tone: 'down', strength: spread * Math.sqrt(worst.n), text: `${worst.key} (${l.title.replace(/\s*\(.*\)/, '').toLowerCase()}) is where you lose most: ${worst.n} trades averaging ${money(worst.avg)}, ${Math.round(worst.win * 100)}% winners, vs ${money(all)} overall.` });
    if (best.avg > 0) findings.push({ lens: l.id, tone: 'up', strength: spread * Math.sqrt(best.n), text: `${best.key} (${l.title.replace(/\s*\(.*\)/, '').toLowerCase()}) works best: ${best.n} trades averaging ${money(best.avg)}, ${Math.round(best.win * 100)}% winners.` });
    void name;
  }
  findings.sort((a, b) => b.strength - a.strength);
  return { lenses, findings: findings.slice(0, 6), n: closed.length };
}
const money = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
