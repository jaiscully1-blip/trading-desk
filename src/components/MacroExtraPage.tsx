// Macro & Policy: earnings-season beat rates by sector, tariff actions and the companies talking about tariffs most,
// and policy / macro prediction-market odds next to the sector baskets they tend to move. Data, not advice.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import { Fresh } from './common';
import { useSnapshot } from '../data/apis';

const pc = (v: number | null | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`);
function Card({ title, src, children }: { title: string; src?: string; children: React.ReactNode }) {
  return <section className="ad-card"><header className="ad-h"><h3>{title}</h3>{src && <Fresh kind="delayed" src={src} />}</header>{children}</section>;
}

export default function MacroExtraPage({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  const live = mode.kind === 'live';
  const [d, setD] = useState<any>(null);
  useEffect(() => { if (live) fetch('/api/research?fn=macroextra').then((r) => r.json()).then(setD).catch((e) => setD({ errors: { all: String(e) } })); }, [live]);
  const snap = useSnapshot(live).data?.snap ?? {};
  const b = d?.board;
  return (
    <div className="page ad">
      <div className="ad-top"><h2>Macro &amp; Policy</h2><span className="small muted">Earnings season, tariffs and what the prediction markets expect, with the stocks each touches. Data, not advice.</span></div>
      {!live && <p className="small muted">Live data only.</p>}
      {live && !d && <p className="small muted">Loading…</p>}
      {d && (
        <div className="ad-grid">
          <Card title="Earnings season scoreboard · last 6 weeks" src="Finnhub earnings calendar: reported EPS and revenue vs the consensus estimate">
            {d.errors?.board && <p className="small down">{d.errors.board}</p>}
            {b && <>
              <div className="ad-stats">
                <div className="ad-stat"><span className="ad-k">S&amp;P 500 / Nasdaq-100 reported</span><b className="num">{b.total.reported}</b><span className="small muted">{b.from} to {b.to}</span></div>
                <div className="ad-stat"><span className="ad-k">Beat on EPS</span><b className="num up">{pc(b.total.epsBeatPct)}</b><span className="small muted">long-run norm is about 75%</span></div>
                <div className="ad-stat"><span className="ad-k">Beat on revenue</span><b className="num">{pc(b.total.revBeatPct)}</b><span className="small muted">median EPS surprise {pc(b.total.avgSurprise, 1)}</span></div>
              </div>
              <table className="ad-table"><thead><tr><th>Sector</th><th className="r">Reported</th><th className="r">EPS beat</th><th className="r">Revenue beat</th><th className="r">Median surprise</th></tr></thead><tbody>
                {b.sectors.map((s: any) => <tr key={s.sector}><td>{s.sector}</td><td className="r num">{s.reported}</td><td className={`r num ${(s.epsBeatPct ?? 0) >= 70 ? 'up' : (s.epsBeatPct ?? 100) < 60 ? 'down' : ''}`}>{pc(s.epsBeatPct)}</td><td className="r num">{pc(s.revBeatPct)}</td><td className="r num">{pc(s.avgSurprise, 1)}</td></tr>)}
              </tbody></table>
            </>}
          </Card>
          <Card title="Policy odds · and what they move" src="Polymarket public API (crowd odds; real-money bets, not forecasts)">
            {d.errors?.odds && <p className="small down">{d.errors.odds}</p>}
            {!d.odds?.length ? <p className="small muted">No macro or policy markets right now.</p> : (
              <table className="ad-table"><thead><tr><th>Question</th><th className="r">Odds</th><th>Moves</th></tr></thead><tbody>
                {d.odds.map((o: any) => <tr key={o.url}><td><a href={o.url} target="_blank" rel="noreferrer noopener">{o.title}</a>{o.top && <span className="small muted"> · {o.top}</span>}{o.ends && <span className="small muted"> · ends {o.ends}</span>}</td><td className="r num">{o.yes == null ? '—' : `${Math.round(o.yes * 100)}%`}</td>
                  <td className="small">{o.baskets.map((bk: any, i: number) => <span key={i} title={bk.why}>{bk.etfs.map((e: string) => { const q = snap[e]; return <button key={e} className="chip sm" onClick={() => onChart(e)}>{e}{q ? <span className={q.c >= 0 ? 'up' : 'down'}> {q.c >= 0 ? '+' : ''}{q.c.toFixed(1)}%</span> : null}</button>; })}</span>)}</td></tr>)}
              </tbody></table>
            )}
          </Card>
          <Card title="Tariff tracker · new federal actions" src="Federal Register API (official), newest first">
            {d.errors?.tariffs && <p className="small down">{d.errors.tariffs}</p>}
            {d.tariffs && <ul className="es-news">{d.tariffs.actions.map((a: any, i: number) => <li key={i}><span className="num small muted">{a.date}</span> <a href={a.url} target="_blank" rel="noreferrer noopener">{a.title}</a> <span className="small muted">{a.agency}{a.type ? ` · ${a.type}` : ''}</span></li>)}</ul>}
          </Card>
          <Card title="Tariff exposure · companies talking about it" src="SEC EDGAR full-text search: 10-Q and 10-K filings in the last ~100 days that discuss tariffs, best matches first">
            {d.tariffs && (!d.tariffs.companies.length ? <p className="small muted">No matches.</p> : <>
              <div className="tl-chips">{d.tariffs.companies.map((c: any) => <button key={c.ticker} className={`chip sm ${c.big ? 'on' : ''}`} onClick={() => onChart(c.ticker)} title={`${c.name} · ${c.form} filed ${c.date}`}>{c.ticker}</button>)}</div>
              <p className="note">Highlighted: S&amp;P 500 / Nasdaq-100 members. Mentioning tariffs isn't the same as being hurt by them: open the filing (Company page) to see what they say.</p>
            </>)}
          </Card>
        </div>
      )}
    </div>
  );
}
