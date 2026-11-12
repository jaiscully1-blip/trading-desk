// Global → US page: how the world is trading, the US-listed funds and ADRs that carry it into US hours, how each
// market's day has lined up with SPY over two years, and world business headlines tagged by region and US ticker.
// History, not a forecast; nothing here says to buy or sell.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import type { WorldNews } from '../../shared/global';
import { useDesk } from '../lib/deskctx';
import { Fresh, Q, Star } from './common';

interface Quote { last: number; chgPct: number; at: number | null }
interface Link { versus: 'SPY open gap' | 'SPY day'; n: number; corr: number; beta: number; bigDays: number; sameWayPct: number | null }
interface GlobalData {
  regions: { id: string; label: string; indexes: { sym: string; label: string; quote: Quote | null; link: Link | null; implied: number | null }[]; us: { sym: string; label: string; quote: Quote | null }[] }[];
  overnight: string; futures: Quote | null; asOf: number; source: string;
}

function useJson<T>(url: string | null, everyMs: number) {
  const [st, setSt] = useState<{ d: T | null; err: string | null }>({ d: null, err: null });
  useEffect(() => {
    if (!url) return;
    let stop = false;
    const go = () => fetch(url).then(async (r) => { const j = await r.json(); if (!stop) setSt(r.ok ? { d: j, err: null } : (s) => ({ d: s.d, err: j.error ?? `HTTP ${r.status}` })); }).catch((e) => !stop && setSt((s) => ({ d: s.d, err: s.d ? null : String(e) })));
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, everyMs);
    return () => { stop = true; clearInterval(id); };
  }, [url, everyMs]);
  return st;
}
const pct = (v: number | null | undefined, d = 2) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
const tone = (v: number | null | undefined) => (v == null ? 'muted' : v >= 0 ? 'up' : 'down');
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60_000); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };

export default function GlobalPage({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  const live = mode.kind === 'live';
  const g = useJson<GlobalData>(live ? '/api/research?fn=global' : null, 90_000);
  const n = useJson<{ items: WorldNews[]; errors: Record<string, string>; asOf: number; source: string }>(live ? '/api/research?fn=globalnews' : null, 5 * 60_000);
  const [region, setRegion] = useState<string>('all');
  const { openArticle } = useDesk();
  const news = useMemo(() => (n.d?.items ?? []).filter((x) => region === 'all' || (region === 'none' ? !x.regions.length : x.regions.includes(region))), [n.d, region]);
  if (!live) return <div className="page"><section className="panel"><p className="hw-pad muted">The Global page needs the live desk (world markets and news). Nothing is shown in demo mode.</p></section></div>;
  return (
    <div className="page gl">
      <section className="panel">
        <div className="phead"><div className="phead-title">Global → US&nbsp;<span className="muted small">how the world is trading and how it has carried into US stocks</span></div>
          <div className="phead-ctl">{g.d && <Fresh kind="delayed" at={g.d.asOf} src={g.d.source} />}</div></div>
        {g.err && !g.d && <p className="hw-pad small down">{g.err}</p>}
        {!g.d && !g.err && <p className="hw-pad small muted">Loading world markets… (the first load reads two years of history for each market)</p>}
        {g.d?.overnight && <p className="gl-over">{g.d.overnight}</p>}
      </section>
      {g.d && (
        <div className="gl-grid">
          {g.d.regions.map((r) => (
            <section key={r.id} className={`panel gl-card ${region === r.id ? 'on' : ''}`}>
              <div className="gl-h"><b>{r.label}</b><button className="link small" onClick={() => setRegion(region === r.id ? 'all' : r.id)}>{region === r.id ? 'all news' : 'its news'}</button></div>
              {r.indexes.map((i) => (
                <div key={i.sym} className="gl-idx">
                  <div className="gl-idx-h"><span>{i.label}</span><b className={`num ${tone(i.quote?.chgPct)}`}>{pct(i.quote?.chgPct)}</b></div>
                  {i.link && (
                    <div className="small muted gl-link" title={`${i.link.n} days of history. Correlation ${i.link.corr.toFixed(2)}; fitted ${i.link.beta.toFixed(2)}% SPY per 1% ${i.label}.`}>
                      <Q k="calc" src="Two years of daily closes (Yahoo), calculated on the desk" />
                      vs {i.link.versus}: correlation <b className="num">{i.link.corr.toFixed(2)}</b>
                      {i.link.sameWayPct != null && <> · on its ±1% days SPY went the same way <b className="num">{i.link.sameWayPct.toFixed(0)}%</b> of {i.link.bigDays}</>}
                      {i.implied != null && <> · today's move has lined up with <b className={`num ${tone(i.implied)}`}>{pct(i.implied)}</b> for SPY</>}
                    </div>
                  )}
                </div>
              ))}
              {!r.indexes.length && <p className="small muted">No single index; the US-listed names below carry it.</p>}
              <div className="gl-us">
                {r.us.map((u) => (
                  <span key={u.sym} className="gl-tk" title={u.label}><Star sym={u.sym} /><button className="wl-sym" onClick={() => onChart(u.sym)}>{u.sym}</button><span className={`num small ${tone(u.quote?.chgPct)}`}>{u.quote ? pct(u.quote.chgPct, 1) : ''}</span></span>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      <section className="panel gl-news">
        <div className="phead"><div className="phead-title">World business news</div>
          <div className="phead-ctl">
            <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
              <option value="all">All regions</option>{g.d?.regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}<option value="none">No region named</option>
            </select>
            {n.d && <Fresh kind="live" at={n.d.asOf} src={n.d.source} />}
          </div></div>
        <div className="gl-list">
          {news.slice(0, 80).map((x) => (
            <div key={x.id} className="gl-row">
              <span className="num small muted">{ago(x.t)}</span>
              <button className="link gl-t" onClick={() => openArticle({ title: x.title, url: x.url, src: x.src, t: x.t, summary: x.summary, syms: x.syms })}>{x.title}</button>
              <span className="gl-tags small">{x.syms.slice(0, 4).map((s) => <button key={s} className="chip sm" onClick={() => onChart(s)}>{s}</button>)}<span className="muted"> {x.src}</span></span>
            </div>
          ))}
          {n.d && !news.length && <p className="hw-pad small muted">No headlines for this region in the last two days.</p>}
          {!n.d && <p className="hw-pad small muted">Loading world headlines…</p>}
        </div>
        {n.d && Object.keys(n.d.errors).length > 0 && <p className="note small">Feeds not answering right now: {Object.keys(n.d.errors).join(', ')}.</p>}
        <p className="note small">Headlines are tagged by the places and US companies they name; the tickers are the US-listed funds and ADRs that trade that region. Market and economy stories only.</p>
      </section>
    </div>
  );
}
