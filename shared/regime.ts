// Regime badge: one line for what kind of market this is, from data the desk already has.
// Trend = SPY against its 50 and 200-day averages (daily closes). Gamma = sign of dealer gamma from the Cboe chain (estimate).
// Rule-based labels, not a forecast.
export interface RegimeIn { close: number | null; sma50: number | null; sma200: number | null; gamma: 'positive' | 'negative' | null; flip: number | null }
export interface RegimeRead { label: string; tone: 'up' | 'down' | 'warn'; trend: 'up' | 'down' | 'mixed'; gamma: 'positive' | 'negative' | null; parts: string[] }

export function regimeRead(i: RegimeIn): RegimeRead | null {
  const { close, sma50, sma200 } = i;
  if (close == null || sma50 == null) return null;
  const trend: RegimeRead['trend'] = sma200 != null
    ? (close > sma50 && sma50 > sma200 ? 'up' : close < sma50 && sma50 < sma200 ? 'down' : 'mixed')
    : close > sma50 ? 'up' : 'down';
  const g = i.gamma;
  const label = trend === 'up' ? (g === 'negative' ? 'Uptrend, jumpy' : 'Calm uptrend')
    : trend === 'down' ? (g === 'negative' ? 'Risk-off, fast' : 'Downtrend, grinding')
    : g === 'negative' ? 'Choppy, jumpy' : 'Choppy';
  const parts = [
    `SPY ${close >= sma50 ? 'above' : 'below'} its 50-day average (${sma50.toFixed(2)})`,
    ...(sma200 != null ? [`${sma50 >= sma200 ? '50-day above' : '50-day below'} the 200-day (${sma200.toFixed(2)})`] : []),
    g ? `Dealer gamma ${g === 'positive' ? 'positive: moves tend to be damped' : 'negative: moves tend to speed up'}${i.flip != null ? `; flip near ${i.flip.toFixed(1)}` : ''}` : 'Gamma not available',
  ];
  return { label, tone: trend === 'up' ? (g === 'negative' ? 'warn' : 'up') : trend === 'down' ? 'down' : 'warn', trend, gamma: g, parts };
}
