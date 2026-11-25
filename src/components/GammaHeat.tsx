// Strike × expiry heatmap (Gamma page): dealer GEX, open interest or today's volume per cell, biggest cells outlined.
// Click a cell to pick it; then pin the strike as a line on the chart or set a price alert at it.
import { useMemo, useState } from 'react';
import type { StrikeGrid } from '../../shared/gamma';
import { usePersisted } from '../lib/store';
import { useDesk } from '../lib/deskctx';
import { chartSym, clearPins, togglePin, useGexPins } from '../lib/gexPins';
import { Q, Seg } from './common';

type Metric = 'gex' | 'oi' | 'vol';
const short = (x: number, usd: boolean) => { const a = Math.abs(x), s = x < 0 ? '-' : ''; const p = usd ? '$' : ''; return a >= 1e9 ? `${s}${p}${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${s}${p}${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${s}${p}${(a / 1e3).toFixed(0)}K` : `${s}${p}${Math.round(a)}`; };

export default function GammaHeat({ grid, spot, sym }: { grid: StrikeGrid; spot: number; sym: string }) {
  const [metric, setMetric] = usePersisted<Metric>('gxHeatMetric', 'gex');
  const [sel, setSel] = useState<{ e: number; s: number } | null>(null);
  const pins = useGexPins()[sym] ?? [];
  const { priceAlerts, setPriceAlerts } = useDesk();
  const val = (c: number[]) => (metric === 'gex' ? c[0] : metric === 'oi' ? c[1] - c[2] : c[3] - c[4]);
  const { max, top } = useMemo(() => {
    const all = grid.cells.flatMap((row, e) => row.map((c, s) => ({ e, s, v: val(c) })));
    return { max: Math.max(1, ...all.map((x) => Math.abs(x.v))), top: new Set(all.sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 5).map((x) => `${x.e}:${x.s}`)) };
  }, [grid, metric]); // eslint-disable-line react-hooks/exhaustive-deps
  const spotRow = grid.strikes.reduce((bi, k, i) => (Math.abs(k - spot) < Math.abs(grid.strikes[bi] - spot) ? i : bi), 0);
  const cell = sel ? grid.cells[sel.e]?.[sel.s] : null, K = sel ? grid.strikes[sel.s] : null;
  const alert = () => { if (K == null || !setPriceAlerts) return; setPriceAlerts([...(priceAlerts ?? []), { id: Math.random().toString(36).slice(2, 10), sym: chartSym(sym), kind: K >= spot ? 'above' : 'below', value: sym === 'SPX' ? +(K / 10).toFixed(2) : K, note: `${sym} ${K} strike (gamma heatmap)${sym === 'SPX' ? ', SPX ÷ 10 ≈ SPY' : ''}`, active: true, created: Date.now() }]); };
  return (
    <div className="gh">
      <div className="gx-h"><Q k="calc" src="calculated on the desk from the delayed option chain (Alpaca or Cboe, ~15 min)" /><b>Strike × expiry heatmap</b>
        <span className="small muted">{metric === 'gex' ? 'dealer gamma, $ per 1% move' : metric === 'oi' ? 'open interest, calls minus puts' : "today's volume, calls minus puts"} · green + / red − · outlined = 5 biggest</span>
        <Seg<Metric> value={metric} onChange={setMetric} options={[{ id: 'gex', label: 'GEX' }, { id: 'oi', label: 'OI' }, { id: 'vol', label: 'Volume' }]} />
      </div>
      <div className="gh-wrap">
        <table className="gh-t">
          <thead><tr><th>{sym}</th>{grid.expiries.map((x) => <th key={x.exp}>{new Date(`${x.exp}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}<em>{x.dte}d</em></th>)}</tr></thead>
          <tbody>
            {grid.strikes.map((k, s) => (
              <tr key={k} className={s === spotRow ? 'spot' : ''}>
                <th className={pins.includes(k) ? 'pinned' : ''} title={s === spotRow ? `Closest strike to price ${spot.toFixed(2)}` : undefined}>{k}{pins.includes(k) ? ' 📌' : ''}</th>
                {grid.cells.map((row, e) => {
                  const v = val(row[s]), a = Math.sqrt(Math.abs(v) / max);
                  return <td key={e} className={`${top.has(`${e}:${s}`) ? 'top' : ''} ${sel?.e === e && sel?.s === s ? 'sel' : ''}`} style={{ background: v === 0 ? undefined : `color-mix(in srgb, var(${v > 0 ? '--up' : '--down'}) ${Math.round(8 + a * 62)}%, transparent)` }} onClick={() => setSel({ e, s })} title={`${k} · ${grid.expiries[e].exp}`}>{v === 0 ? '' : short(v, metric === 'gex')}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cell && K != null && (
        <div className="gh-pick">
          <b className="num">{sym} {K} · {grid.expiries[sel!.e].exp}</b>
          <span className="small">GEX {short(cell[0], true)} · OI calls {short(cell[1], false)} / puts {short(cell[2], false)} · volume calls {short(cell[3], false)} / puts {short(cell[4], false)} · {((K / spot - 1) * 100).toFixed(1)}% from price</span>
          <button className="btn" onClick={() => togglePin(sym, K)}>{pins.includes(K) ? 'Unpin from chart' : `📌 Pin ${K} on the ${chartSym(sym)} chart`}</button>
          {setPriceAlerts && <button className="btn" onClick={alert}>🔔 Alert at {sym === 'SPX' ? `${(K / 10).toFixed(2)} on SPY` : K}</button>}
        </div>
      )}
      {pins.length > 0 && <p className="small muted gh-pins">Pinned on the chart: {pins.join(', ')}{sym === 'SPX' ? ' (shown on SPY at ÷10, approximate)' : ''} · <button className="link" onClick={() => clearPins(sym)}>clear</button></p>}
    </div>
  );
}
