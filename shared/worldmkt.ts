// World markets: index and futures quotes, FX pairs and currency strength, trading halts (Nasdaq Trader), and index movers
// (how many index points each big stock added or took away today). Pure functions (tested); fetching lives in /api.

export interface Inst { sym: string; label: string; region?: string }
export const WORLD_INDICES: Inst[] = [
  { sym: '^GSPC', label: 'S&P 500', region: 'Americas' }, { sym: '^IXIC', label: 'Nasdaq Composite', region: 'Americas' }, { sym: '^DJI', label: 'Dow Jones', region: 'Americas' },
  { sym: '^RUT', label: 'Russell 2000', region: 'Americas' }, { sym: '^GSPTSE', label: 'Toronto TSX', region: 'Americas' }, { sym: '^BVSP', label: 'Brazil Bovespa', region: 'Americas' }, { sym: '^MXX', label: 'Mexico IPC', region: 'Americas' },
  { sym: '^FTSE', label: 'FTSE 100', region: 'Europe' }, { sym: '^GDAXI', label: 'DAX', region: 'Europe' }, { sym: '^FCHI', label: 'CAC 40', region: 'Europe' }, { sym: '^STOXX50E', label: 'Euro Stoxx 50', region: 'Europe' },
  { sym: '^N225', label: 'Nikkei 225', region: 'Asia' }, { sym: '^HSI', label: 'Hang Seng', region: 'Asia' }, { sym: '000001.SS', label: 'Shanghai', region: 'Asia' }, { sym: '^KS11', label: 'KOSPI', region: 'Asia' },
  { sym: '^TWII', label: 'Taiwan', region: 'Asia' }, { sym: '^BSESN', label: 'India Sensex', region: 'Asia' }, { sym: '^AXJO', label: 'ASX 200', region: 'Asia' },
];
export const FUTURES: Inst[] = [
  { sym: 'ES=F', label: 'S&P 500 (ES)' }, { sym: 'NQ=F', label: 'Nasdaq-100 (NQ)' }, { sym: 'YM=F', label: 'Dow (YM)' }, { sym: 'RTY=F', label: 'Russell (RTY)' },
  { sym: 'ZN=F', label: '10-year note (ZN)' }, { sym: 'ZB=F', label: '30-year bond (ZB)' }, { sym: 'CL=F', label: 'Crude oil (CL)' }, { sym: 'NG=F', label: 'Natural gas (NG)' },
  { sym: 'GC=F', label: 'Gold (GC)' }, { sym: 'SI=F', label: 'Silver (SI)' }, { sym: 'HG=F', label: 'Copper (HG)' }, { sym: 'DX-Y.NYB', label: 'Dollar index (DXY)' }, { sym: 'BTC=F', label: 'Bitcoin (CME)' },
];
export const FX_PAIRS: Inst[] = [
  { sym: 'EURUSD=X', label: 'EUR/USD' }, { sym: 'USDJPY=X', label: 'USD/JPY' }, { sym: 'GBPUSD=X', label: 'GBP/USD' }, { sym: 'USDCHF=X', label: 'USD/CHF' },
  { sym: 'AUDUSD=X', label: 'AUD/USD' }, { sym: 'USDCAD=X', label: 'USD/CAD' }, { sym: 'NZDUSD=X', label: 'NZD/USD' }, { sym: 'USDCNY=X', label: 'USD/CNY' },
  { sym: 'USDMXN=X', label: 'USD/MXN' }, { sym: 'USDINR=X', label: 'USD/INR' }, { sym: 'EURJPY=X', label: 'EUR/JPY' }, { sym: 'EURGBP=X', label: 'EUR/GBP' },
];

