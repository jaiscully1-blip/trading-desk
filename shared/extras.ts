// Parsers for the free sources added in Nov 2026: earningsapi.com (earnings actuals and reactions), Trade Time (world
// exchange hours), Zillow Research CSVs (housing), mempool.space (bitcoin network), Dataroma (superinvestor 13F updates),
// and the full-market high short interest list (FINRA + SEC shares outstanding). Pure functions (tested).
import type { EarnItem } from './eventsCal.js';
import type { FeedItem } from './feed.js';

const num = (v: unknown) => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? null : n; };

/* ---------------- earningsapi.com ---------------- */
/** /v2/calendar/earnings?date= -> rows in the desk's earnings shape (pre = before open, after = after close). */
export function parseEarningsApiCal(j: any, date: string): EarnItem[] {
  const out: EarnItem[] = [];
  const add = (rows: any, when: EarnItem['when']) => {
    for (const r of Array.isArray(rows) ? rows : []) {
      const sym = String(r?.symbol ?? '').toUpperCase();
      if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) continue;
      out.push({ date: String(j?.date ?? date), sym, name: String(r?.name ?? ''), when, quarter: '', epsEst: num(r?.epsEstimate), epsAct: num(r?.eps), revEst: num(r?.revenueEstimate), revAct: num(r?.revenue), nEsts: null, mcap: null, epsLastYear: null, source: 'Earnings API' });
    }
  };
  add(j?.pre, 'bmo'); add(j?.after, 'amc'); add(j?.notSupplied, 'unknown');
  return out;
}

/** Fill in actuals (and missing estimates) from Earnings API rows; never overwrite a value already there. */
export function addActuals(rows: EarnItem[], api: EarnItem[]): EarnItem[] {
  const by = new Map(api.map((r) => [`${r.date}|${r.sym}`, r]));
  return rows.map((r) => {
    const a = by.get(`${r.date}|${r.sym}`);
    if (!a) return r;
    const filled = r.epsAct == null && a.epsAct != null;
    return { ...r, epsAct: r.epsAct ?? a.epsAct, epsEst: r.epsEst ?? a.epsEst, revAct: r.revAct ?? a.revAct, revEst: r.revEst ?? a.revEst, when: r.when === 'unknown' ? a.when : r.when, source: filled ? `${r.source} + Earnings API` : r.source };
  });
}

export interface Reaction { date: string; epsSurprise: number | null; epsBeat: boolean | null; revSurprise: number | null; revBeat: boolean | null; day1: { date: string; pct: number } | null; day3: number | null }
/** /v1/earnings-reactions?symbol= -> the last few reports with the next-day move and the 3-day move. */
export function parseReactions(j: any, max = 4): Reaction[] {
  const rows = (Array.isArray(j) ? j : []).filter((r: any) => typeof r?.date === 'string').sort((a: any, b: any) => b.date.localeCompare(a.date)).slice(0, max);
  return rows.map((r: any) => {
    const rs = (Array.isArray(r.reactions) ? r.reactions : []).filter((x: any) => num(x?.priceChange) != null).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
    const d3 = rs.slice(0, 3).reduce((acc: number, x: any) => acc * (1 + Number(x.priceChange) / 100), 1);
    return {
      date: r.date, epsSurprise: num(r.eps?.surprisePercent), epsBeat: typeof r.eps?.beat === 'boolean' ? r.eps.beat : null,
      revSurprise: num(r.revenue?.surprisePercent), revBeat: typeof r.revenue?.beat === 'boolean' ? r.revenue.beat : null,
      day1: rs[0] ? { date: String(rs[0].date), pct: Number(rs[0].priceChange) } : null, day3: rs.length >= 3 ? (d3 - 1) * 100 : null,
    };
  });
}

