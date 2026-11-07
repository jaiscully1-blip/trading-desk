// Insider trades (SEC Form 4), Polymarket odds, and the Monte Carlo trade simulator.
import { useEffect, useMemo, useState } from 'react';
import type { HomeData } from './HomeWidgets';
import type { InsiderTx } from '../../shared/insider';
import { insiderSummary } from '../../shared/insider';
import type { PmEvent } from '../../shared/polymarket';
import { modelRs, monteCarlo } from '../../shared/montecarlo';
import { DEMO_AT, rng } from '../lib/demo';
import { pct, sUsd, tone } from '../lib/format';
import { Fresh, Seg, SymInfo } from './common';

type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }
const big$ = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);

/* ---------------- insider trades ---------------- */
const insCache = new Map<string, { txs: InsiderTx[]; note?: string; asOf: number }>();
export function InsiderW({ d, cfg, set }: P) {
  const sym: string = (cfg.sym ?? d.sel ?? 'NVDA').toUpperCase();
  const [draft, setDraft] = useState(sym);
  const [only, setOnly] = useState<'market' | 'all'>(cfg.only ?? 'market');
  const [st, setSt] = useState<{ txs: InsiderTx[]; note?: string; asOf?: number; error?: string; loading?: boolean }>({ txs: [] });
  const live = d.mode.kind === 'live';
  useEffect(() => setDraft(sym), [sym]);
  useEffect(() => {
    if (!live) {
      const r = rng(sym.length * 7);
      setSt({ txs: Array.from({ length: 6 }, (_, i) => { const code = r() < 0.7 ? 'S' : 'P', sh = Math.round(500 + r() * 20000), px = 100 + r() * 50; return { date: new Date(DEMO_AT - i * 6 * 86400_000).toISOString().slice(0, 10), filed: '', who: `Insider ${String.fromCharCode(65 + i)} (sample)`, role: i % 2 ? 'Director' : 'Officer', code, kind: code === 'P' ? 'Buy' : 'Sell', shares: sh, price: px, value: sh * px, after: null, url: '' }; }), asOf: DEMO_AT });
      return;
    }
    const hit = insCache.get(sym);
    if (hit) { setSt(hit); return; }
    let stop = false;
    setSt({ txs: [], loading: true });
    fetch(`/api/research?fn=insider&symbol=${encodeURIComponent(sym)}`).then(async (r) => {
      const j = await r.json(); if (stop) return;
      if (r.ok) { const v = { txs: j.txs, note: j.note, asOf: j.asOf }; insCache.set(sym, v); setSt(v); } else setSt({ txs: [], error: j.error });
    }).catch((e) => !stop && setSt({ txs: [], error: String(e) }));
    return () => { stop = true; };
  }, [sym, live]);
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const sum = insiderSummary(st.txs, since);
  const rows = st.txs.filter((t) => only === 'all' || t.code === 'P' || t.code === 'S');
  return (
    <div className="hw-col">
      <form className="hw-bar" onSubmit={(e) => { e.preventDefault(); set({ ...cfg, sym: draft.trim().toUpperCase() }); }}>
        <input className="cg-in" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" />
        <button className="btn" type="submit">Look up</button>
        <Seg value={only} onChange={(v) => { setOnly(v); set({ ...cfg, only: v }); }} options={[{ id: 'market', label: 'Buys & sells' }, { id: 'all', label: 'All' }]} />
        {live ? <Fresh kind={st.txs.length ? 'delayed' : 'nodata'} at={st.asOf} src="SEC EDGAR Form 4: filed within 2 business days of the trade" /> : <Fresh kind="demo" />}
      </form>
      <div className="cg-sum small"><SymInfo sym={sym} /> · last 90 days: <b className="up">{sum.buys} buys {sum.buyValue ? big$(sum.buyValue) : ''}</b> · <b className="down">{sum.sells} sells {sum.sellValue ? big$(sum.sellValue) : ''}</b></div>
      {st.error && <p className="hw-pad small down">{st.error}</p>}
      {st.note && <p className="hw-pad small muted">{st.note}</p>}
      {st.loading && <p className="hw-pad small muted">Reading Form 4 filings…</p>}
      <div className="wb-tbl">
        {rows.slice(0, 60).map((t, i) => (
          <div key={i} className="ins-r">
            <span className="num small muted" title={t.date}>{t.date.slice(5)}</span>
            <span className="cg-who" title={t.role}><b>{t.who}</b> <span className="muted small">{t.role}</span></span>
            <span className={t.code === 'P' ? 'up' : t.code === 'S' ? 'down' : 'muted'}>{t.kind}</span>
            <span className="num small">{t.value != null ? big$(t.value) : `${Math.round(t.shares).toLocaleString()} sh`}</span>
            {t.url ? <a className="small" href={t.url} target="_blank" rel="noreferrer noopener" title="The filing on SEC.gov">↗</a> : <span />}
          </div>
        ))}
        {!st.loading && !st.error && !st.note && !rows.length && <p className="hw-pad small muted">No {only === 'market' ? 'open-market buys or sells' : 'insider transactions'} in the latest 15 filings.</p>}
      </div>
      <p className="note hw-pad">Buys with their own money (code P) are the rare, telling ones; most sells are planned (10b5-1) or for taxes. Awards and option exercises show under “All”.</p>
    </div>
  );
}

