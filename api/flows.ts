// GET /api/flows -> sector / bonds / gold / dollar / crypto rotation PROXY (ETF relative performance x relative dollar volume)
import type { Bar } from '../shared/types';
import { ASSETS, computeFlows, flowArcs, type FlowWindow } from '../shared/flows';
import { cryptoDaily } from './_lib/adapters';
import { cached, json } from './_lib/core';
import { loadSeries } from './_lib/series';

export async function GET(): Promise<Response> {
  const series: Record<string, Bar[]> = {};
  const pending: string[] = [];
  const sources = new Set<string>();
  const spyR = await loadSeries('SPY', 'D', { fallback: false, reserve: 2 });
  for (const a of ASSETS.filter((x) => x.group !== 'crypto')) {
    const r = await loadSeries(a.sym, 'D', { fallback: false, reserve: 2 });
    if (r.ok) { series[a.sym] = r.val.bars; sources.add(r.val.source); } else pending.push(a.sym);
  }
  for (const c of ['BTC', 'ETH'] as const) {
    try { const { val } = await cached(`crypto:${c}`, 900, () => cryptoDaily(c)); series[c] = val.bars; sources.add(val.source); } catch { pending.push(c); }
  }
  const spy = spyR.ok ? spyR.val.bars : [];
  const windows = Object.fromEntries((['1D', '5D', '20D'] as FlowWindow[]).map((w) => { const rows = computeFlows(series, spy, w); return [w, { rows, arcs: flowArcs(rows) }]; }));
  return json({ windows, pending, sources: [...sources], asOf: Date.now(), proxy: 'Relative performance vs SPY x relative dollar volume. Not actual fund-flow data.' }, { sMaxAge: pending.length ? 0 : 900 });
}
