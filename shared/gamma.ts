// Dealer gamma exposure (GEX) and the implied-volatility surface from Cboe's free delayed option chains
// (cdn.cboe.com/api/global/delayed_quotes/options/<SYM>.json, ~15 min delayed).
//
// Convention (the common "SqueezeMetrics-style" estimate): dealers are assumed long the calls and short the puts that
// customers trade, so call open interest adds positive gamma and put open interest negative gamma.
// GEX per contract = gamma × open interest × 100 × spot² × 1% = dollars of hedging per 1% move.
// It is an estimate: nobody outside the dealers knows their real positions.

export interface Contract { exp: string; dte: number; T: number; K: number; cp: 'C' | 'P'; iv: number; oi: number; vol: number }
export interface Chain { sym: string; spot: number; asOf: number | null; contracts: Contract[] }

const OSI = /^([A-Z^_.]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
const DAY = 86400_000;

/** ms of the 16:00 ET close on a YYYY-MM-DD date (DST-correct). */
export function closeMs(y: number, m: number, d: number): number {
  const want = Date.UTC(y, m - 1, d, 16, 0);
  let g = want;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(g)).map((x) => [x.type, x.value]));
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    g += want - wall;
  }
  return g;
}

/** Cboe chain JSON -> contracts with open interest and a usable IV. */
export function parseCboe(j: any, sym: string, now = Date.now()): Chain {
  const d = j?.data ?? {};
  const spot = Number(d.current_price ?? d.close);
  const ts = typeof j?.timestamp === 'string' ? Date.parse(j.timestamp.replace(' ', 'T') + 'Z') : NaN;
  const contracts: Contract[] = [];
  for (const o of Array.isArray(d.options) ? d.options : []) {
    const m = OSI.exec(String(o?.option ?? ''));
    if (!m) continue;
    const y = 2000 + +m[2], mo = +m[3], da = +m[4];
    const close = closeMs(y, mo, da);
    if (close < now - 60_000) continue; // expired
    const iv = Number(o.iv), oi = Number(o.open_interest) || 0;
    contracts.push({
      exp: `${y}-${m[3]}-${m[4]}`, dte: Math.max(0, Math.round((close - now) / DAY)), T: Math.max(close - now, 30 * 60_000) / (365 * DAY),
      K: +m[6] / 1000, cp: m[5] as 'C' | 'P', iv: Number.isFinite(iv) ? iv : 0, oi, vol: Number(o.volume) || 0,
    });
  }
  return { sym, spot, asOf: Number.isFinite(ts) ? ts : null, contracts };
}

const npdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
/** Black-Scholes gamma (no rates or dividends: their effect on gamma is tiny at these horizons). */
export function bsGamma(S: number, K: number, iv: number, T: number): number {
  if (!(S > 0 && K > 0 && iv > 0 && T > 0)) return 0;
  const sd = iv * Math.sqrt(T);
  const d1 = (Math.log(S / K) + 0.5 * iv * iv * T) / sd;
  return npdf(d1) / (S * sd);
}
const usable = (c: Contract) => c.oi > 0 && c.iv >= 0.01 && c.iv <= 2;
/** dollars of dealer hedging per 1% move, signed (+ calls, − puts) */
export const gexOf = (c: Contract, S: number) => (c.cp === 'C' ? 1 : -1) * bsGamma(S, c.K, c.iv, c.T) * c.oi * 100 * S * S * 0.01;

export interface StrikeGex { K: number; call: number; put: number; net: number }
export interface GammaRead {
  spot: number; total: number; strikes: StrikeGex[];
  callWall: number | null; putWall: number | null; flip: number | null;
  profile: [number, number][]; maxDte: number; expiries: string[];
  regime: 'positive' | 'negative';
}

/**
 * GEX by strike for expirations within maxDte days, walls, and the zero-gamma flip
 * (the price where total GEX changes sign, found by re-pricing every contract across ±10% of spot).
 */
