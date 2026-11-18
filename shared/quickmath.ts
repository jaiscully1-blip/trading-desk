// The maths behind the Learn quick-math calculators. Each returns labelled results; invalid input gives "—".
import type { CalcId } from './lessons.js';

export interface Out { label: string; value: string; main?: boolean; tone?: 'up' | 'down' }
const ok = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
const usd = (x: number) => (ok(x) ? `$${x.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: Math.abs(x) < 100 ? 2 : 0 })}` : '—');
const p = (x: number, d = 1) => (ok(x) ? `${x.toFixed(d)}%` : '—');
const n2 = (x: number, d = 2) => (ok(x) ? x.toFixed(d) : '—');
const DASH = '—';

export function calc(id: CalcId, v: Record<string, number>): Out[] {
  switch (id) {
    case 'size': { const riskUsd = (v.acct * v.risk) / 100, per = Math.abs(v.entry - v.stop), sh = per > 0 ? Math.floor(riskUsd / per) : NaN;
      return [{ label: 'Shares', value: ok(sh) ? sh.toLocaleString() : DASH, main: true }, { label: 'Risk', value: usd(riskUsd) }, { label: 'Position value', value: usd(sh * v.entry) }, { label: 'Share of account', value: p(((sh * v.entry) / v.acct) * 100) }]; }
    case 'rr': { const risk = v.entry - v.stop, r = risk !== 0 ? (v.target - v.entry) / risk : NaN;
      return [{ label: 'Reward : risk (R)', value: ok(r) ? `${r >= 0 ? '+' : ''}${n2(r)}R` : DASH, main: true, tone: r >= 0 ? 'up' : 'down' }, { label: 'Risk per share', value: usd(Math.abs(risk)) }, { label: 'Break-even win rate', value: r > 0 ? p(100 / (1 + r)) : DASH }]; }
    case 'breakeven': return [{ label: 'Win rate needed', value: v.rr > 0 ? p(100 / (1 + v.rr)) : DASH, main: true }];
    case 'expect': { const w = v.win / 100, e = w * v.avgWin - (1 - w) * v.avgLoss;
      return [{ label: 'Expectancy per trade', value: ok(e) ? `${e >= 0 ? '+' : ''}${n2(e)}R` : DASH, main: true, tone: e >= 0 ? 'up' : 'down' }, { label: 'Per 100 trades', value: ok(e) ? `${e >= 0 ? '+' : ''}${n2(e * 100, 0)}R` : DASH }]; }
    case 'dd': { const l = v.loss / 100, g = l < 1 ? (l / (1 - l)) * 100 : NaN; return [{ label: 'Gain needed to recover', value: p(g), main: true }]; }
    case 'atr': { const dist = v.atr * v.k, sh = dist > 0 ? Math.floor(v.riskUsd / dist) : NaN;
      return [{ label: 'Stop (long)', value: usd(v.entry - dist), main: true }, { label: 'Stop distance', value: usd(dist) }, { label: 'Shares', value: ok(sh) ? sh.toLocaleString() : DASH }]; }
    case 'em': { const m = v.price * (v.iv / 100) * Math.sqrt(v.days / 365), d1 = v.price * (v.iv / 100) / 16;
      return [{ label: `Expected move (${v.days} days)`, value: ok(m) ? `±${usd(m)}` : DASH, main: true }, { label: 'As %', value: p((m / v.price) * 100) }, { label: 'One-day move (IV ÷ 16)', value: ok(d1) ? `±${usd(d1)}` : DASH }, { label: 'Range', value: ok(m) ? `${usd(v.price - m)} – ${usd(v.price + m)}` : DASH }]; }
    case 'opt': { const put = v.put === 1, be = put ? v.strike - v.prem : v.strike + v.prem;
      return [{ label: `${put ? 'Put' : 'Call'} breakeven at expiry`, value: usd(be), main: true }, { label: 'Cost (max loss buying)', value: usd(v.prem * 100 * v.qty) }]; }
    case 'kelly': { const w = v.win / 100, k = v.rr > 0 ? (w - (1 - w) / v.rr) * 100 : NaN;
      return [{ label: 'Full Kelly', value: p(k), main: true, tone: k > 0 ? 'up' : 'down' }, { label: 'Half Kelly', value: p(k / 2) }, { label: 'Quarter Kelly', value: p(k / 4) }]; }
    case 'streak': { const q = 1 - v.win / 100, pr = q ** v.n * 100, longest = q > 0 && q < 1 ? Math.log(v.trades) / Math.log(1 / q) : NaN;
      return [{ label: `Chance a given run is ${v.n} losses`, value: p(pr, 2), main: true }, { label: `Typical longest losing streak in ${v.trades} trades`, value: ok(longest) ? `≈ ${n2(longest, 1)}` : DASH }]; }
    case 'compound': { const f = v.start * (1 + v.rate / 100) ** v.periods, dbl = v.rate > 0 ? 72 / v.rate : NaN;
      return [{ label: 'Ending value', value: usd(f), main: true }, { label: 'Total gain', value: p((f / v.start - 1) * 100, 0) }, { label: 'Periods to double (rule of 72)', value: ok(dbl) ? `≈ ${n2(dbl, 1)}` : DASH }]; }
    case 'avg': { const q = v.q1 + v.q2, a = q ? (v.q1 * v.p1 + v.q2 * v.p2) / q : NaN, pl = (v.now - a) * q;
      return [{ label: 'Average price', value: usd(a), main: true }, { label: 'Shares', value: ok(q) ? q.toLocaleString() : DASH }, { label: 'P&L at price now', value: usd(pl), tone: pl >= 0 ? 'up' : 'down' }, { label: '% from average', value: p(((v.now - a) / a) * 100, 2) }]; }
  }
}