export interface Px { sym: string; last: number; prev: number; chgPct: number; spark: number[]; at: number | null }
/** Yahoo spark (v7 {spark:{result}} or v8 keyed) -> last, previous close, % change and the intraday closes. */
export function parseSparkPx(j: any): Record<string, Px> {
  const out: Record<string, Px> = {};
  const add = (sym: string, meta: any, closes: unknown, ts: unknown) => {
    const c = (Array.isArray(closes) ? closes : []).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    const last = Number(meta?.regularMarketPrice ?? c[c.length - 1]);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!sym || !(last > 0) || !(prev > 0)) return;
    const t = Array.isArray(ts) && ts.length ? Number(ts[ts.length - 1]) * 1000 : Number(meta?.regularMarketTime) * 1000;
    out[sym] = { sym, last, prev, chgPct: (last / prev - 1) * 100, spark: c.slice(-80), at: Number.isFinite(t) ? t : null };
  };
  for (const r of j?.spark?.result ?? []) add(r.symbol, r.response?.[0]?.meta, r.response?.[0]?.indicators?.quote?.[0]?.close, r.response?.[0]?.timestamp);
  if (!j?.spark) for (const [k, v] of Object.entries<any>(j ?? {})) if (v && typeof v === 'object') add(v.symbol ?? k, v, v.close, v.timestamp);
  return out;
}

/** Frankfurter (ECB reference rates, daily) -> the same shape, as a fallback for FX when Yahoo is unavailable. */
export function fxFromFrankfurter(latest: any, prior: any): Record<string, Px> {
  const out: Record<string, Px> = {};
  const r1 = latest?.rates ?? {}, r0 = prior?.rates ?? {};
  for (const p of FX_PAIRS) {
    const m = /^([A-Z]{3})([A-Z]{3})=X$/.exec(p.sym);
    if (!m) continue;
    const val = (r: Record<string, number>, a: string, b: string) => { const ua = a === 'USD' ? 1 : r[a], ub = b === 'USD' ? 1 : r[b]; return ua && ub ? ub / ua : NaN; }; // rates are per 1 USD
    const last = val(r1, m[1], m[2]), prev = val(r0, m[1], m[2]);
    if (last > 0 && prev > 0) out[p.sym] = { sym: p.sym, last, prev, chgPct: (last / prev - 1) * 100, spark: [], at: Date.parse(`${latest.date}T16:00:00Z`) || null };
  }
  return out;
}

/** Currency strength: each currency's average % move against the others in the pairs given (USD vs EUR, JPY, GBP…). */
export function currencyStrength(px: Record<string, Px>): { ccy: string; score: number; n: number }[] {
  const acc = new Map<string, { s: number; n: number }>();
  const bump = (c: string, v: number) => { const a = acc.get(c) ?? { s: 0, n: 0 }; a.s += v; a.n++; acc.set(c, a); };
  for (const p of Object.values(px)) {
    const m = /^([A-Z]{3})([A-Z]{3})=X$/.exec(p.sym);
    if (!m || !Number.isFinite(p.chgPct)) continue;
    bump(m[1], p.chgPct); bump(m[2], -p.chgPct); // base up = quote down
  }
  return [...acc.entries()].map(([ccy, a]) => ({ ccy, score: a.s / a.n, n: a.n })).sort((a, b) => b.score - a.score);
}