export function gammaRead(ch: Chain, maxDte = 45, band = 0.12): GammaRead {
  const S = ch.spot;
  const cs = ch.contracts.filter((c) => c.dte <= maxDte && usable(c));
  const by = new Map<number, StrikeGex>();
  for (const c of cs) {
    const g = gexOf(c, S);
    const r = by.get(c.K) ?? { K: c.K, call: 0, put: 0, net: 0 };
    if (c.cp === 'C') r.call += g; else r.put += g;
    r.net += g;
    by.set(c.K, r);
  }
  const strikes = [...by.values()].filter((r) => Math.abs(r.K / S - 1) <= band).sort((a, b) => a.K - b.K);
  const total = [...by.values()].reduce((a, r) => a + r.net, 0);
  const callWall = strikes.length ? strikes.reduce((a, b) => (b.call > a.call ? b : a)).K : null;
  const putWall = strikes.length ? strikes.reduce((a, b) => (b.put < a.put ? b : a)).K : null;

  // profile: total GEX if spot were s
  const profile: [number, number][] = [];
  for (let k = -40; k <= 40; k++) {
    const s = S * (1 + k * 0.0025);
    let t = 0;
    for (const c of cs) t += gexOf(c, s);
    profile.push([s, t]);
  }
  let flip: number | null = null, best = Infinity;
  for (let i = 1; i < profile.length; i++) {
    const [s0, g0] = profile[i - 1], [s1, g1] = profile[i];
    if ((g0 <= 0 && g1 > 0) || (g0 >= 0 && g1 < 0)) {
      const x = s0 + ((s1 - s0) * -g0) / (g1 - g0 || 1);
      if (Math.abs(x - S) < best && Math.abs(x / S - 1) <= 0.08) { best = Math.abs(x - S); flip = x; }
    }
  }
  return { spot: S, total, strikes, callWall, putWall, flip, profile, maxDte, expiries: [...new Set(cs.map((c) => c.exp))].sort(), regime: total >= 0 ? 'positive' : 'negative' };
}

export const MONEYNESS = [0.85, 0.9, 0.925, 0.95, 0.975, 1, 1.025, 1.05, 1.075, 1.1, 1.15];
export interface IvRow { exp: string; dte: number; atm: number | null; iv: (number | null)[]; skew: number | null }

/**
 * IV surface: for each expiry (up to `maxExp`, within `maxDte`), the out-of-the-money option's IV nearest each moneyness
 * (puts below spot, calls at and above). skew = IV at 95% minus IV at 105%, in vol points.
 */
export function ivSurface(ch: Chain, maxExp = 10, maxDte = 200): IvRow[] {
  const S = ch.spot;
  const exps = [...new Set(ch.contracts.filter((c) => c.dte <= maxDte).map((c) => c.exp))].sort().slice(0, maxExp);
  return exps.map((exp) => {
    const cs = ch.contracts.filter((c) => c.exp === exp && c.iv >= 0.01 && c.iv <= 2);
    const pickAt = (m: number) => {
      const side = m < 1 ? 'P' : 'C';
      const pool = cs.filter((c) => c.cp === side);
      if (!pool.length) return null;
      const target = S * m;
      const c = pool.reduce((a, b) => (Math.abs(b.K - target) < Math.abs(a.K - target) ? b : a));
      return Math.abs(c.K / target - 1) <= 0.0125 ? c.iv * 100 : null;
    };
    const iv = MONEYNESS.map(pickAt);
    const at = (m: number) => iv[MONEYNESS.indexOf(m)];
    const lo = at(0.95), hi = at(1.05);
    return { exp, dte: cs[0]?.dte ?? 0, atm: at(1), iv, skew: lo != null && hi != null ? lo - hi : null };
  }).filter((r) => r.iv.some((x) => x != null));
}

/** Put/call open interest and volume across the whole chain. */
export function pcRatios(ch: Chain) {
  let coi = 0, poi = 0, cv = 0, pv = 0;
  for (const c of ch.contracts) { if (c.cp === 'C') { coi += c.oi; cv += c.vol; } else { poi += c.oi; pv += c.vol; } }
  return { oi: coi ? poi / coi : null, vol: cv ? pv / cv : null };
}
