// Global trends page: what is popular, new or launched country by country (and worldwide), from the database collected
// every 2 weeks (published/trends.json). Leads with trends spreading from one country to others; also each country's charts and
// what is new there since the last collection, things everywhere now, things big in one country only (copycat leads), worldwide AI models /
// GitHub projects / launches, and each language's most-read Wikipedia pages. Global research, not investment advice.
import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, REGIONS, SRC_LABEL, placeName, type CountrySum, type Row, type Src, type TrendSummary } from '../../shared/globaltrends';
import { usePersisted } from '../lib/store';
import { getDeskJson } from './PatentsSection';
import { Fresh, Seg } from './common';

type Resp = TrendSummary & { error?: string; errors?: string[]; source?: string };
type Tab = 'spread' | 'countries' | 'startups' | 'bans' | 'world' | 'wiki';
const money = (v: number | null | undefined) => (v == null ? '—' : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${v}`);
const edgar = (r: { cik: string; adsh: string }) => `https://www.sec.gov/Archives/edgar/data/${r.cik}/${r.adsh.replace(/-/g, '')}/`;
const flag = (cc: string) => (cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '🌐');
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const CHART_SRC: Src[] = ['apps-free', 'apps-paid', 'music', 'steam'];
/** the explanation lives in a small ⓘ tooltip instead of a paragraph */
const Info = ({ t }: { t: string }) => <i className="gtr-i" title={t} aria-label={t} role="img">ⓘ</i>;

function Name({ r }: { r: { name: string; url?: string; by?: string } }) {
  return <>{r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener">{r.name}</a> : r.name}{r.by && <span className="muted small"> · {r.by}</span>}</>;
}
const Trend = ({ t }: { t: number | null }) => (t == null || t === 0 ? null : <span className={`small ${t > 0 ? 'up' : 'down'}`} title="Places moved since the last collection">{t > 0 ? `▲${t}` : `▼${-t}`}</span>);

function RowList({ rows, empty }: { rows: Row[] | undefined; empty?: string }) {
  if (!rows?.length) return <p className="small muted">{empty ?? 'Nothing on this list.'}</p>;
  return <ol className="gtr-list">{rows.map((r) => <li key={r.id}><span className="num gtr-rank">{r.rank}</span><span className="gtr-name"><Name r={r} />{r.note && <span className="muted small gtr-note">{r.note}</span>}</span><Trend t={r.trend} /></li>)}</ol>;
}

/** "Everywhere now": a coverage bar and counts per row; the countries and ranks open on click (no wall of flags). */
function Wide({ rows, total }: { rows: TrendSummary['wide']; total: number }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <table className="ad-table gtr-t gtr-wide"><tbody>{rows.map((w) => {
      const n = w.places.length, ones = w.places.filter((p) => p.rank === 1).length, best = w.places[0];
      return <tr key={w.id} onClick={() => setOpen(open === w.id ? null : w.id)} className="gtr-click" title="Click for the countries">
        <td><Name r={w} /><div className="muted small">{SRC_LABEL[w.src]}</div>
          {open === w.id && <div className="gtr-flags small">{w.places.map((p) => <span key={p.cc} title={placeName(p.cc)}>{flag(p.cc)} {p.rank}</span>)}</div>}</td>
        <td className="gtr-cov"><span className="gtr-bar"><i style={{ width: `${(n / total) * 100}%` }} /></span><span className="small num">{n} / {total}{ones ? ` · #1 in ${ones}` : best ? ` · best #${best.rank}` : ''}</span></td>
      </tr>;
    })}</tbody></table>
  );
}

/** Ban headlines and US recalls, loaded when the tab is opened (Google News links make them heavy). */
function Bans() {
  const [b, setB] = useState<{ bans: TrendSummary['bans']; recalls: TrendSummary['recalls']; error?: string } | null>(null);
  useEffect(() => { getDeskJson<{ bans: TrendSummary['bans']; recalls: TrendSummary['recalls']; error?: string }>('/api/research?fn=trends&part=bans').then(setB).catch((e) => setB({ bans: [], recalls: [], error: (e as Error).message })); }, []);
  if (!b) return <section className="panel"><div className="gx-pad"><p className="small muted">Loading ban headlines…</p></div></section>;
  const d = b;
  return <>
        <section className="panel">
          <div className="gx-h"><b>Ban watch</b><span className="small muted">last 14 days</span><Info t="News of bans on apps, products, sales or imports, searched per country in its own language (Google News, an unofficial feed). Keyword matches: some headlines are about another country's ban or only mention one. No mainland China edition." /></div>
          <div className="gx-pad gtr-cols">{d.bans.filter((b) => b.items.length).map((b) => <div key={b.cc} className="fi-box"><h5>{flag(b.cc)} {b.name} <span className="muted small">{b.items.length}</span></h5><ul className="gtr-news">{b.items.map((n) => <li key={n.id}><a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a><span className="muted small"> · {n.source} · {day(n.date)}</span></li>)}</ul></div>)}</div>
        </section>
        <section className="panel">
          <div className="gx-h"><b>US recalls</b><span className="small muted">last 14 days</span><Info t="Consumer Product Safety Commission and FDA recalls." /></div>
          <div className="gx-pad"><ul className="gtr-news">{d.recalls.map((n) => <li key={n.id}>{n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> : n.title}<span className="muted small"> · {n.source} · {day(n.date)}</span></li>)}</ul></div>
        </section>
</>;
}

/** One country's lists, loaded when its tile is opened (the page itself carries only the tiles). */
function Country({ cc, warm, jump }: { cc: string; warm: boolean; jump: number }) {
  const [c, setC] = useState<CountrySum | null>(null), [err, setErr] = useState('');
  const top = useRef<HTMLDivElement>(null);
  // a tile was clicked: bring this country's data into view once it has loaded (no scrolling down by hand)
  useEffect(() => { if (jump && c?.cc === cc) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [jump, c, cc]);
  useEffect(() => { setC(null); setErr(''); getDeskJson<{ country?: CountrySum; error?: string }>(`/api/research?fn=trends&cc=${cc}`).then((j) => (j.country ? setC(j.country) : setErr(j.error ?? 'Not available'))).catch((e) => setErr((e as Error).message)); }, [cc]);
  if (err) return <p className="small down" ref={top}>{err}</p>;
  if (!c) return <p className="small muted">Loading {placeName(cc)}…</p>;
  return (
    <div className="gtr-country" ref={top}>
      <h4>{flag(c.cc)} {c.name}</h4>
      {!warm && <div className="fi-box"><h5>New since the last collection</h5><RowList rows={c.fresh} empty="Nothing new." /></div>}
      <div className="gtr-cols">{CHART_SRC.filter((s) => c.now[s]?.length).map((s) => <div key={s} className="fi-box"><h5>{SRC_LABEL[s]}</h5><RowList rows={c.now[s]} /></div>)}</div>
    </div>
  );
}

export default function GlobalTrendsPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [tab, setTab] = usePersisted<Tab>('gtTab', 'spread');
  const [cc, setCc] = usePersisted<string>('gtCountry', 'kr');
  const [jump, setJump] = useState(0);
  const pickCc = (x: string) => { setCc(x); setJump((n) => n + 1); };
  useEffect(() => { getDeskJson<Resp>('/api/research?fn=trends').then(setD).catch((e) => setD({ error: (e as Error).message } as Resp)); }, []);
  const c = d?.countries?.find((x) => x.cc === cc) ?? d?.countries?.[0];
  const maxHeat = Math.max(1, ...(d?.countries ?? []).map((x) => x.heat));
  return (
    <div className="pp gtr">
      <section className="panel">
        <div className="gx-h"><b>Global trends</b><span className="small muted">{d?.countries?.length ?? COUNTRIES.length} countries · every 2 weeks</span><Info t="What is getting popular, new or launched country by country, collected every 2 weeks from free public sources. Global research, not investment advice." />{d?.updated && <Fresh kind="eod" at={Date.parse(`${d.updated}T07:00:00Z`)} src={d.source} />}</div>
        <div className="gx-pad">
          {!d && <p className="small muted">Reading the trends database…</p>}
          {d?.error && <p className="small down">{d.error === 'not-run-yet' ? 'The collector has not run yet.' : d.error}</p>}
          {d && !d.error && <>
            <Seg value={tab} onChange={setTab} options={[{ id: 'spread', label: 'Spreading' }, { id: 'countries', label: 'Countries' }, { id: 'startups', label: 'Startups' }, { id: 'bans', label: 'Bans & recalls' }, { id: 'world', label: 'Worldwide' }, { id: 'wiki', label: 'What people read' }]} />
            {d.warmingUp && <p className="note small">First collection: "Spreading" and "new" start after the next one (1st or 15th of the month).</p>}
          </>}
        </div>
      </section>

      {d && !d.error && tab === 'spread' && <>
        <section className="panel">
          <div className="gx-h"><b>Spreading</b><Info t="On one country's charts first, then reaching others (apps, songs, games). A country's first collection never counts as a spread." /></div>
          <div className="gx-pad">
            {d.spreading.length ? (
              <table className="ad-table gtr-t"><thead><tr><th>What</th><th>First</th><th>Then</th><th className="r">Countries</th></tr></thead><tbody>
                {d.spreading.map((s) => <tr key={s.id}><td><Name r={s} /><div className="muted small">{SRC_LABEL[s.src]}</div></td><td className="small">{flag(s.origin)} {s.originName}<div className="muted">{day(s.originFirst)}</div></td>
                  <td className="small">{s.later.map((l) => <span key={l.where} className="chip sm" title={`Best rank ${l.best}`}>{flag(l.where)} {day(l.first)}</span>)}</td><td className="r num">{s.places}</td></tr>)}
              </tbody></table>
            ) : <p className="small muted">{d.warmingUp ? 'Nothing yet.' : 'Nothing has spread between countries yet.'}</p>}
          </div>
        </section>
        <div className="gtr-two">
          <section className="panel">
            <div className="gx-h"><b>Everywhere now</b><span className="small muted">{d.wideMin}+ of {d.countries.length} countries</span><Info t="On the charts in a quarter of the countries or more. Click a row for the countries and ranks." /></div>
            <div className="gx-pad"><Wide rows={d.wide} total={d.countries.length} /></div>
          </section>
          <section className="panel">
            <div className="gx-h"><b>Big in one country only</b><Info t="Top 10 there and on no other country's chart: copycat leads." /></div>
            <div className="gx-pad"><table className="ad-table gtr-t"><tbody>{d.local.slice(0, 60).map((r) => <tr key={r.id + r.cc}><td className="small">{flag(r.cc)}</td><td><Name r={r} /><div className="muted small">{SRC_LABEL[r.src]} · #{r.rank}</div></td></tr>)}</tbody></table></div>
          </section>
        </div>
      </>}

      {d && !d.error && tab === 'countries' && c && (
        <section className="panel">
          <div className="gx-h"><b>Countries</b><Info t="Click a country for its charts. Once there are two collections, the colour and number show how many new things reached its charts since the last one." /></div>
          <div className="gx-pad">
            {REGIONS.map((rg) => { const xs = d.countries.filter((x) => x.region === rg); return xs.length ? <div key={rg}><div className="small muted gtr-stack">{rg} · {xs.length}</div><div className="gtr-tiles">{xs.map((x) => <button key={x.cc} className={`gtr-tile ${x.cc === c.cc ? 'on' : ''}`} style={{ ['--h' as string]: d.warmingUp ? 0 : x.heat / maxHeat }} onClick={() => pickCc(x.cc)} title={d.warmingUp ? x.name : `${x.name}: ${x.heat} new since the last collection`}><span className="gtr-flag">{flag(x.cc)}</span><span className="small">{x.name}</span>{!d.warmingUp && <b className="num">{x.heat}</b>}</button>)}</div></div> : null; })}
            <Country cc={c.cc} warm={d.warmingUp} jump={jump} />
          </div>
        </section>
      )}

      {d && !d.error && tab === 'startups' && (() => { const r = d.startups; return <>
        <section className="panel">
          <div className="gx-h"><b>Startup radar</b><span className="small muted">US raises, last 7 days</span><Info t="SEC Form D filings: filed after a private sale of shares starts; &quot;sold so far&quot; is what the company reported. Investment funds and vehicles left out (by name, so a few may remain). Most startups raising from investors file one, but not all." /></div>
          <div className="gx-pad">
            {r.warmingUp && <p className="note small">"Surge" (twice an industry's usual pace) starts after 3 weeks of filings.</p>}
            <table className="ad-table gtr-t"><thead><tr><th>Industry</th><th className="r">Raises, 7 days</th><th className="r">Sold so far</th><th className="r">Usual per week</th><th className="r">Founded this / last year</th></tr></thead><tbody>
              {r.industries.map((x) => <tr key={x.industry}><td>{x.industry}{x.surge && <span className="chip sm up" title="At least 3 raises and twice the usual weekly pace">surge</span>}</td><td className="r num">{x.n7}</td><td className="r num">{money(x.sold7)}</td><td className="r num muted">{r.warmingUp ? '—' : x.perWeek}</td><td className="r num">{x.young7 || ''}</td></tr>)}
            </tbody></table>
          </div>
        </section>
        <div className="gtr-two">
          <section className="panel"><div className="gx-h"><b>Biggest raises, 7 days</b></div><div className="gx-pad"><table className="ad-table gtr-t"><tbody>{r.biggest.map((x) => <tr key={x.adsh}><td><a href={edgar(x)} target="_blank" rel="noreferrer noopener">{x.name}</a><div className="muted small">{x.industry} · {x.state}{x.yearInc ? ` · founded ${x.yearInc}` : ''}</div></td><td className="r num">{money(x.sold)}<div className="muted small">of {money(x.offering)}</div></td></tr>)}</tbody></table></div></section>
          <section className="panel"><div className="gx-h"><b>Young companies raising</b><Info t="Founded this year or last." /></div><div className="gx-pad"><table className="ad-table gtr-t"><tbody>{r.young.map((x) => <tr key={x.adsh}><td><a href={edgar(x)} target="_blank" rel="noreferrer noopener">{x.name}</a><div className="muted small">{x.industry} · {x.state} · founded {x.yearInc}</div></td><td className="r num">{money(x.sold)}</td></tr>)}</tbody></table>
            {!!r.states.length && <p className="small muted">By state (7 days): {r.states.map((x) => `${x.state} ${x.n}`).join(' · ')}</p>}</div></section>
        </div>
      </>; })()}

      {d && !d.error && tab === 'bans' && <Bans />}


      {d && !d.error && tab === 'world' && (
        <section className="panel">
          <div className="gx-h"><b>Worldwide</b></div>
          <div className="gx-pad gtr-cols">{(['ai-models', 'github', 'launches'] as Src[]).map((s) => <div key={s} className="fi-box"><h5>{SRC_LABEL[s]}</h5><RowList rows={d.world[s]} /></div>)}</div>
        </section>
      )}

      {d && !d.error && tab === 'wiki' && (
        <section className="panel">
          <div className="gx-h"><b>What people read</b><Info t="Most-read Wikipedia pages the day before each collection, by language: a stand-in for search trends." /></div>
          <div className="gx-pad gtr-cols">{d.wiki.map((w) => <div key={w.lang} className="fi-box"><h5>{w.lang.toUpperCase()} · {COUNTRIES.filter((x) => x.wiki === w.lang).map((x) => flag(x.cc)).join(' ')}</h5><RowList rows={w.rows} /></div>)}</div>
        </section>
      )}
      {d?.errors && d.errors.length > 0 && <p className="small muted gx-pad">Not collected last time: {d.errors.length} feed{d.errors.length === 1 ? '' : 's'} <Info t={d.errors.join(' · ')} /></p>}
    </div>
  );
}