/* ---------------- trading halts (nasdaqtrader.com RSS) ---------------- */
export const HALT_REASON: Record<string, string> = {
  T1: 'News pending', T2: 'News released', T3: 'News and resumption times', T5: 'Single-stock trading pause', T6: 'Extraordinary market activity',
  T7: 'Quotation-only period', T8: 'Exchange-traded fund issue', T12: 'More information requested by Nasdaq', H4: 'Not meeting listing requirements', H9: 'Not current in filings',
  H10: 'SEC trading suspension', H11: 'Regulatory concern', O1: 'Operations halt', IPO1: 'IPO not yet trading', M1: 'Corporate action', M2: 'Quotation not available',
  LUDP: 'Volatility pause (limit up / limit down)', LUDS: 'Volatility pause, straddle state', MWC1: 'Market-wide circuit breaker level 1', MWC2: 'Market-wide circuit breaker level 2', MWC3: 'Market-wide circuit breaker level 3',
  MWC0: 'Market-wide circuit breaker carried over', D: 'Security deleted', R4: 'Qualifications issues reviewed', R9: 'Filing requirements satisfied', C3: 'Issuer news not forthcoming', C4: 'Qualifications halt ended', C9: 'Qualifications halt concluded', C11: 'Trade halt concluded by other regulator',
};
export interface Halt { sym: string; name: string; market: string; code: string; reason: string; haltedAt: number | null; resumedAt: number | null; pausePrice: number | null }
const tag = (b: string, t: string) => (new RegExp(`<ndaq:${t}>([^<]*)</ndaq:${t}>`, 'i').exec(b)?.[1] ?? '').trim();
/** "11/11/2026" + "19:50:00.000" (Eastern time) -> ms. etToUtc is passed in so this stays DST-correct. */
const etMs = (d: string, t: string, etToUtc: (y: number, mo: number, d: number, h: number, mi: number) => number) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d), h = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  return m && h ? etToUtc(+m[3], +m[1], +m[2], +h[1], +h[2]) + (+(h[3] ?? 0)) * 1000 : null;
};
export function parseHalts(xml: string, etToUtc: (y: number, mo: number, d: number, h: number, mi: number) => number): Halt[] {
  const out: Halt[] = [];
  for (const b of xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
    const sym = tag(b, 'IssueSymbol');
    if (!sym) continue;
    const code = tag(b, 'ReasonCode');
    const pp = Number(tag(b, 'PauseThresholdPrice'));
    out.push({
      sym, name: tag(b, 'IssueName'), market: tag(b, 'Market'), code, reason: HALT_REASON[code] ?? code,
      haltedAt: etMs(tag(b, 'HaltDate'), tag(b, 'HaltTime'), etToUtc),
      resumedAt: tag(b, 'ResumptionTradeTime') ? etMs(tag(b, 'ResumptionDate'), tag(b, 'ResumptionTradeTime'), etToUtc) : null,
      pausePrice: pp > 0 ? pp : null,
    });
  }
  return out.sort((a, b) => (b.haltedAt ?? 0) - (a.haltedAt ?? 0));
}

/* ---------------- index movers ---------------- */
export interface Mover { sym: string; name: string; weight: number; chgPct: number; contrib: number }
/** Cap-weighted approximation: weight = market cap ÷ total cap of the members priced; contribution = weight × % change
 *  (in percentage points of the index). The real indexes adjust for free float (and the Nasdaq-100 caps big weights), so it is close, not exact. */
export function indexMovers(members: { sym: string; name: string }[], snap: Record<string, { c: number; mc: number | null }>) {
  // share classes of one company (GOOGL / GOOG, BRK.B…) come back with the same company-wide market cap: count it once
  const seenCap = new Set<string>();
  const key = (x: { name: string; s: { mc: number | null } }) => `${x.s.mc}|${x.name.toLowerCase().split(/[\s,.(]/)[0]}`;
  const rows = members.map((m) => ({ ...m, s: snap[m.sym] })).filter((x) => x.s && x.s.mc && Number.isFinite(x.s.c) && !seenCap.has(key(x)) && seenCap.add(key(x)));
  const tot = rows.reduce((a, x) => a + (x.s.mc ?? 0), 0);
  if (!tot) return { up: [] as Mover[], down: [] as Mover[], total: null as number | null, covered: 0 };
  const all: Mover[] = rows.map((x) => { const w = (x.s.mc ?? 0) / tot; return { sym: x.sym, name: x.name, weight: w, chgPct: x.s.c, contrib: w * x.s.c }; });
  const total = all.reduce((a, x) => a + x.contrib, 0);
  return { up: [...all].filter((x) => x.contrib > 0).sort((a, b) => b.contrib - a.contrib).slice(0, 12), down: [...all].filter((x) => x.contrib < 0).sort((a, b) => a.contrib - b.contrib).slice(0, 12), total, covered: rows.length };
}
/** Nasdaq's public Nasdaq-100 list -> members. */
export function parseNdxList(j: any): { sym: string; name: string }[] {
  return (j?.data?.data?.rows ?? []).map((r: any) => ({ sym: String(r?.symbol ?? '').toUpperCase().replace('/', '.'), name: String(r?.companyName ?? '') })).filter((r: { sym: string }) => /^[A-Z][A-Z.]{0,6}$/.test(r.sym));
}
