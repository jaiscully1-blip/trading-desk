// Fibonacci levels for today's session, anchored to yesterday's high and low (the range most traders watch at the open):
// only the three retracements stock traders watch most (38.2, 50, 61.8%; Jai's choice 2026-11-26: no 23.6 / 78.6 or
// extensions). Drawn only when the user turns Fib on. Pure functions (tested).

export interface FibLine { price: number; ratio: number; label: string; kind: 'retrace' | 'ext' }
const RETRACE = [0.382, 0.5, 0.618];

/** The key levels between yesterday's high and low. 0 and 1 (the high and low themselves) are drawn already as PDH / PDL. */
export function dayFibs(high: number, low: number): FibLine[] {
  if (!(high > low) || !Number.isFinite(high) || !Number.isFinite(low)) return [];
  const r = high - low, out: FibLine[] = [];
  // retracements measured down from the high (0.618 = 61.8% of the way from the high to the low)
  for (const f of RETRACE) out.push({ price: high - r * f, ratio: f, label: `Fib ${(f * 100).toFixed(1).replace(/\.0$/, '')}`, kind: 'retrace' });
  return out.sort((a, b) => b.price - a.price);
}

/** Yesterday's (the last finished session's) high and low from bars of any timeframe. time = exchange-local seconds or ms. */
export function priorDayHL(bars: { time: number; high: number; low: number }[]): { high: number; low: number; day: string } | null {
  if (bars.length < 2) return null;
  const key = (t: number) => new Date(t > 1e12 ? t : t * 1000).toISOString().slice(0, 10);
  const days = new Map<string, { high: number; low: number }>();
  for (const b of bars) { const k = key(b.time), d = days.get(k); if (!d) days.set(k, { high: b.high, low: b.low }); else { d.high = Math.max(d.high, b.high); d.low = Math.min(d.low, b.low); } }
  const ks = [...days.keys()].sort();
  if (ks.length < 2) return null;
  const k = ks[ks.length - 2]; // the session before the latest one (today's, or the last one shown)
  return { ...days.get(k)!, day: k };
}
