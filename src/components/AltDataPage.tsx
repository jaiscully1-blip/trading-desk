// Alt Data: for one ticker, the free "outside the price" signals: hiring (public job boards), App Store rank, public interest
// (Wikipedia pageviews) around earnings, developer activity (GitHub), players (Steam), Reddit mentions and StockTwits mood.
// Below: a grocery and energy price basket (BLS via FRED) as an inflation read. Each shows its change over ~1 month and ~1 year.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { Fresh } from './common';
import { spike, trend } from '../../shared/altdata';

type Pt = { date: string; value: number };
interface AltResp {
  sym: string; updated: string; days: number; source: string; error?: string;
  jobs: { board: [string, string]; s: Pt[] } | null; apps: { publishers: string[]; s: Pt[] } | null;
  steam: { id: number; name: string; s: Pt[] }[]; github: { org: string; s: Pt[]; latest: { repos: number; pushed30: number; stars: number } | null } | null;
  reddit: Pt[]; twits: Pt[]; coverage: { jobs: string[]; apps: string[]; steam: string[]; github: string[] };
}
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const pc = (v: number | null | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}%`);
const tn = (v: number | null | undefined, invert = false) => (v == null ? '' : (invert ? -v : v) >= 0 ? 'up' : 'down');
const BOARD_URL: Record<string, (s: string) => string> = { gh: (s) => `https://boards.greenhouse.io/${s}`, lv: (s) => `https://jobs.lever.co/${s}`, ab: (s) => `https://jobs.ashbyhq.com/${s}` };

