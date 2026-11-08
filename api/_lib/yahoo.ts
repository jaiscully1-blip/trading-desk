// Yahoo Finance's public chart endpoint (no key) with the desk's normal daily-series chain as the fallback.
import { parseYahooChart } from '../../shared/rotation.js';
import type { Bar } from '../../shared/types.js';
import { cryptoDaily } from './adapters.js';
import { cached, getJson } from './core.js';
import { loadSeries } from './series.js';

export const YH_HEADERS = { 'user-agent': 'Mozilla/5.0 (trading-desk; personal use)' };

async function yahoo(sym: string): Promise<Bar[]> {
  const y = sym === 'BTC' || sym === 'ETH' ? `${sym}-USD` : sym.replace('.', '-');
  const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=1y&interval=1d`, 'yahoo', 8000, { headers: YH_HEADERS });
  const bars = parseYahooChart(j);
  if (bars.length < 30) throw new Error('short history');
  return bars;
}

/** About a year of daily bars from Yahoo alone (null when it fails), so callers can choose their own fallback. */
export async function yahooDaily(sym: string): Promise<Bar[] | null> {
  try { return (await cached(`yh:${sym}`, 6 * 3600, () => yahoo(sym))).val; } catch { return null; }
}

/** Several years of daily bars from Yahoo's chart endpoint (no fallback: callers decide what to do without it). */
export async function longDaily(sym: string, range: '2y' | '3y' | '5y' = '3y'): Promise<Bar[]> {
  return (await cached(`yh:${range}:${sym}`, 6 * 3600, async () => {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym.replace('.', '-'))}?range=${range}&interval=1d`, 'yahoo', 10000, { headers: YH_HEADERS });
    const bars = parseYahooChart(j);
    if (bars.length < 100) throw new Error('short history');
    return bars;
  })).val;
}

/** About a year of daily bars: Yahoo first, then crypto feeds or the regular quote providers. */
export async function dailyBars(sym: string, reserve = 2): Promise<{ bars: Bar[]; source: string } | null> {
  try { return { bars: (await cached(`yh:${sym}`, 6 * 3600, () => yahoo(sym))).val, source: 'Yahoo Finance' }; } catch { /* fall back */ }
  if (sym === 'BTC' || sym === 'ETH') {
    try { const { val } = await cached(`crypto:${sym}`, 900, () => cryptoDaily(sym)); return { bars: val.bars, source: val.source }; } catch { return null; }
  }
  const r = await loadSeries(sym, 'D', { fallback: false, reserve });
  return r.ok ? { bars: r.val.bars, source: r.val.source } : null;
}
