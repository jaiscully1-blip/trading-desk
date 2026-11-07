// Black-Scholes pricing and Greeks for the options calculator widget (European, no dividends). Pure + tested.
export type OptType = 'call' | 'put';
export interface BsInput { type: OptType; S: number; K: number; days: number; iv: number; r: number }
export interface BsOut { price: number; delta: number; gamma: number; thetaDay: number; vega: number; itmProb: number }

/** Standard normal CDF (Abramowitz-Stegun 26.2.17, error < 7.5e-8). */
export function ncdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}
const npdf = (x: number) => 0.3989422804014327 * Math.exp(-x * x / 2);

/** iv and r as decimals (0.45 = 45%). At or past expiry returns intrinsic value. */
export function bs({ type, S, K, days, iv, r }: BsInput): BsOut {
  const T = Math.max(0, days) / 365;
  if (T === 0 || iv <= 0) {
    const intrinsic = Math.max(0, type === 'call' ? S - K : K - S);
    return { price: intrinsic, delta: intrinsic > 0 ? (type === 'call' ? 1 : -1) : 0, gamma: 0, thetaDay: 0, vega: 0, itmProb: intrinsic > 0 ? 1 : 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + iv * iv / 2) * T) / (iv * sq), d2 = d1 - iv * sq;
  const disc = Math.exp(-r * T);
  const price = type === 'call' ? S * ncdf(d1) - K * disc * ncdf(d2) : K * disc * ncdf(-d2) - S * ncdf(-d1);
  const delta = type === 'call' ? ncdf(d1) : ncdf(d1) - 1;
  const gamma = npdf(d1) / (S * iv * sq);
  const theta = -(S * npdf(d1) * iv) / (2 * sq) - (type === 'call' ? r * K * disc * ncdf(d2) : -r * K * disc * ncdf(-d2));
  return { price, delta, gamma, thetaDay: theta / 365, vega: (S * npdf(d1) * sq) / 100, itmProb: type === 'call' ? ncdf(d2) : ncdf(-d2) };
}

/** Profit/loss per contract (100 shares) at expiry for a long option bought at `premium`. */
export const plAtExpiry = (type: OptType, K: number, premium: number, S: number) => (Math.max(0, type === 'call' ? S - K : K - S) - premium) * 100;
export const breakeven = (type: OptType, K: number, premium: number) => (type === 'call' ? K + premium : K - premium);
