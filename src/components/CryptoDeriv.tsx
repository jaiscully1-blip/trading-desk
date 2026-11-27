// BTC / ETH page: perpetual futures across exchanges (OKX, Kraken Futures, Deribit, Hyperliquid): funding as a yearly rate,
// open interest per venue, OKX's 90-day open-interest line, its long / short account ratio vs the last 30 days, and its
// latest liquidations. Public market data; facts, not advice. Nothing here can trade.
import { useEffect, useState } from 'react';
import type { Venue } from '../../shared/cryptoderiv';
import { Fresh, Q } from './common';

interface Coin { coin: string; venues: Venue[]; oi: { last: number | null; d1: number | null; d7: number | null; d30: number | null; series: [number, number][] }; longShort: { last: number | null; pctile: number | null; min: number | null; max: number | null }; liq: { longUsd: number; shortUsd: number; n: number; spanMin: number | null } | null; notes: string[] }
interface Resp { coins: Coin[]; errors: string[]; asOf: number; source: string }
const usd = (x: number | null | undefined) => (x == null ? '—' : x >= 1e9 ? `$${(x / 1e9).toFixed(2)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(0)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(0)}K` : `$${Math.round(x)}`);
const pc = (x: number | null) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const span = (m: number | null) => (m == null ? '' : m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

function Line({ s }: { s: [number, number][] }) {
  if (s.length < 3) return null;
  const v = s.map((r) => r[1]), lo = Math.min(...v), hi = Math.max(...v), W = 220, H = 40;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * W).toFixed(1)},${(H - 2 - ((y - lo) / (hi - lo || 1)) * (H - 4)).toFixed(1)}`).join(' ');
  return <svg className="cd-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="OKX open interest, last 90 days"><polyline points={pts} fill="none" stroke="var(--link)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
}

export function CryptoDeriv() {
  const [d, setD] = useState<Resp | null>(null), [err, setErr] = useState('');
  useEffect(() => {
    let stop = false;
    const go = () => fetch('/api/research?fn=cryptoderiv').then(async (r) => { const j = await r.json(); if (stop) return; if (r.ok) { setD(j); setErr(''); } else setErr(j.error ?? `HTTP ${r.status}`); }).catch((e) => { if (!stop) setErr((e as Error).message); });
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, 120_000);
    return () => { stop = true; clearInterval(id); };
  }, []);
  return (
    <section className="panel cd">
      <div className="gx-h"><Q k="delayed" src="OKX, Kraken Futures, Deribit, Hyperliquid public market data, refreshed every 2 minutes" /><b>Derivatives across exchanges</b><span className="small muted">perpetual futures: who pays funding, how much is open, who got liquidated</span>{d && <Fresh kind="delayed" at={d.asOf} src={`Refreshed about every 2 min. ${d.source}`} />}</div>
      {err && <p className="small down gx-pad">{err}</p>}
      {!d && !err && <p className="small muted gx-pad">Reading four exchanges…</p>}
      {d && <div className="cd-grid">
        {d.coins.map((c) => {
          const tot = c.venues.reduce((a, v) => a + (v.oiUsd ?? 0), 0), ls = c.longShort;
          return (
            <div key={c.coin} className="cd-card">
              <h4>{c.coin}</h4>
              <table className="cs-t"><thead><tr><th>Venue</th><th title="Funding as a yearly rate: positive = longs pay shorts">Funding / yr</th><th>Open interest</th></tr></thead>
                <tbody>{c.venues.map((v) => <tr key={v.venue}><td>{v.venue}</td><td className={`num ${v.aprPct == null ? '' : v.aprPct > 0 ? 'up' : 'down'}`}>{v.aprPct == null ? '—' : `${v.aprPct.toFixed(1)}%`}</td><td className="num">{usd(v.oiUsd)}</td></tr>)}
                  <tr className="cd-tot"><td>These venues</td><td /><td className="num">{usd(tot)}</td></tr></tbody></table>
              <div className="cd-row"><span className="small">OKX open interest, 90 days <span className="muted">(all its {c.coin} contracts)</span></span><Line s={c.oi.series} /><span className="small num">1d {pc(c.oi.d1)} · 7d {pc(c.oi.d7)} · 30d {pc(c.oi.d30)}</span></div>
              {ls.last != null && <div className="cd-row"><span className="small">OKX accounts long vs short: <b className="num">{ls.last}</b> to 1</span>
                <span className="cd-range" title={`30-day range ${ls.min} to ${ls.max}`}><i style={{ left: `${ls.pctile}%` }} /></span>
                <span className="small muted">{ord(ls.pctile ?? 0)} percentile of the last 30 days ({ls.min} to {ls.max})</span></div>}
              {c.liq && <p className="small">Latest {c.liq.n} OKX liquidations ({span(c.liq.spanMin)}): longs <b className="down">{usd(c.liq.longUsd)}</b> · shorts <b className="up">{usd(c.liq.shortUsd)}</b></p>}
              {c.notes.length > 0 && <ul className="small cd-notes">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
            </div>
          );
        })}
      </div>}
      {d && <p className="small muted gx-pad">Funding is paid between longs and shorts to keep the perpetual near the spot price; it is shown as a yearly rate so hourly and 8-hourly venues compare. Hyperliquid's funding includes a fixed ~11%-a-year interest part, so it rarely goes below that. The account ratio counts accounts, not money. OKX only publishes its latest ~100 liquidations, so that line is a snapshot, not a daily total. Bybit, Binance futures and BitMEX block US servers. Facts, not advice.</p>}
      {d && d.errors.length > 0 && <p className="small muted gx-pad">Not loaded this time: {d.errors.join(' · ')}</p>}
    </section>
  );
}
