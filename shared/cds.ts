// CDS tape from DTCC's public swap dissemination (pddata.dtcc.com): single-name CDS (SEC side, security-based swaps)
// and index CDS (CFTC side: CDX, iTraxx, CMBX). Anonymous: no counterparties, and sizes above a cap show as "5,000,000+".
// Spreads: taken from the trade's own quoted spread when DTCC shows one; otherwise backed out of the upfront payment with
// a simple flat-hazard CDS model (40% recovery, 4% discount rate). That is an estimate, and when the upfront could have
// been paid either way (DTCC doesn't say who paid) the estimate is marked ambiguous.

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [h, ...body] = rows;
  return (h ? body.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))) : []);
}

export interface CdsTrade { id: string; t: number; name: string; ref: string; kind: 'single' | 'sov' | 'index' | 'other'; years: number; maturity: string; couponBp: number | null; notional: number | null; capped: boolean; upfrontPct: number | null; spreadBp: number | null; spreadSrc: 'quoted' | 'implied' | 'ambiguous' | null; altBp?: number; cleared: boolean; platform: string }

/** Risky annuity (PV of 1bp running per year of notional, quarterly) for a flat spread. */
export function rpv01(spreadBp: number, years: number, r = 0.04, rec = 0.4): number {
  const lam = spreadBp / 1e4 / (1 - rec); let s = 0;
  for (let t = 0.25; t <= years + 1e-9; t += 0.25) s += 0.25 * Math.exp(-(r + lam) * t);
  return s;
}
/** Spread (bp) where (S − C) × RPV01(S) = upfront; side +1 = buyer pays (S above coupon), −1 = seller pays (S below). */
export function impliedSpread(upfrontPct: number, couponBp: number, years: number, side: 1 | -1): number | null {
  const target = (side * upfrontPct) / 100;
  let lo = side > 0 ? couponBp : 0, hi = side > 0 ? 5000 : couponBp;
  const f = (s: number) => ((s - couponBp) / 1e4) * rpv01(s, years) - target;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
  return Math.round(((lo + hi) / 2) * 10) / 10;
}

/** bond descriptions and placeholders DTCC sometimes puts in the name field */
const NOISE = /^(no name obtainable|basket|bond)?$|\b(BD|BDS|BOND|NT|NTS|NOTES?|DEBS?|TRANCHE|REGS|144A|TREASURY BILL|DTD|GTD)\b|\d+[,.]\d+/i;
/** these indexes trade on price (e.g. 104.9), and DTCC puts the price in the spread field */
const PRICE_QUOTED = /^CDX\.(NA\.HY|EM)/;
const num = (s: string) => { const n = Number(String(s).replace(/[,+]/g, '')); return Number.isFinite(n) && s !== '' ? n : null; };