/* ---------------- Trade Time (api.tradeti.me) ---------------- */
export interface ExStatus { id: string; name: string; tz: string; open: boolean; status: string; session: string | null; toNextH: number | null; toCloseH: number | null; closedReason: string | null }
export function parseTradeTime(j: any): ExStatus[] {
  return (Array.isArray(j?.exchanges) ? j.exchanges : []).filter((e: any) => e?.id).map((e: any) => ({
    id: String(e.id), name: String(e.name ?? e.id), tz: String(e.timezone ?? ''), open: !!e.open, status: String(e.status ?? ''), session: e.sessionType ?? null,
    toNextH: num(e.timeToNextHours), toCloseH: num(e.timeToCloseHours), closedReason: e.closedReason ?? null,
  }));
}
export function parseHolidays(j: any): { holidays: string[]; early: { date: string; close: number }[] } {
  return {
    holidays: (Array.isArray(j?.holidays) ? j.holidays : []).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    early: (Array.isArray(j?.earlyCloses) ? j.earlyCloses : []).filter((e: any) => /^\d{4}-\d{2}-\d{2}$/.test(e?.date) && num(e?.closeTime) != null).map((e: any) => ({ date: e.date, close: Number(e.closeTime) })),
  };
}

/* ---------------- Zillow Research CSV (first rows only) ---------------- */
/** One CSV line -> fields, honouring "quoted, values". */
export function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
export interface HousingSeries { region: string; last: { date: string; val: number } | null; yoyPct: number | null; spark: number[] }
/** The head of a Zillow metro CSV (fetched with a byte range) -> the US row and the biggest metros, last 25 months. */
export function parseZillowHead(text: string, maxRegions = 6): HousingSeries[] {
  const lines = text.split(/\r?\n/);
  const head = csvLine(lines[0] ?? '');
  const firstDate = head.findIndex((h) => /^\d{4}-\d{2}-\d{2}$/.test(h));
  if (firstDate < 0) return [];
  const out: HousingSeries[] = [];
  for (const l of lines.slice(1)) {
    const f = csvLine(l);
    if (f.length !== head.length) continue; // the byte range cut this line off
    const vals: { date: string; val: number }[] = [];
    for (let i = firstDate; i < head.length; i++) { const v = num(f[i]); if (v != null) vals.push({ date: head[i], val: v }); }
    if (!vals.length) continue;
    const last = vals[vals.length - 1];
    const yearAgo = vals.find((v) => v.date.slice(0, 7) === `${+last.date.slice(0, 4) - 1}${last.date.slice(4, 7)}`);
    out.push({ region: f[2], last, yoyPct: yearAgo ? (last.val / yearAgo.val - 1) * 100 : null, spark: vals.slice(-25).map((v) => v.val) });
    if (out.length >= maxRegions) break;
  }
  return out;
}

/* ---------------- mempool.space ---------------- */
export interface BtcNet { height: number | null; fees: { fast: number; hour: number; min: number } | null; hashrateEh: number | null; diffChangePct: number | null; retargetAt: number | null; blocksToRetarget: number | null; avgBlockMin: number | null }
export function parseMempool(fees: any, diff: any, hash: any, height: any): BtcNet {
  const hs = Array.isArray(hash?.hashrates) ? hash.hashrates : [];
  const lastHash = num(hs[hs.length - 1]?.avgHashrate) ?? num(hash?.currentHashrate);
  return {
    height: num(height),
    fees: fees && num(fees.fastestFee) != null ? { fast: Number(fees.fastestFee), hour: Number(fees.hourFee), min: Number(fees.minimumFee) } : null,
    hashrateEh: lastHash != null ? lastHash / 1e18 : null,
    diffChangePct: num(diff?.difficultyChange), retargetAt: num(diff?.estimatedRetargetDate), blocksToRetarget: num(diff?.remainingBlocks),
    avgBlockMin: num(diff?.timeAvg) != null ? Number(diff.timeAvg) / 60_000 : null,
  };
}

