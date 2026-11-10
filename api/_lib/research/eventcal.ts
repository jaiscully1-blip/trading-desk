// GET /api/research?fn=eventcal&symbols=NVDA,AMD -> earnings (next ~9 days) and IPOs (upcoming / priced / filed / withdrawn) plus fresh SEC IPO filings.
// Sources, all free: Nasdaq's public calendar JSON (unofficial, no key), Finnhub earnings + IPO calendars (key), SEC EDGAR filings feed (official).
// Alpha Vantage is only a last resort for IPOs (25 calls a day). Every part is optional: a failing source is named in `errors`.
import { alphaIpos, edgarCurrent, finnhubEarnings, finnhubIpos, nasdaqEarnings, nasdaqIpo } from '../adapters.js';
import { SYMBOL_RE, cached, hasKey, json, ttl } from '../core.js';
import { mergeEarnings, mergeIpos, parseEdgarAtom, parseFinnhubIpo, parseNasdaqEarnings, parseNasdaqIpo, sortEarnings, sortIpos, type EarnItem, type FilingItem, type IpoItem } from '../../../shared/eventsCal.js';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const PER_DAY = 70; // biggest companies per day, plus every ticker the caller asked about

export async function GET(req: Request): Promise<Response> {
  const syms = new Set((new URL(req.url).searchParams.get('symbols') ?? '').toUpperCase().split(',').map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)));
  const errors: Record<string, string> = {};
  const now = Date.now();
  const days: string[] = [];
  for (let k = -1; k <= 9; k++) { const d = ymd(now + k * 86400_000); const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); if (wd !== 0 && wd !== 6) days.push(d); }
  const from = days[0], to = days[days.length - 1];

  // earnings
  const nq = await Promise.allSettled(days.map((d) => cached(`nq:earn:${d}`, ttl(1800, 6 * 3600), async () => parseNasdaqEarnings(await nasdaqEarnings(d), d)).then((r) => r.val)));
  const nasdaqRows: EarnItem[] = nq.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const nqFail = nq.filter((r) => r.status === 'rejected').length;
  if (nqFail) errors.nasdaqEarnings = `${nqFail} of ${days.length} days failed: ${String((nq.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason?.message ?? '')}`.slice(0, 160);
  let fh: Awaited<ReturnType<typeof finnhubEarnings>> = [];
  if (hasKey('finnhub')) {
    try { fh = (await cached(`earn:${from}:${to}`, ttl(900, 3600), () => finnhubEarnings(from, to))).val; } catch (e) { errors.finnhubEarnings = (e as Error).message.slice(0, 160); }
  } else errors.finnhubEarnings = 'no FINNHUB_API_KEY';
  // Finnhub's free calendar lists every micro-cap; keep its extras only when Nasdaq gave nothing at all
  const known = new Set(nasdaqRows.map((r) => `${r.date}|${r.sym}`));
  const fhUse = nasdaqRows.length ? fh.filter((r) => known.has(`${r.date}|${r.sym.toUpperCase()}`)) : fh;
  const merged = sortEarnings(mergeEarnings(nasdaqRows, fhUse));
  const earnings: EarnItem[] = [];
  const perDay: Record<string, number> = {}, totals: Record<string, number> = {};
  for (const r of merged) {
    totals[r.date] = (totals[r.date] ?? 0) + 1;
    if (syms.has(r.sym) || (perDay[r.date] = (perDay[r.date] ?? 0) + 1) <= PER_DAY) earnings.push(r);
  }

  // IPOs
  const months = [ymd(now).slice(0, 7), ymd(now + 31 * 86400_000).slice(0, 7)];
  const nqIpo = await Promise.allSettled(months.map((m) => cached(`nq:ipo:${m}`, ttl(1800, 6 * 3600), async () => parseNasdaqIpo(await nasdaqIpo(m))).then((r) => r.val)));
  const lists: IpoItem[][] = nqIpo.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (nqIpo.every((r) => r.status === 'rejected')) errors.nasdaqIpo = String((nqIpo[0] as PromiseRejectedResult).reason?.message ?? 'failed').slice(0, 160);
  if (hasKey('finnhub')) {
    try {
      const r = await cached(`fh:ipo:${ymd(now)}`, ttl(1800, 6 * 3600), async () => parseFinnhubIpo(await finnhubIpos(ymd(now - 30 * 86400_000), ymd(now + 60 * 86400_000))));
      lists.push(r.val);
    } catch (e) { errors.finnhubIpo = (e as Error).message.slice(0, 160); }
  }
  if (!lists.some((l) => l.length) && hasKey('alphavantage')) {
    try { lists.push((await cached('cal:ipo', 12 * 3600, alphaIpos)).val.map((i) => ({ key: i.sym || i.name.toLowerCase(), sym: i.sym.toUpperCase(), name: i.name, status: 'upcoming' as const, date: i.date, exchange: i.exchange, price: i.low != null ? `${i.low}${i.high != null && i.high !== i.low ? `-${i.high}` : ''}` : '', shares: null, amount: null, source: 'Alpha Vantage' }))); } catch (e) { errors.alphaIpo = (e as Error).message.slice(0, 160); }
  }
  const ipos = sortIpos(mergeIpos(...lists));

  // fresh SEC filings that announce or price IPOs
  let filings: FilingItem[] = [];
  if (hasKey('sec')) {
    const got = await Promise.allSettled(['S-1', '424B4'].map((f) => cached(`edgar:${f}`, ttl(900, 3600), async () => parseEdgarAtom(await edgarCurrent(f), 25)).then((r) => r.val)));
    filings = got.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).sort((a, b) => b.date.localeCompare(a.date));
    if (got.every((r) => r.status === 'rejected')) errors.edgar = String((got[0] as PromiseRejectedResult).reason?.message ?? 'failed').slice(0, 160);
  } else errors.edgar = 'no SEC_USER_AGENT';

  return json({ asOf: now, from, to, days, earnings, totals, ipos, filings, errors, sources: { earnings: 'Nasdaq public calendar (unofficial) + Finnhub', ipos: 'Nasdaq public calendar (unofficial) + Finnhub', filings: 'SEC EDGAR current filings' } }, { sMaxAge: 900 });
}
