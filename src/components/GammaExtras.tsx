// Gamma page extras: unusual options activity + max pain, and a short good / bad read for every number on the page.
// The good / bad lines describe what each reading usually means for how price behaves; they are not trade signals.
import type { GammaRead, IvRow } from '../../shared/gamma';
import type { MaxPain, Unusual } from '../../shared/optflow';
import { Q } from './common';

export interface Flow { unusual: Unusual[]; summary: { call: number; put: number; total: number; callShare: number | null; shortShare: number | null; n: number }; maxPain: MaxPain[] }

const money = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`);
const k = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
const pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}%`;

export function FlowPanel({ flow, sym }: { flow: Flow | undefined; sym: string }) {
  if (!flow) return <p className="small muted gx-pad">Options activity needs the live chain (not shown in demo mode, or the chain is still the older cached copy; it refreshes within 15 minutes).</p>;
  const s = flow.summary;
  return (
    <div className="of">
      <div className="of-sum small">
        {s.n ? <>
          <span><b>{s.n}</b> contracts traded more than their open interest today · <b className="num">{money(s.total)}</b> in premium</span>
          {s.callShare != null && <span className="of-split"><span className="of-bar"><span className="up-bg" style={{ width: `${s.callShare * 100}%` }} /></span> calls <b className="num up">{(s.callShare * 100).toFixed(0)}%</b> / puts <b className="num down">{(100 - s.callShare * 100).toFixed(0)}%</b></span>}
          {s.shortShare != null && <span className="muted">{(s.shortShare * 100).toFixed(0)}% expires within a week</span>}
        </> : <span className="muted">No {sym} contract traded more than its open interest today (min 300 contracts and $25K premium).</span>}
      </div>
      {flow.unusual.length > 0 && (
        <div className="of-scroll">
          <table className="of-t">
            <thead><tr><th>Contract</th><th>Expiry</th><th title="Distance from the price: positive = out of the money">OTM</th><th>Volume</th><th>Open int.</th><th title="Volume ÷ open interest at the start of the day">Vol/OI</th><th title="Volume × last price × 100">Premium</th><th>IV</th></tr></thead>
            <tbody>{flow.unusual.slice(0, 20).map((u) => (
              <tr key={`${u.exp}${u.cp}${u.K}`}>
                <td className={u.cp === 'C' ? 'up' : 'down'}><b>{k(u.K)} {u.cp === 'C' ? 'call' : 'put'}</b></td>
                <td className="num">{u.exp.slice(5)} <span className="muted">{u.dte}d</span></td>
                <td className="num">{pct(u.otmPct)}</td>
                <td className="num">{u.vol.toLocaleString('en-US')}</td>
                <td className="num muted">{u.oi.toLocaleString('en-US')}</td>
                <td className="num">{u.ratio == null || !Number.isFinite(u.ratio) ? 'new' : `${u.ratio.toFixed(1)}×`}</td>
                <td className="num"><b>{money(u.premium)}</b></td>
                <td className="num muted">{u.iv ? `${(u.iv * (u.iv < 5 ? 100 : 1)).toFixed(0)}%` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {flow.maxPain.length > 0 && (
        <div className="of-mp small">
          <span className="muted">Max pain:</span>
          {flow.maxPain.map((m) => <span key={m.exp} className="of-mp-i" title={`${m.oi.toLocaleString('en-US')} contracts open for ${m.exp}`}>{m.exp.slice(5)} <b className="num">{k(m.strike)}</b> <span className="muted">({pct(m.distPct)})</span></span>)}
        </div>
      )}
      <p className="note">Volume above open interest usually means new positions were opened today, but the chain can't say who bought or sold, or whether it was a hedge or part of a spread. Deep in-the-money contracts are left out.</p>
    </div>
  );
}

interface Read { name: string; now: string; good: string; bad: string; side: 'good' | 'bad' | null }
/** One short line each: what it is right now, the good case, the bad case; the side that applies now is highlighted. */
export function Readings({ spot, g, surface, pc, flow }: { spot: number; g: GammaRead; surface: IvRow[]; pc: { oi: number | null; vol: number | null }; flow?: Flow }) {
  const front = surface[0], last = surface[surface.length - 1];
  const inverted = front?.atm != null && last?.atm != null && surface.length > 1 ? front.atm > last.atm : null;
  const mp = flow?.maxPain[0];
  const rows: Read[] = [
    { name: 'Gamma regime', now: g.regime === 'positive' ? 'positive' : 'negative',
      good: 'Positive: dealers buy dips and sell rips, so moves stay smaller.', bad: 'Negative: dealers hedge with the move, so drops and pops run further.', side: g.regime === 'positive' ? 'good' : 'bad' },
    { name: 'Zero-gamma flip', now: g.flip != null ? `${k(g.flip)} (price ${spot >= g.flip ? 'above' : 'below'})` : 'none near',
      good: 'Price above the flip: the calmer side.', bad: 'Price below the flip: swings tend to get bigger and faster.', side: g.flip == null ? null : spot >= g.flip ? 'good' : 'bad' },
    { name: 'Call wall', now: g.callWall != null ? `${k(g.callWall)} (${pct((g.callWall / spot - 1) * 100)})` : '—',
      good: 'Price breaks and holds above it: dealer buying can add fuel.', bad: 'Price stalls under it: often caps rallies while gamma is positive.', side: null },
    { name: 'Put wall', now: g.putWall != null ? `${k(g.putWall)} (${pct((g.putWall / spot - 1) * 100)})` : '—',
      good: 'Holds as support while gamma is positive.', bad: 'Breaks: hedging turns into selling and can speed the drop.', side: g.putWall == null ? null : spot >= g.putWall ? 'good' : 'bad' },
    ...(pc.oi != null ? [{ name: 'Put/call open interest', now: pc.oi.toFixed(2),
      good: 'Around 0.7–1.3: normal hedging.', bad: 'Very high (fear, heavy hedging) or very low (complacent, few hedges).', side: (pc.oi >= 0.7 && pc.oi <= 1.3 ? 'good' : 'bad') as 'good' | 'bad' }] : []),
    ...(inverted != null ? [{ name: 'Term structure', now: inverted ? 'inverted' : 'upward',
      good: 'Upward (near-term IV below later dates): calm.', bad: 'Inverted: traders pay up for protection right now; expect bigger moves.', side: (inverted ? 'bad' : 'good') as 'good' | 'bad' }] : []),
    ...(front?.skew != null ? [{ name: 'Skew (front expiry)', now: `${front.skew.toFixed(1)} pts`,
      good: 'Small: downside protection is fairly priced.', bad: 'Steep and rising: heavy demand for crash protection.', side: null }] : []),
    ...(mp ? [{ name: 'Max pain', now: `${k(mp.strike)} for ${mp.exp.slice(5)} (${pct(mp.distPct)})`,
      good: 'Matters in the last day or two before expiry, mostly when gamma is positive.', bad: 'Far from the price or far from expiry: little pull, ignore it.', side: (Math.abs(mp.distPct) <= 2 && mp.dte <= 2 ? 'good' : null) as 'good' | null }] : []),
    ...(flow?.summary.n ? [{ name: 'Unusual activity', now: `${flow.summary.n} contracts, ${money(flow.summary.total)}`,
      good: 'Big volume in later expiries: a sign someone is positioning with time.', bad: 'Bursts of cheap, short-dated contracts: often lottery tickets or hedges, easy to over-read.', side: (flow.summary.shortShare != null ? (flow.summary.shortShare > 0.6 ? 'bad' : 'good') : null) as 'good' | 'bad' | null }] : []),
  ];
  return (
    <div className="rd">
      <div className="gx-h"><Q k="calc" src="Plain-English reads of the numbers on this page. Rules of thumb, not predictions." /><b>What each reading means</b><span className="small muted">highlighted = the side that applies right now</span></div>
      <div className="rd-list">
        {rows.map((r) => (
          <div key={r.name} className="rd-row">
            <div className="rd-n"><b>{r.name}</b><span className="num small">{r.now}</span></div>
            <div className={`rd-g small ${r.side === 'good' ? 'on' : ''}`}><span className="up">Good</span> {r.good}</div>
            <div className={`rd-b small ${r.side === 'bad' ? 'on' : ''}`}><span className="down">Bad</span> {r.bad}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