/* ---------------- Dataroma superinvestor updates (RSS) ---------------- */
export interface FundMove { manager: string; t: number; url: string; bought: string[]; added: string[]; reduced: string[]; sold: string[] }
export function parseDataroma(xml: string): FundMove[] {
  const out: FundMove[] = [];
  for (const b of xml.match(/<item>[\s\S]*?<\/item>/gi) ?? []) {
    const cdata = (s: string) => s.replace(/<!\[CDATA\[|\]\]>/g, '');
    const manager = cdata(/<title>([\s\S]*?)<\/title>/i.exec(b)?.[1] ?? '').trim();
    const desc = cdata(/<description>([\s\S]*?)<\/description>/i.exec(b)?.[1] ?? '');
    const list = (label: string) => (new RegExp(`<b>${label}:?<\\/b>([^<]*)`, 'i').exec(desc)?.[1] ?? '').trim().split(/\s+/).filter((x) => /^[A-Z][A-Z0-9.]{0,6}$/.test(x));
    const t = Date.parse(/<pubDate>([^<]+)<\/pubDate>/i.exec(b)?.[1] ?? '');
    if (!manager || !Number.isFinite(t)) continue;
    out.push({ manager, t, url: (/<link>([^<]+)<\/link>/i.exec(b)?.[1] ?? '').replace(/^http:/, 'https:'), bought: list('Bought'), added: list('Added to'), reduced: list('Reduced'), sold: list('Sold out') });
  }
  return out;
}
/** One message per manager; your tickers are listed first. Positions are as of the quarter-end 13F, filed up to 45 days later. */
export function fundMessages(moves: FundMove[], mine: Set<string>): FeedItem[] {
  return moves.map((m) => {
    const order = (xs: string[]) => [...xs.filter((x) => mine.has(x)), ...xs.filter((x) => !mine.has(x))];
    const parts = [['bought', m.bought], ['added to', m.added], ['trimmed', m.reduced], ['sold out of', m.sold]] as const;
    const yours = [...m.bought, ...m.added, ...m.reduced, ...m.sold].filter((x) => mine.has(x));
    const text = parts.filter(([, xs]) => xs.length).map(([k, xs]) => `${k[0].toUpperCase()}${k.slice(1)}: ${order(xs).slice(0, 12).join(' ')}${xs.length > 12 ? ` +${xs.length - 12} more` : ''}`).join(' · ');
    return { id: `fund:${m.url}:${m.t}`, t: m.t, kind: 'fund' as const, sym: yours[0], title: `${m.manager} filed its 13F${yours.length ? ` (includes ${yours.slice(0, 4).join(', ')})` : ''}`, text: `${text || 'No buys or additions listed in the update'}. Quarter-end positions, reported up to 45 days later. (Dataroma)`, url: m.url };
  });
}

/* ---------------- full-market high short interest ---------------- */
export interface HighSi { sym: string; name: string; shares: number; daysToCover: number; pctOut: number | null; settlementDate: string; changePct: number | null }
/** FINRA rows (latest settlement per symbol) + SEC shares outstanding -> the most-shorted listed stocks. */
export function highShortInterest(rows: any[], sharesOut: Map<string, number>, { minPct = 15, minDays = 7, max = 80 } = {}): HighSi[] {
  const latest = new Map<string, any>();
  for (const r of Array.isArray(rows) ? rows : []) {
    const s = String(r?.symbolCode ?? '').toUpperCase();
    if (!s || /[^A-Z.]/.test(s) || (latest.get(s)?.settlementDate ?? '') >= r.settlementDate) continue;
    latest.set(s, r);
  }
  const out: HighSi[] = [];
  for (const [sym, r] of latest) {
    const shares = Number(r.currentShortPositionQuantity) || 0, dtc = Math.min(Number(r.daysToCoverQuantity) || 0, 999);
    const so = sharesOut.get(sym);
    const pctOut = so && so > 0 ? (shares / so) * 100 : null;
    if (pctOut != null && pctOut > 100) continue; // share counts out of date (splits, offerings): leave out rather than show nonsense
    if ((pctOut ?? 0) < minPct && !(pctOut == null && dtc >= minDays && dtc < 999)) continue;
    out.push({ sym, name: String(r.issueName ?? ''), shares, daysToCover: dtc, pctOut, settlementDate: String(r.settlementDate), changePct: num(r.changePercent) });
  }
  return out.sort((a, b) => (b.pctOut ?? 0) - (a.pctOut ?? 0) || b.daysToCover - a.daysToCover).slice(0, max);
}

/* ---------------- Congress: late disclosures ---------------- */
/** The STOCK Act gives 45 days from the trade to disclose it. Returns days late, or 0. */
export function daysLate(tradeDate: string, disclosed: string): number {
  const a = Date.parse(`${tradeDate.slice(0, 10)}T12:00:00Z`), b = Date.parse(`${disclosed.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400_000) - 45);
}
