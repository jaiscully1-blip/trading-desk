// Risk calculator math (pure, tested). All money in dollars, percents as plain numbers (2 = 2%).

/** Shares to buy so that hitting the stop loses `riskPct`% of the account. Also capped by buying power. */
export function positionSize(account: number, riskPct: number, entry: number, stop: number, buyingPower = Infinity) {
  const perShare = Math.abs(entry - stop);
  const riskUsd = account * riskPct / 100;
  if (!(perShare > 0) || !(entry > 0)) return { shares: 0, riskUsd, perShare, cost: 0, cappedBy: null as null | 'buying power' };
  let shares = Math.floor(riskUsd / perShare);
  let cappedBy: null | 'buying power' = null;
  if (shares * entry > buyingPower) { shares = Math.floor(buyingPower / entry); cappedBy = 'buying power'; }
  return { shares, riskUsd: shares * perShare, perShare, cost: shares * entry, cappedBy };
}

/** Reward:risk and the price targets at 1R, 2R, 3R. */
export function rr(entry: number, stop: number, target: number) {
  const risk = Math.abs(entry - stop), dir = target >= entry ? 1 : -1;
  return { ratio: risk > 0 ? Math.abs(target - entry) / risk : NaN, targets: [1, 2, 3].map((k) => entry + dir * k * risk) };
}

/** Expectancy per trade in dollars and in R, and the win rate you need to break even at this payoff. */
export function expectancy(winPct: number, avgWin: number, avgLoss: number) {
  const p = winPct / 100, w = Math.abs(avgWin), l = Math.abs(avgLoss);
  return { perTrade: p * w - (1 - p) * l, perR: l > 0 ? (p * w - (1 - p) * l) / l : NaN, breakevenWinPct: w + l > 0 ? (l / (w + l)) * 100 : NaN, payoff: l > 0 ? w / l : NaN };
}

/** Kelly fraction of the account to risk (full and half Kelly). Negative means no edge. */
export function kelly(winPct: number, payoff: number) {
  const p = winPct / 100, f = payoff > 0 ? p - (1 - p) / payoff : NaN;
  return { full: f * 100, half: (f * 100) / 2 };
}

/** Gain needed to get back to even after a drawdown. */
export const recoverPct = (drawdownPct: number) => (drawdownPct >= 100 ? Infinity : (1 / (1 - drawdownPct / 100) - 1) * 100);

/** Losing streak odds: chance of at least one run of `k` losses in `n` trades at win rate p (dynamic programming). */
export function streakOdds(winPct: number, k: number, n: number): number {
  const q = 1 - winPct / 100;
  if (k <= 0) return 1;
  // state = current run of losses (0..k-1); absorbed once it reaches k
  let st = Array(k).fill(0); st[0] = 1;
  let hit = 0;
  for (let i = 0; i < n; i++) {
    const nx = Array(k).fill(0);
    for (let r = 0; r < k; r++) {
      nx[0] += st[r] * (1 - q);
      if (r + 1 === k) hit += st[r] * q; else nx[r + 1] += st[r] * q;
    }
    st = nx;
  }
  return hit * 100;
}

/** Calculator keypad: + - * / % and parentheses, no eval(). Returns NaN on bad input. */
export function calc(expr: string): number {
  const toks = expr.replace(/×/g, '*').replace(/÷/g, '/').match(/\d*\.?\d+(?:e[+-]?\d+)?|[-+*/%()]/gi);
  if (!toks || toks.join('') !== expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '')) return NaN;
  let i = 0;
  const peek = () => toks[i], eat = () => toks[i++];
  const factor = (): number => {
    const t = eat();
    if (t === '-') return -factor();
    if (t === '+') return factor();
    if (t === '(') { const v = expr2(); if (eat() !== ')') return NaN; return pct(v); }
    const v = Number(t);
    return pct(v);
  };
  const pct = (v: number) => { if (peek() === '%') { eat(); return v / 100; } return v; };
  const term = (): number => { let v = factor(); while (peek() === '*' || peek() === '/') { const o = eat(); const r = factor(); v = o === '*' ? v * r : v / r; } return v; };
  const expr2 = (): number => { let v = term(); while (peek() === '+' || peek() === '-') { const o = eat(); const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const v = expr2();
  return i === toks.length ? v : NaN;
}
