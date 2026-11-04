// GET /api/market-status -> published NYSE calendar + live status feed (Finnhub, else Alpha Vantage).
// The feed adds holidays/early closes from Finnhub's list and flags unscheduled closures (e.g. a national day of mourning).
import { NYSE_HOLIDAYS, NYSE_EARLY, setMarketCalendar, ymdKey } from '../shared/marketCalendar';
import { clock, et } from '../shared/clock';
import { alphaMarketStatus, finnhubHolidays, finnhubMarketStatus, type LiveStatus } from './_lib/adapters';
import { cached, hasKey, json } from './_lib/core';

export async function GET(): Promise<Response> {
  const sources: { name: string; ok: boolean; error?: string }[] = [];
  let extra: { holidays: Record<string, string>; early: Record<string, { close: number; name: string }> } = { holidays: {}, early: {} };
  if (hasKey('finnhub')) {
    try { extra = (await cached('mkt:holidays', 12 * 3600, finnhubHolidays)).val; sources.push({ name: 'Finnhub holidays', ok: true }); }
    catch (e) { sources.push({ name: 'Finnhub holidays', ok: false, error: (e as Error).message }); }
  }
  let status: LiveStatus | null = null;
  const tryStatus = async (name: string, f: () => Promise<LiveStatus>, ttlSec: number) => {
    if (status) return;
    try { status = (await cached(`mkt:status:${name}`, ttlSec, f)).val; sources.push({ name, ok: true }); }
    catch (e) { sources.push({ name, ok: false, error: (e as Error).message }); }
  };
  if (hasKey('finnhub')) await tryStatus('Finnhub status', finnhubMarketStatus, 300);
  if (hasKey('alphavantage')) await tryStatus('Alpha Vantage status', alphaMarketStatus, 1800); // 25/day budget

  // Unscheduled closure: the feed says closed mid-session on a day the published calendar says is open
  const e = et();
  const today = ymdKey(e.y, e.mo, e.d);
  const unscheduled: Record<string, string> = {};
  const s = status as LiveStatus | null;
  const c = clock();
  const midSession = c.session === 'Regular session' && e.sod >= 10 * 3600 && e.sod < c.closeSod - 1800;
  if (s && !NYSE_HOLIDAYS[today] && !extra.holidays[today]) {
    if (s.holiday && !s.isOpen) unscheduled[today] = s.holiday;
    else if (!s.isOpen && midSession && s.source === 'Finnhub') unscheduled[today] = 'Market closed (status feed)';
  }
  setMarketCalendar({ holidays: extra.holidays, early: extra.early, unscheduled }); // server-side clock too
  return json({
    calendar: { holidays: { ...NYSE_HOLIDAYS, ...extra.holidays }, early: { ...NYSE_EARLY, ...extra.early }, unscheduled },
    status, sources, asOf: Date.now(),
    published: 'NYSE Group 2026-2028 holiday and early closings calendar (Dec 23 2025)',
  }, { sMaxAge: 300 });
}
