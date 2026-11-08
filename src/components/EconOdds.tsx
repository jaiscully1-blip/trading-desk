// Economic odds: what prediction markets (Kalshi, Polymarket) price for the Fed, recession, inflation, jobs and the S&P.
import type { ReactNode } from 'react';
import type { EconCard, EconEvent } from '../../shared/econodds';
import type { PmEvent } from '../../shared/polymarket';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import { Fresh } from './common';

const P = (p: number) => `${Math.round(p * 100)}%`;
const when = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
const tone = (label: string) => (/cut|lower|decrease|below|no recession/i.test(label) ? 'eo-dove' : /hike|raise|increase|higher/i.test(label) ? 'eo-hawk' : /hold|maintain|unchanged|no change/i.test(label) ? 'eo-hold' : '');

function Gauge({ p }: { p: number }) {
  const a = Math.PI * (1 - p), r = 52, cx = 64, cy = 60;
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  return (
    <svg viewBox="0 0 128 72" className="eo-gauge" aria-label={`${P(p)} chance`}>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} className="eo-g-bg" />
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${x.toFixed(1)},${y.toFixed(1)}`} className="eo-g-fg" style={{ stroke: p >= 0.5 ? 'var(--down)' : p >= 0.25 ? 'var(--warn)' : 'var(--up)' }} />
      <text x={cx} y={cy - 6} textAnchor="middle" className="eo-g-t">{P(p)}</text>
    </svg>
  );
}

function Spark({ pts, label }: { pts: [number, number][]; label: string | null }) {
  const W = 260, H = 46;
  const lo = Math.min(...pts.map((p) => p[1])), hi = Math.max(...pts.map((p) => p[1]));
  const pad = Math.max(0.02, (hi - lo) * 0.1);
  const y = (v: number) => H - 4 - ((v - (lo - pad)) / (hi - lo + 2 * pad || 1)) * (H - 8);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, pts.length - 1)) * W).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
  const chg = pts[pts.length - 1][1] - pts[0][1];
  return (
    <div className="eo-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"><path d={d} /></svg>
      <span className="small muted">{label ? `“${label}” ` : ''}90 days: {P(pts[0][1])} → {P(pts[pts.length - 1][1])} <b className={chg >= 0 ? 'up' : 'down'}>{chg >= 0 ? '+' : ''}{Math.round(chg * 100)} pts</b></span>
    </div>
  );
}

function Stack({ e }: { e: EconEvent }) {
  const os = [...e.outcomes].sort((a, b) => (tone(a.label) === 'eo-dove' ? -1 : tone(b.label) === 'eo-dove' ? 1 : 0) || b.p - a.p);
  const tot = os.reduce((s, o) => s + o.p, 0) || 1;
  return (
    <div className="eo-meet">
      <div className="small"><b>{e.title.replace(/^Fed(eral Reserve)? decision in /i, '') || when(e.closes)}</b> <span className="muted">· {when(e.closes)}</span></div>
      <div className="eo-stack">{os.filter((o) => o.p >= 0.01).map((o) => <i key={o.ticker} className={tone(o.label) || 'eo-other'} style={{ flexGrow: o.p / tot }} title={`${o.label}: ${P(o.p)}`}>{o.p / tot > 0.12 ? `${o.label} ${P(o.p)}` : ''}</i>)}</div>
    </div>
  );
}

function Ladder({ e }: { e: EconEvent }) {
  return (
    <div className="eo-ladder">
      {e.outcomes.slice(0, 10).map((o) => (
        <div key={o.ticker} className="pm-m"><span className="pm-q" title={o.label}>{o.label}</span><span className="pm-bar"><i style={{ width: P(o.p) }} /></span><b className="num">{P(o.p)}</b></div>
      ))}
    </div>
  );
}

function Card({ c }: { c: EconCard }) {
  const e = c.events[0];
  return (
    <section className={`eo-card ${c.id === 'fed' ? 'wide' : ''}`}>
      <div className="eo-h"><b>{c.title}</b><a className="small muted" href={c.url} target="_blank" rel="noreferrer noopener">Kalshi ↗</a></div>
      <p className="small muted">{c.why}</p>
      {c.id === 'fed' ? c.events.map((ev) => <Stack key={ev.event} e={ev} />)
        : c.binary ? <div className="eo-bin"><Gauge p={e.outcomes[0].p} /><span className="small">{e.title}<br /><span className="muted">resolves {when(e.closes)}</span></span></div>
          : <><div className="small">{e.title} <span className="muted">· {when(e.closes)}</span></div><Ladder e={e} /></>}
      {c.history && c.history.length > 2 && <Spark pts={c.history} label={c.binary ? null : c.histLabel} />}
    </section>
  );
}

export default function EconOdds({ mode, extra }: { mode: DataMode; extra?: ReactNode }) {
  const live = mode.kind === 'live';
  const k = useApi<{ cards: EconCard[]; errors: Record<string, string>; asOf: number; source: string }>(live ? '/api/research?fn=econ-odds' : null, 10 * 60_000, 5 * 60_000);
  const pm = useApi<{ events: PmEvent[]; asOf: number }>(live ? '/api/research?fn=polymarket&tag=economy' : null, 10 * 60_000, 5 * 60_000);
  return (
    <div className="overlay" role="dialog" aria-label="Economic odds">
      <div className="overlay-in sm">
        <div className="phead">
          <div className="phead-title">Economic odds&nbsp;<span className="muted small">what traders are betting on</span></div>
          <div className="phead-ctl">{extra}{live && k.data && <Fresh kind="live" at={k.data.asOf} src={k.data.source} />}</div>
        </div>
        <div className="sm-body">
          {!live && <p className="hw-pad muted"><Fresh kind="demo" /> Odds come from live prediction markets, so this page needs the live desk.</p>}
          {live && k.loading && !k.data && <p className="hw-pad muted">Loading Kalshi markets…</p>}
          {live && k.error && !k.data && <p className="hw-pad down small">Kalshi: {k.error}</p>}
          {k.data && <div className="eo-grid">{k.data.cards.map((c) => <Card key={c.id} c={c} />)}</div>}
          {pm.data && pm.data.events.length > 0 && (
            <section className="eo-pm">
              <div className="eo-h"><b>Polymarket: most-traded economy questions</b><Fresh kind="live" at={pm.data.asOf} src="Polymarket public prices" /></div>
              <div className="eo-pm-grid">{pm.data.events.slice(0, 8).map((ev) => (
                <div key={ev.url || ev.title} className="pm-e">
                  <div className="pm-t">{ev.url ? <a href={ev.url} target="_blank" rel="noreferrer noopener">{ev.title}</a> : ev.title}</div>
                  {ev.markets.slice(0, 4).map((m) => { const y = m.outcomes.find((o) => /^yes$/i.test(o.name)) ?? m.outcomes[0]; return <div key={m.q} className="pm-m"><span className="pm-q" title={m.q}>{ev.markets.length > 1 ? m.q : y.name}</span><span className="pm-bar"><i style={{ width: P(y.p) }} /></span><b className="num">{P(y.p)}</b></div>; })}
                </div>
              ))}</div>
            </section>
          )}
          {live && <p className="note">Prices are what traders pay for “yes”, so 70% ≈ the crowd’s 70% odds. Kalshi is a CFTC-regulated US exchange; Polymarket is a crypto market. Thin markets can be off. Ladders like “above X” are cumulative, not separate buckets.</p>}
        </div>
      </div>
    </div>
  );
}