function Line({ s, marks = [], invert = false, h = 70 }: { s: Pt[]; marks?: { date: string; label: string }[]; invert?: boolean; h?: number }) {
  if (s.length < 2) return <p className="small muted ad-wait">{s.length ? 'One reading so far: the trend line starts tomorrow.' : 'No readings yet.'}</p>;
  const w = 600, lo = Math.min(...s.map((x) => x.value)), hi = Math.max(...s.map((x) => x.value)), span = hi - lo || 1;
  const t0 = Date.parse(s[0].date), t1 = Date.parse(s[s.length - 1].date), tw = t1 - t0 || 1;
  const X = (d: string) => ((Date.parse(d) - t0) / tw) * w, Y = (v: number) => { const f = (v - lo) / span; return 4 + (invert ? f : 1 - f) * (h - 8); };
  return (
    <svg className="ad-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Trend">
      {marks.filter((m) => m.date >= s[0].date && m.date <= s[s.length - 1].date).map((m) => <line key={m.date} x1={X(m.date)} x2={X(m.date)} y1={0} y2={h} className="ad-mark"><title>{m.label}</title></line>)}
      <polyline points={s.map((p) => `${X(p.date).toFixed(1)},${Y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Stat({ label, t, unit = '', invert = false, places = false }: { label: string; t: ReturnType<typeof trend>; unit?: string; invert?: boolean; places?: boolean }) {
  const f = (v: number | null) => (v == null ? '—' : places ? `${v > 0 ? '▼' : v < 0 ? '▲' : ''}${Math.abs(v)} places` : pc(v));
  return (
    <div className="ad-stat">
      <span className="ad-k">{label}</span>
      <b className="num">{t.last == null ? '—' : `${places ? '#' : ''}${t.last.toLocaleString()}${unit}`}</b>
      <span className="small"><span className={tn(t.d30, invert)}>{f(t.d30)}</span> · 30 days &nbsp; <span className={tn(t.d365, invert)}>{f(t.d365)}</span> · 1 year</span>
    </div>
  );
}

function Card({ title, src, children, empty }: { title: string; src?: string; children: React.ReactNode; empty?: string }) {
  return <section className="ad-card"><header className="ad-h"><h3>{title}</h3>{src && <Fresh kind="eod" src={src} />}</header>{empty ? <p className="small muted">{empty}</p> : children}</section>;
}

function Interest({ sym, live }: { sym: string; live: boolean }) {
  const [wv, setWv] = useState<{ title: string; days: Pt[]; url: string; source: string; error?: string } | null>(null);
  const [earn, setEarn] = useState<string[]>([]);
  const [bars, setBars] = useState<{ time: number; close: number }[]>([]);
  useEffect(() => {
    if (!live) return;
    setWv(null); setEarn([]); setBars([]);
    fetch(`/api/research?fn=wikiviews&symbol=${sym}`).then((r) => r.json()).then(setWv).catch(() => {});
    const now = new Date(), from = new Date(now.getTime() - 730 * 86400_000).toISOString().slice(0, 10);
    fetch(`/api/research?fn=range&symbol=${sym}&from=${from}&to=${now.toISOString().slice(0, 10)}`).then((r) => r.json()).then((j) => setEarn((j.filings ?? []).filter((f: any) => f.earnings).map((f: any) => f.date))).catch(() => {});
    fetch(`/api/research?fn=bars&symbol=${sym}&tf=1d`).then((r) => r.json()).then((j) => setBars(j.bars ?? [])).catch(() => {});
  }, [sym, live]);
  const days = wv?.days ?? [];
  const monthly = useMemo(() => { const m = new Map<string, number>(); for (const d of days) m.set(d.date.slice(0, 7), (m.get(d.date.slice(0, 7)) ?? 0) + d.value); return [...m.entries()].map(([k, v]) => ({ date: `${k}-01`, value: v })); }, [days]);
  const full = monthly.slice(0, -1);
  const tm = trend(full);
  // around each earnings report: views in the 3 days from the report vs the 30 days before, and the stock's 3-day move
  const rows = earn.map((d) => {
    const i = days.findIndex((x) => x.date >= d);
    const after = i >= 0 ? days.slice(i, i + 3) : [], before = i >= 30 ? days.slice(i - 30, i) : [];
    const ratio = after.length && before.length ? (after.reduce((s, x) => s + x.value, 0) / after.length) / (before.reduce((s, x) => s + x.value, 0) / before.length) : null;
    const b = bars.findIndex((x) => new Date(x.time * 1000).toISOString().slice(0, 10) >= d);
    const move = b >= 1 ? (bars[Math.min(bars.length - 1, b + 2)].close / bars[b - 1].close - 1) * 100 : null;
    return { d, ratio, move };
  }).reverse();
  return (
    <Card title="Public interest · Wikipedia views" src={wv?.source} empty={!live ? 'Live data only.' : wv?.error ? wv.error : undefined}>
      {!wv && <p className="small muted">Loading…</p>}
      {wv && !wv.error && (
        <>
          <div className="ad-stats"><Stat label={`Views a month · ${wv.title}`} t={tm} /></div>
          <Line s={days} marks={earn.map((d) => ({ date: d, label: `Earnings ${d}` }))} />
          <p className="small muted">Daily views of the <a href={wv.url} target="_blank" rel="noreferrer noopener">Wikipedia article</a>; lines mark earnings reports. Google search volume has no free API, so this stands in for it.</p>
          {rows.length > 0 && (
            <table className="ad-table"><thead><tr><th>Earnings</th><th className="r">Attention (3 days vs prior month)</th><th className="r">Stock, 3 days</th></tr></thead><tbody>
              {rows.map((r) => <tr key={r.d}><td>{r.d}</td><td className="r num">{r.ratio == null ? '—' : `${r.ratio.toFixed(1)}×`}</td><td className={`r num ${tn(r.move)}`}>{pc(r.move, 1)}</td></tr>)}
            </tbody></table>
          )}
        </>
      )}
    </Card>
  );
}

function Social({ sym, d, live }: { sym: string; d: AltResp | null; live: boolean }) {
  const [st, setSt] = useState<{ watchers: number | null; n: number; bull: number; bear: number; perHour: number | null; source: string; error?: string } | null>(null);
  useEffect(() => { if (!live) return; setSt(null); fetch(`/api/research?fn=stocktwits&symbol=${sym}`).then((r) => r.json()).then(setSt).catch(() => {}); }, [sym, live]);
  const red = d?.reddit ?? [], sp = spike(red);
  return (
    <Card title="Social · Reddit and StockTwits" src="ApeWisdom (Reddit mentions, 24 h) and StockTwits public stream">
      <div className="ad-stats">
        <Stat label="Reddit mentions (24 h)" t={trend(red)} />
        <div className="ad-stat"><span className="ad-k">Spike vs last 7 days</span><b className={`num ${sp && sp >= 2 ? 'warn' : ''}`}>{sp == null ? '—' : `${sp.toFixed(1)}×`}</b><span className="small muted">{sp && sp >= 2 ? 'Unusual chatter: check the news and short interest' : 'Needs a week of readings'}</span></div>
        {st && !st.error && <div className="ad-stat"><span className="ad-k">StockTwits now</span><b className="num">{st.watchers?.toLocaleString() ?? '—'}</b><span className="small">watchers · <span className="up">{st.bull} bullish</span> / <span className="down">{st.bear} bearish</span> of {st.n} · {st.perHour ? `${st.perHour.toFixed(0)}/h` : ''}</span></div>}
        {d && d.twits.length > 0 && <Stat label="StockTwits watchers" t={trend(d.twits)} />}
      </div>
      <Line s={red} />
      <p className="small muted">A mentions spike with a price that hasn't moved yet, plus high short interest, is the classic squeeze setup to research (not a signal by itself).</p>
    </Card>
  );
}

function Basket({ live }: { live: boolean }) {
  const [b, setB] = useState<{ items: { id: string; name: string; unit: string; s: Pt[] }[]; source: string } | null>(null);
  useEffect(() => { if (live) fetch('/api/research?fn=pricebasket').then((r) => r.json()).then(setB).catch(() => {}); }, [live]);
  return (
    <Card title="Price basket · groceries and energy" src={b?.source} empty={!live ? 'Live data only.' : undefined}>
      {!b && <p className="small muted">Loading…</p>}
      {b && (
        <table className="ad-table"><thead><tr><th>Item</th><th className="r">Latest</th><th className="r">Month</th><th className="r">Year</th><th>2 years</th></tr></thead><tbody>
          {b.items.map((it) => { const s = it.s, last = s.at(-1), prev = s.at(-2), y = s.at(-13);
            return <tr key={it.id}><td>{it.name} <span className="small muted">{it.unit}</span></td><td className="r num">{last ? `$${last.value.toFixed(it.id.endsWith('72610') ? 3 : 2)}` : '—'}</td>
              <td className={`r num ${tn(last && prev ? last.value - prev.value : null, true)}`}>{last && prev ? pc((last.value / prev.value - 1) * 100, 1) : '—'}</td>
              <td className={`r num ${tn(last && y ? last.value - y.value : null, true)}`}>{last && y ? pc((last.value / y.value - 1) * 100, 1) : '—'}</td>
              <td className="ad-mini"><Line s={s} h={22} /></td></tr>; })}
        </tbody></table>
      )}
      {b && <p className="small muted">Latest month: {b.items[0]?.s.at(-1)?.date.slice(0, 7)}. Red = getting more expensive.</p>}
    </Card>
  );
}

export default function AltDataPage({ mode, sel }: { mode: DataMode; sel: string }) {
  const live = mode.kind === 'live';
  const [sym, setSym] = usePersisted<string>('altSym', 'HOOD');
  const [draft, setDraft] = useState(sym);
  const [d, setD] = useState<AltResp | null>(null);
  useEffect(() => { if (!live || !SYM_RE.test(sym)) return; setD(null); fetch(`/api/research?fn=altdata&symbol=${sym}`).then((r) => r.json()).then(setD).catch(() => {}); }, [sym, live]);
  const cov = d?.coverage;
  const covered = cov ? [...new Set([...cov.jobs, ...cov.apps, ...cov.steam, ...cov.github])].sort() : [];
  const go = (s: string) => { const v = s.trim().toUpperCase(); if (SYM_RE.test(v)) { setSym(v); setDraft(v); } };
  const since = d?.days ? `${d.days} day${d.days === 1 ? '' : 's'} of snapshots` : '';
  return (
    <div className="page ad">
      <div className="ad-top">
        <h2>Alt Data</h2>
        <form onSubmit={(e) => { e.preventDefault(); go(draft); }}><input value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase())} aria-label="Ticker" maxLength={10} /></form>
        {sel && sel !== sym && <button className="chip sm" onClick={() => go(sel)}>Use {sel}</button>}
        <span className="small muted">{since}{d?.updated ? ` · last ${new Date(d.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
      </div>
      {covered.length > 0 && <div className="ad-cov"><span className="small muted">Tracked daily:</span>{covered.map((s) => <button key={s} className={`chip sm ${s === sym ? 'on' : ''}`} onClick={() => go(s)}>{s}</button>)}</div>}
      {!live && <p className="small muted">Live data only.</p>}
      {d?.error === 'not-run-yet' && <p className="small muted">The daily snapshot hasn't run yet. It runs every evening (GitHub Action "Alt data").</p>}
      <div className="ad-grid">
        <Card title="Hiring · open jobs" src={d?.source} empty={d && !d.jobs ? `${sym}'s job board isn't on a public Greenhouse, Lever or Ashby board the desk can read. Covered: ${cov?.jobs.join(', ')}.` : undefined}>
          {d?.jobs && <><div className="ad-stats"><Stat label="Open roles" t={trend(d.jobs.s)} /></div><Line s={d.jobs.s} /><a className="small" href={BOARD_URL[d.jobs.board[0]](d.jobs.board[1])} target="_blank" rel="noreferrer noopener">See the job board</a></>}
        </Card>
        <Card title="App Store rank · US top free" src={d?.source} empty={d && !d.apps ? `No app tracked for ${sym}. Covered: ${cov?.apps.join(', ')}.` : undefined}>
          {d?.apps && <><div className="ad-stats"><Stat label={d.apps.publishers.join(' / ')} t={trend(d.apps.s, 'diff')} places invert /></div><Line s={d.apps.s} invert /><p className="small muted">{d.apps.s.length ? 'Lower is better. Missing days mean it fell out of the top 100.' : 'Not in the top 100 today.'} Google Play has no free ranking feed.</p></>}
        </Card>
        <Interest sym={sym} live={live} />
        <Social sym={sym} d={d} live={live} />
        <Card title="Developer activity · GitHub" src={d?.source} empty={d && !d.github ? `No public GitHub org mapped for ${sym}. Covered: ${cov?.github.join(', ')}.` : undefined}>
          {d?.github && <><div className="ad-stats"><Stat label="Repos pushed in 30 days" t={trend(d.github.s)} />{d.github.latest && <div className="ad-stat"><span className="ad-k">Public repos · stars on active ones</span><b className="num">{d.github.latest.repos.toLocaleString()}</b><span className="small muted">{d.github.latest.stars.toLocaleString()} stars</span></div>}</div><Line s={d.github.s} /><a className="small" href={`https://github.com/${d.github.org}`} target="_blank" rel="noreferrer noopener">github.com/{d.github.org}</a></>}
        </Card>
        <Card title="Players · Steam" src={d?.source} empty={d && !d.steam.length ? `No Steam games tracked for ${sym}. Covered: ${cov?.steam.join(', ')}.` : undefined}>
          {d?.steam.map((g) => <div key={g.id} className="ad-game"><div className="ad-stats"><Stat label={g.name} t={trend(g.s)} /></div><Line s={g.s} h={40} /></div>)}
          {d?.steam.length ? <p className="small muted">Players online at about 6 pm ET each day (one reading a day).</p> : null}
        </Card>
      </div>
      <Basket live={live} />
    </div>
  );
}