/** DTCC cumulative rows -> live trades (corrections replace, errors/cancels remove). */
export function cdsTrades(rows: Record<string, string>[]): CdsTrade[] {
  const live = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const key = r['Original Dissemination Identifier'] || r['Dissemination Identifier'];
    if (/^(EROR|TERM)$/.test(r['Action type'])) { live.delete(key); continue; }
    live.set(key, r);
  }
  const out: CdsTrade[] = [];
  for (const r of live.values()) {
    const fisn = r['UPI FISN'] ?? '', name = (r['UPI Underlier Name'] ?? '').trim();
    const kind: CdsTrade['kind'] = /Idx/.test(fisn) ? 'index' : /Sov/.test(fisn) ? 'sov' : /CDS Corp SN/.test(fisn) ? 'single' : 'other';
    if (kind === 'other' || /Swt|Tra/.test(fisn)) continue; // swaptions, tranches, baskets: skip
    const t = Date.parse(r['Execution Timestamp']); const mat = r['Expiration Date'] ?? '';
    const years = Math.max(0.25, (Date.parse(mat) - t) / (365.25 * 86400_000));
    const nRaw = r['Notional amount-Leg 1'] ?? '', notional = num(nRaw), coupon = num(r['Fixed rate-Leg 1']), upfront = num(r['Other payment amount']);
    const upPct = upfront != null && notional ? (upfront / notional) * 100 : null;
    const quoted = num(r['Spread-Leg 1']);
    let spreadBp: number | null = null, spreadSrc: CdsTrade['spreadSrc'] = null, altBp: number | undefined;
    if (quoted != null && PRICE_QUOTED.test(name) && coupon != null && quoted * 1e4 > 50 && quoted * 1e4 < 150) {
      const px = quoted * 1e4, up = 100 - px; // price above 100: the protection seller pays upfront
      spreadBp = impliedSpread(Math.abs(up), coupon * 1e4, years, up >= 0 ? 1 : -1); spreadSrc = spreadBp != null ? 'quoted' : null;
    } else if (quoted != null && quoted > 0 && quoted < 0.5) { spreadBp = Math.round(quoted * 1e5) / 10; spreadSrc = 'quoted'; }
    else if (upPct != null && coupon != null && r['Other payment type'] === 'UFRO') {
      const c = coupon * 1e4, up = impliedSpread(upPct, c, years, 1), dn = impliedSpread(upPct, c, years, -1);
      if (up != null && dn == null) { spreadBp = up; spreadSrc = 'implied'; }
      else if (up != null && dn != null) { spreadBp = up; altBp = dn; spreadSrc = 'ambiguous'; }
    }
    out.push({ id: r['Dissemination Identifier'], t, name: !name || NOISE.test(name) ? '' : name, ref: r['Underlier ID-Leg 1'] ?? '', kind, years: Math.round(years * 10) / 10, maturity: mat, couponBp: coupon != null ? Math.round(coupon * 1e4) : null, notional, capped: /\+$/.test(nRaw), upfrontPct: upPct != null ? Math.round(upPct * 100) / 100 : null, spreadBp, spreadSrc, altBp, cleared: r['Cleared'] === 'Y' || r['Cleared'] === 'I', platform: r['Platform identifier'] ?? '' });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** For ambiguous trades, pick whichever reading is closer to the same name's quoted spreads that day. */
export function resolveAmbiguous(ts: CdsTrade[]): CdsTrade[] {
  const q = new Map<string, number[]>();
  for (const t of ts) if (t.spreadSrc === 'quoted' && t.name) (q.get(t.name) ?? q.set(t.name, []).get(t.name)!).push(t.spreadBp!);
  return ts.map((t) => {
    if (t.spreadSrc !== 'ambiguous' || t.altBp == null) return t;
    const ref = q.get(t.name); if (!ref?.length) return t;
    const med = [...ref].sort((a, b) => a - b)[Math.floor(ref.length / 2)];
    const pick = Math.abs(t.altBp - med) < Math.abs(t.spreadBp! - med) ? t.altBp : t.spreadBp!;
    return { ...t, spreadBp: pick, altBp: pick === t.altBp ? t.spreadBp! : t.altBp, spreadSrc: 'implied' };
  });
}

export interface NameSum { name: string; kind: CdsTrade['kind']; n: number; capped: number; last5y: number | null; last5ySrc: CdsTrade['spreadSrc']; lastT: number; first5y: number | null }
/** Per name: trade count and the 5-year spread (the 4.5–5.5y trades), first vs last in the window. */
export function summarize(ts: CdsTrade[]): NameSum[] {
  const by = new Map<string, CdsTrade[]>();
  for (const t of ts) if (t.name) (by.get(t.name) ?? by.set(t.name, []).get(t.name)!).push(t);
  return [...by.entries()].map(([name, xs]) => {
    const five = xs.filter((x) => x.years >= 4.4 && x.years <= 5.6 && x.spreadBp != null && x.spreadSrc !== 'ambiguous');
    return { name, kind: xs[0].kind, n: xs.length, capped: xs.filter((x) => x.capped).length, last5y: five.at(-1)?.spreadBp ?? null, last5ySrc: five.at(-1)?.spreadSrc ?? null, first5y: five[0]?.spreadBp ?? null, lastT: xs.at(-1)!.t };
  }).sort((a, b) => b.n - a.n);
}