/* ---------------- Polymarket ---------------- */
const TOPICS = [{ id: 'economy', label: 'Economy' }, { id: 'fed-rates', label: 'Fed' }, { id: 'geopolitics', label: 'Geopolitics' }, { id: 'business', label: 'Business' }, { id: 'crypto', label: 'Crypto' }];
export function PolymarketW({ d, cfg, set }: P) {
  const tag: string = cfg.tag ?? 'economy';
  const [st, setSt] = useState<{ events: PmEvent[]; asOf?: number; error?: string }>({ events: [] });
  const live = d.mode.kind === 'live';
  useEffect(() => {
    if (!live) { setSt({ events: [{ title: 'Fed decision in December? (sample)', url: '', vol24: 1e6, ends: null, markets: [{ q: '25 bp cut', outcomes: [{ name: 'Yes', p: 0.72 }, { name: 'No', p: 0.28 }], vol24: 1 }, { q: 'No change', outcomes: [{ name: 'Yes', p: 0.25 }, { name: 'No', p: 0.75 }], vol24: 1 }] }], asOf: DEMO_AT }); return; }
    let stop = false, t: ReturnType<typeof setTimeout>;
    const go = async () => {
      try { const r = await fetch(`/api/research?fn=polymarket&tag=${tag}`); const j = await r.json(); if (!stop) setSt(r.ok ? { events: j.events, asOf: j.asOf } : { events: [], error: j.error }); } catch (e) { if (!stop) setSt({ events: [], error: String(e) }); }
      if (!stop) t = setTimeout(go, 5 * 60_000);
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [tag, live]);
  return (
    <div className="hw-col">
      <div className="hw-bar">
        <Seg value={tag} onChange={(v) => set({ ...cfg, tag: v })} options={TOPICS} />
        {live ? <Fresh kind={st.events.length ? 'live' : 'nodata'} at={st.asOf} src="Polymarket public prices, refreshed every 5 min" /> : <Fresh kind="demo" />}
      </div>
      {st.error && <p className="hw-pad small down">{st.error}</p>}
      <div className="wb-tbl">
        {st.events.map((e) => (
          <div key={e.url || e.title} className="pm-e">
            <div className="pm-t">{e.url ? <a href={e.url} target="_blank" rel="noreferrer noopener">{e.title}</a> : e.title}{e.ends && <span className="muted small"> · ends {e.ends}</span>}</div>
            {e.markets.map((m) => {
              const yes = m.outcomes.find((o) => /^yes$/i.test(o.name)) ?? m.outcomes[0];
              return (
                <div key={m.q} className="pm-m">
                  <span className="pm-q" title={m.q}>{e.markets.length > 1 || m.q !== e.title ? m.q : yes.name}</span>
                  <span className="pm-bar"><i style={{ width: `${Math.round(yes.p * 100)}%` }} /></span>
                  <b className="num">{Math.round(yes.p * 100)}%</b>
                </div>
              );
            })}
          </div>
        ))}
        {live && !st.error && !st.events.length && <p className="hw-pad small muted">No open questions on this topic right now.</p>}
      </div>
      <p className="note hw-pad">Prices are what traders pay for “yes”, so 72% ≈ the crowd’s odds. Thin markets can be off; check the volume on Polymarket.</p>
    </div>
  );
}

/* ---------------- Monte Carlo ---------------- */
function Fan({ bands }: { bands: { i: number; p5: number; p50: number; p95: number }[] }) {
  const W = 300, H = 120, n = bands.at(-1)?.i || 1;
  const lo = Math.min(0, ...bands.map((b) => b.p5)), hi = Math.max(0, ...bands.map((b) => b.p95));
  const x = (i: number) => (i / n) * W, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const area = `M${bands.map((b) => `${x(b.i)},${y(b.p95)}`).join(' L')} L${[...bands].reverse().map((b) => `${x(b.i)},${y(b.p5)}`).join(' L')} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mc-fan" role="img" aria-label="Range of outcomes by trade number">
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="mc-zero" />
      <path d={area} className="mc-band" />
      <path d={`M${bands.map((b) => `${x(b.i)},${y(b.p50)}`).join(' L')}`} className="mc-mid" />
      <text x={W - 2} y={y(bands.at(-1)!.p95) + 10} className="mc-lab" textAnchor="end">95th pct</text>
      <text x={W - 2} y={y(bands.at(-1)!.p5) - 3} className="mc-lab" textAnchor="end">5th pct</text>
    </svg>
  );
}
export function SimW({ d, cfg, set }: P) {
  const src: 'mine' | 'model' = cfg.src ?? 'mine';
  const risk: number = cfg.risk ?? d.riskPct ?? 0.5, n: number = cfg.n ?? 50;
  const wr: number = cfg.wr ?? 45, aw: number = cfg.aw ?? 2, al: number = cfg.al ?? 1;
  const mine = d.trades.filter((t) => t.r != null).map((t) => t.r!) ;
  const rs = src === 'mine' ? mine : modelRs(wr / 100, aw, al);
  const res = useMemo(() => monteCarlo({ rs, riskPct: risk, trades: n, runs: 4000 }), [rs.join(','), risk, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (k: string, v: number, step: number, min: number, max: number, label: string, suffix = '') => (
    <label className="mc-in">{label}<input type="number" value={v} step={step} min={min} max={max} onChange={(e) => set({ ...cfg, [k]: Math.max(min, Math.min(max, +e.target.value || min)) })} />{suffix}</label>
  );
  return (
    <div className="hw-col">
      <div className="hw-bar">
        <Seg value={src} onChange={(v) => set({ ...cfg, src: v })} options={[{ id: 'mine', label: `My trades (${mine.length})` }, { id: 'model', label: 'What if…' }]} />
      </div>
      <div className="mc-ins">
        {src === 'model' && <>{num('wr', wr, 1, 1, 99, 'Win rate', '%')}{num('aw', aw, 0.1, 0.1, 20, 'Avg win', 'R')}{num('al', al, 0.1, 0.1, 20, 'Avg loss', 'R')}</>}
        {num('risk', risk, 0.25, 0.1, 10, 'Risk/trade', '%')}{num('n', n, 10, 10, 500, 'Next', ' trades')}
      </div>
      {src === 'mine' && mine.length < 20 && <p className="hw-pad small warn-txt">{mine.length ? `Only ${mine.length} closed trades with a stop logged: treat these odds as rough.` : 'No closed trades with a logged stop yet. Import your CSV or use “What if…”.'}</p>}
      {res && (
        <>
          <div className="mc-kpis">
            <span>Edge <b className={`num ${tone(res.expectancyR)}`}>{res.expectancyR >= 0 ? '+' : ''}{res.expectancyR.toFixed(2)}R</b><small>per trade</small></span>
            <span>Ends up <b className="num">{Math.round(res.pUp * 100)}%</b><small>of the time</small></span>
            <span>Typical result <b className={`num ${tone(res.endPct.p50)}`}>{pct(res.endPct.p50, 1)}</b><small>median</small></span>
            <span>Bad case <b className={`num ${tone(res.endPct.p5)}`}>{pct(res.endPct.p5, 1)}</b><small>1 in 20</small></span>
          </div>
          <Fan bands={res.bands} />
          <div className="mc-dd small">Chance of a drawdown of 10%+: <b>{Math.round(res.pDd10 * 100)}%</b> · 20%+: <b>{Math.round(res.pDd20 * 100)}%</b> · 30%+: <b>{Math.round(res.pDd30 * 100)}%</b> · typical worst dip {res.medianMaxDd.toFixed(1)}%{d.equity ? ` (≈ ${sUsd(-(d.equity * res.medianMaxDd) / 100)})` : ''}</div>
        </>
      )}
      <p className="note hw-pad">4,000 simulated runs of the next {n} trades, each drawn at random from {src === 'mine' ? 'your own closed trades’ R results' : 'the win rate and averages above'}, risking {risk}% of equity per trade. It assumes the future looks like the sample: no fees, no slippage, no tilt.</p>
    </div>
  );
}

/* ---------------- TradingAgents (AI analyst team on GitHub Actions) ---------------- */
interface TaIdx { ticker: string; date: string; ranAt: string; decision?: string; error?: string }
interface TaRec extends TaIdx { reports?: { id: string; who: string; text: string }[]; models?: { provider?: string; deep?: string; quick?: string } }
const ratingOf = (d?: string) => /\b(strong\s+)?buy\b|overweight/i.test(d ?? '') ? 'up' : /\bsell\b|underweight/i.test(d ?? '') ? 'down' : '';
const firstLine = (d?: string) => (d ?? '').split('\n').map((x) => x.replace(/[*#>`]/g, '').trim()).find((x) => x) ?? '';
export function AgentsW({ d }: P) {
  const live = d.mode.kind === 'live';
  const [idx, setIdx] = useState<{ items: TaIdx[]; repo?: string; error?: string } | null>(null);
  const [open, setOpen] = useState<TaRec | null>(null);
  useEffect(() => {
    if (!live) { setIdx({ items: [{ ticker: 'NVDA', date: '2026-11-06', ranAt: '', decision: 'OVERWEIGHT (sample): strong data-center demand, but extended after the run-up; add on pullbacks.' }] }); return; }
    fetch('/api/research?fn=agents').then((r) => r.json()).then(setIdx).catch((e) => setIdx({ items: [], error: String(e) }));
  }, [live]);
  const load = (t: string) => { if (!live) return; fetch(`/api/research?fn=agents&ticker=${t}`).then((r) => r.json()).then(setOpen).catch(() => {}); };
  return (
    <div className="hw-col">
      <div className="hw-bar">
        {open && <button className="btn" onClick={() => setOpen(null)}>← All</button>}
        <span className="small muted">TradingAgents · Gemini</span>
        {live ? <Fresh kind={idx?.items.length ? 'eod' : 'nodata'} src="TradingAgents on GitHub Actions, after each close" /> : <Fresh kind="demo" />}
      </div>
      {idx?.error === 'not-run-yet' && <div className="hw-pad small"><p>No results yet. The analysts run after every weekday close, or now: GitHub → your repo → <b>Actions</b> → <b>TradingAgents</b> → <b>Run workflow</b> (type tickers, or leave empty for agents/tickers.txt). A run takes 5–15 minutes per ticker. If your repo is private, the desk also needs a <code>GITHUB_TOKEN</code> in Vercel to read the results.</p></div>}
      {idx?.error && idx.error !== 'not-run-yet' && <p className="hw-pad small down">{idx.error}</p>}
      {!open && (
        <div className="wb-tbl">
          {idx?.items.map((r) => (
            <button key={r.ticker} className="ta-r" onClick={() => load(r.ticker)}>
              <b className="wl-sym">{r.ticker}</b>
              <span className={`ta-d ${r.error ? 'down' : ratingOf(r.decision)}`}>{r.error ? `Run failed: ${r.error.slice(0, 80)}` : firstLine(r.decision).slice(0, 140)}</span>
              <span className="num small muted">{r.date}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="wb-tbl hw-pad ta-open">
          <h5>{open.ticker} · {open.date}</h5>
          <p className={`ta-dec ${ratingOf(open.decision)}`}>{open.decision || open.error}</p>
          {open.reports?.map((r) => <details key={r.id}><summary>{r.who}</summary><div className="ta-txt">{r.text}</div></details>)}
          {open.models && <p className="small muted">Models: {open.models.deep} / {open.models.quick}</p>}
        </div>
      )}
      <p className="note hw-pad">An open-source team of AI analysts debating a ticker (github.com/TauricResearch/TradingAgents). It’s research, not a signal: check its claims against the filings and the chart. Change the list in agents/tickers.txt.</p>
    </div>
  );
}
