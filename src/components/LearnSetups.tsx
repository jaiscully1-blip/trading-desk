// Learn → Setups & traps: the Setup lab measures ORB, fakeouts, VWAP, volume, sweeps of yesterday's high/low and gap
// fills on real bars for one ticker (60 days of 5-minute bars, 3 years of daily bars), then each setup card explains what
// defines it, why it happens, what to watch for and where it is wrong, with the lab's number for that ticker beside it.
import { useMemo, useState } from 'react';
import { useLabBars } from '../lib/useLabBars';
import { gapFills, orb, pct, sessions, sweeps, volumeProfile, vwapStats } from '../../shared/setuplab';
import { SETUPS, type StatKey } from '../../shared/setups';
import { usePersisted } from '../lib/store';

const f1 = (v: number) => (Number.isFinite(v) ? `${v.toFixed(0)}%` : '—');
const fr = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}R` : '—');

function Big({ v, label, sub, tone }: { v: string; label: string; sub?: string; tone?: 'up' | 'down' }) {
  return <div className="sl-big"><b className={tone ?? ''}>{v}</b><span>{label}</span>{sub && <span className="small muted">{sub}</span>}</div>;
}

export default function LearnSetups() {
  const [sym, setSym] = usePersisted('slSym', 'SPY');
  const [draft, setDraft] = useState(sym);
  const [orMin, setOrMin] = usePersisted<5 | 15 | 30>('slOr', 15);
  const [tgt, setTgt] = usePersisted<1 | 2 | 'close'>('slTgt', 2);
  const { m5, d, err, loading } = useLabBars(sym);
  const ss = useMemo(() => sessions(m5), [m5]);
  const o = useMemo(() => orb(ss, orMin, tgt), [ss, orMin, tgt]);
  const vw = useMemo(() => vwapStats(ss), [ss]);
  const vol = useMemo(() => volumeProfile(ss), [ss]);
  const sw = useMemo(() => sweeps(d), [d]);
  const gaps = useMemo(() => gapFills(d), [d]);
  const [group, setGroup] = useState('All');
  const groups = ['All', ...new Set(SETUPS.map((s) => s.group))];
  const span = ss.length ? `${ss[0].date} to ${ss[ss.length - 1].date}` : '';
  const gapTot = (k: 'up' | 'dn') => { const n = gaps.reduce((a, g) => a + g[k].n, 0), fl = gaps.reduce((a, g) => a + g[k].filled, 0); return { n, p: pct(fl, n) }; };

  const statLine = (k?: StatKey): string | null => {
    if (!k || !ss.length) return null;
    switch (k) {
      case 'orb': return `${sym}, ${orMin}-min range, ${tgt === 'close' ? 'exit at close' : `${tgt}R target`}: ${o.trades.length} trades in ${o.days} days, ${f1(o.win)} winners, average ${fr(o.avgR)}.`;
      case 'fake': return `${sym}: ${f1(o.fake)} of ${orMin}-min range breaks closed back inside within 15 minutes.`;
      case 'both': return `${sym}: on ${f1(o.both)} of days price broke both sides of the ${orMin}-min opening range.`;
      case 'rvol': return `${sym} ORB with opening RVOL ≥ 1.5: ${f1(o.hiRvol.win)} winners, ${fr(o.hiRvol.avgR)} (${o.hiRvol.n} trades) vs. RVOL < 1: ${f1(o.loRvol.win)}, ${fr(o.loRvol.avgR)} (${o.loRvol.n}).`;
      case 'vwapSide': return `${sym}: the close finished on the same side of VWAP as 10:30 on ${f1(vw.sameSide)} of days; price stayed on one side all day after 10:00 on ${f1(vw.trendDays)}.`;
      case 'vwapAbove': return `${sym}: VWAP retests from above held 30 minutes later ${f1(pct(vw.fromAbove.held, vw.fromAbove.n))} of the time (${vw.fromAbove.n}); from below ${f1(pct(vw.fromBelow.held, vw.fromBelow.n))} (${vw.fromBelow.n}).`;
      case 'vwapBelow': return null;
      case 'vwapTrend': return null;
      case 'volume': return `${sym}: first 30 minutes ${f1(vol[0]?.share)} of continuous-session volume; 11:30–14:00 ${f1(vol[2]?.share)} over 2.5 hours.`;
      case 'sweepUp': return `${sym}, last ${sw.days} days: of ${sw.upBreaks} days that traded above the prior day’s high, ${f1(sw.upRejected)} closed back below it; of ${sw.dnBreaks} breaks of the prior low, ${f1(sw.dnRejected)} closed back above.`;
      case 'sweepDn': return `${sym}: ${f1(sw.dnRejected)} of breaks below the prior day’s low closed back above it (${sw.dnBreaks} days).`;
      case 'gapUp': { const u = gapTot('up'), dn = gapTot('dn'); return `${sym}: ${f1(u.p)} of gaps up (${u.n}) and ${f1(dn.p)} of gaps down (${dn.n}) filled the same day; small gaps fill far more often.`; }
      case 'gapDn': return null;
    }
  };

  return (
    <div className="sl">
      <section className="ad-card sl-lab">
        <header className="ad-h"><h3>Setup lab</h3><span className="small muted">measured on real bars, no costs or slippage</span></header>
        <div className="ln-chips">
          <form onSubmit={(e) => { e.preventDefault(); const s = draft.trim().toUpperCase(); if (/^[A-Z.\-^]{1,10}$/.test(s)) setSym(s); }}><input className="ln-search sl-sym" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} /></form>
          {['SPY', 'QQQ', 'IWM', 'AAPL', 'NVDA', 'TSLA'].map((s) => <button key={s} className={`chip sm ${sym === s ? 'on' : ''}`} onClick={() => { setSym(s); setDraft(s); }}>{s}</button>)}
          <span className="sl-sep" />
          <span className="small muted">Range</span>{([5, 15, 30] as const).map((m) => <button key={m} className={`chip sm ${orMin === m ? 'on' : ''}`} onClick={() => setOrMin(m)}>{m} min</button>)}
          <span className="small muted">Exit</span>{([1, 2, 'close'] as const).map((t) => <button key={t} className={`chip sm ${tgt === t ? 'on' : ''}`} onClick={() => setTgt(t)}>{t === 'close' ? 'Close' : `${t}R`}</button>)}
        </div>
        {loading && <p className="small muted">Loading {sym}…</p>}
        {!loading && err && !ss.length && <p className="small down">Could not load {sym}: {err}</p>}
        {!loading && ss.length > 0 && (
          <>
            <p className="small muted">{sym}: {ss.length} sessions of 5-minute bars ({span}); daily stats from {d.length} days. {ss.length < 40 ? 'Small sample: treat percentages loosely.' : 'Sixty days is still a small sample: compare tickers and settings, don’t treat any number as a promise.'}</p>
            <h4 className="sl-h">Opening-range breakout · {orMin}-minute range · {tgt === 'close' ? 'hold to the close' : `${tgt}R target`}, stop at the other side</h4>
            <div className="sl-grid">
              <Big v={String(o.trades.length)} label="trades" sub={`${o.days} days`} />
              <Big v={f1(o.win)} label="winners" />
              <Big v={fr(o.avgR)} label="average per trade" tone={o.avgR >= 0 ? 'up' : 'down'} />
              <Big v={Number.isFinite(o.pf) ? o.pf.toFixed(2) : '—'} label="profit factor" sub="gains ÷ losses" />
              <Big v={f1(o.fake)} label="fakeouts" sub="closed back inside within 15 min" tone="down" />
              <Big v={f1(o.both)} label="both sides broken" sub="% of days" />
            </div>
            <table className="ad-table sl-t"><thead><tr><th>Opening volume vs. its 20-day average</th><th className="r">Trades</th><th className="r">Winners</th><th className="r">Avg</th></tr></thead><tbody>
              <tr><td>High (RVOL ≥ 1.5)</td><td className="r num">{o.hiRvol.n}</td><td className="r num">{f1(o.hiRvol.win)}</td><td className={`r num ${o.hiRvol.avgR >= 0 ? 'up' : 'down'}`}>{fr(o.hiRvol.avgR)}</td></tr>
              <tr><td>Low (RVOL &lt; 1)</td><td className="r num">{o.loRvol.n}</td><td className="r num">{f1(o.loRvol.win)}</td><td className={`r num ${o.loRvol.avgR >= 0 ? 'up' : 'down'}`}>{fr(o.loRvol.avgR)}</td></tr>
            </tbody></table>
            <div className="sl-two">
              <div>
                <h4 className="sl-h">VWAP</h4>
                <div className="sl-grid three">
                  <Big v={f1(vw.sameSide)} label="close on the 10:30 side" sub={`${vw.days} days`} />
                  <Big v={f1(pct(vw.fromAbove.held, vw.fromAbove.n))} label="retests from above held" sub={`${vw.fromAbove.n} retests`} />
                  <Big v={f1(pct(vw.fromBelow.held, vw.fromBelow.n))} label="retests from below held" sub={`${vw.fromBelow.n} retests`} />
                </div>
                <p className="small muted">Held = still on the same side of VWAP 30 minutes after touching it. One-sided days after 10:00: {f1(vw.trendDays)}.</p>
              </div>
              <div>
                <h4 className="sl-h">Volume by time of day</h4>
                <div className="sl-vol">{vol.map((v) => <div key={v.label} className="sl-vrow"><span className="small">{v.label}</span><span className="sl-vbar"><i style={{ width: `${Math.min(100, (v.perHour / Math.max(...vol.map((x) => x.perHour))) * 100)}%` }} /></span><span className="small num">{f1(v.share)}</span></div>)}</div>
                <p className="small muted">Bar length = volume per hour; % = share of the session. Yahoo’s 5-minute bars leave out the closing-auction print, so the real last half hour is bigger than shown.</p>
              </div>
            </div>
            <div className="sl-two">
              <div>
                <h4 className="sl-h">Prior-day high / low sweeps · {sw.days} days</h4>
                <div className="sl-grid three">
                  <Big v={f1(sw.upRejected)} label="breaks of yesterday’s high that closed back below" sub={`${sw.upBreaks} days`} />
                  <Big v={f1(sw.dnRejected)} label="breaks of yesterday’s low that closed back above" sub={`${sw.dnBreaks} days`} />
                </div>
              </div>
              <div>
                <h4 className="sl-h">Same-day gap fills · {d.length} days</h4>
                <table className="ad-table sl-t"><thead><tr><th>Gap size</th><th className="r">Gaps up</th><th className="r">Filled</th><th className="r">Gaps down</th><th className="r">Filled</th></tr></thead><tbody>
                  {gaps.map((g) => <tr key={g.label}><td>{g.label}</td><td className="r num">{g.up.n}</td><td className="r num">{f1(pct(g.up.filled, g.up.n))}</td><td className="r num">{g.dn.n}</td><td className="r num">{f1(pct(g.dn.filled, g.dn.n))}</td></tr>)}
                </tbody></table>
              </div>
            </div>
            <p className="note">How it is measured: ORB enters at the range edge (or the open if a bar gaps past it), stops at the other side, and a bar that touches both stop and target counts as a loss. Bars where both sides break at once are skipped. Data: Yahoo Finance (unofficial, delayed). History, not a forecast; no costs, slippage or taxes. Learning material, not advice.</p>
          </>
        )}
      </section>

      <div className="ln-chips">{groups.map((g) => <button key={g} className={`chip sm ${group === g ? 'on' : ''}`} onClick={() => setGroup(g)}>{g}</button>)}</div>
      <div className="sl-cards">
        {SETUPS.filter((s) => group === 'All' || s.group === group).map((s) => { const line = statLine(s.stat); return (
          <article key={s.id} className="ad-card sl-card">
            <span className="ln-fam">{s.group}</span>
            <h3>{s.name}{s.aka && <span className="small muted"> · {s.aka}</span>}</h3>
            {line && <p className="sl-stat">{line}</p>}
            <dl className="ln-dl">
              <dt>What makes it</dt><dd><ul>{s.what.map((x) => <li key={x}>{x}</li>)}</ul></dd>
              <dt>Why it happens</dt><dd>{s.why}</dd>
              <dt>Watch for</dt><dd><ul>{s.watch.map((x) => <li key={x}>{x}</li>)}</ul></dd>
              <dt>How traders handle it</dt><dd>{s.trade}</dd>
              <dt>Wrong when</dt><dd>{s.invalid}</dd>
              {s.refs && <><dt>Sources</dt><dd><ul>{s.refs.map((r) => <li key={r.url + r.label}><a href={r.url} target="_blank" rel="noreferrer noopener">{r.label}</a></li>)}</ul></dd></>}
            </dl>
          </article>
        ); })}
      </div>
    </div>
  );
}
