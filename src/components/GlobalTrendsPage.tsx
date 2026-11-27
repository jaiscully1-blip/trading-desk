// Global trends page: what is popular, new or launched country by country (and worldwide), from the nightly database
// (published/trends.json). Leads with trends spreading from one country to others; also each country's charts and
// what is new there this week, things everywhere now, things big in one country only (copycat leads), worldwide AI models /
// GitHub projects / launches, and each language's most-read Wikipedia pages. Global research, not investment advice.
import { useEffect, useState } from 'react';
import { COUNTRIES, SRC_LABEL, placeName, type CountrySum, type Row, type Src, type TrendSummary } from '../../shared/globaltrends';
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

function Name({ r }: { r: { name: string; url?: string; by?: string } }) {
  return <>{r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener">{r.name}</a> : r.name}{r.by && <span className="muted small"> · {r.by}</span>}</>;
}
const Trend = ({ t }: { t: number | null }) => (t == null || t === 0 ? null : <span className={`small ${t > 0 ? 'up' : 'down'}`} title="Places moved vs about a week ago">{t > 0 ? `▲${t}` : `▼${-t}`}</span>);

function RowList({ rows, empty }: { rows: Row[] | undefined; empty?: string }) {
  if (!rows?.length) return <p className="small muted">{empty ?? 'Nothing tonight.'}</p>;
  return <ol className="gtr-list">{rows.map((r) => <li key={r.id}><span className="num gtr-rank">{r.rank}</span><span className="gtr-name"><Name r={r} />{r.note && <span className="muted small gtr-note">{r.note}</span>}</span><Trend t={r.trend} /></li>)}</ol>;
}

function Country({ c, warm }: { c: CountrySum; warm: boolean }) {
  return (
    <div className="gtr-country">
      <h4>{flag(c.cc)} {c.name}</h4>
      {!warm && <div className="fi-box"><h5>New on its charts this week</h5><RowList rows={c.fresh} empty="Nothing new this week." /></div>}
      <div className="gtr-cols">{CHART_SRC.filter((s) => c.now[s]?.length).map((s) => <div key={s} className="fi-box"><h5>{SRC_LABEL[s]}</h5><RowList rows={c.now[s]} /></div>)}</div>
    </div>
  );
}

export default function GlobalTrendsPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [tab, setTab] = usePersisted<Tab>('gtTab', 'spread');
  const [cc, setCc] = usePersisted<string>('gtCountry', 'kr');
  useEffect(() => { getDeskJson<Resp>('/api/research?fn=trends').then(setD).catch((e) => setD({ error: (e as Error).message } as Resp)); }, []);
  const c = d?.countries?.find((x) => x.cc === cc) ?? d?.countries?.[0];
  const maxHeat = Math.max(1, ...(d?.countries ?? []).map((x) => x.heat));
  return (
    <div className="pp gtr">
      <section className="panel">
        <div className="gx-h"><b>Global trends</b><span className="small muted">what is getting popular, new or launched in {d?.countries?.length ?? COUNTRIES.length} countries · research, not investment advice</span>{d?.updated && <Fresh kind="eod" at={Date.parse(`${d.updated}T07:00:00Z`)} src={d.source} />}</div>
        <div className="gx-pad">
          {!d && <p className="small muted">Reading the trends database…</p>}
          {d?.error && <p className="small down">{d.error === 'not-run-yet' ? 'The nightly collector has not run yet.' : d.error}</p>}
          {d && !d.error && <>
            <Seg value={tab} onChange={setTab} options={[{ id: 'spread', label: 'Spreading' }, { id: 'countries', label: 'Countries' }, { id: 'startups', label: 'Startups' }, { id: 'bans', label: 'Bans & recalls' }, { id: 'world', label: 'Worldwide' }, { id: 'wiki', label: 'What people read' }]} />
            {d.warmingUp && <p className="note small">The database is {d.nights} night{d.nights === 1 ? '' : 's'} old. "Spreading" and "new this week" need a few nights to compare (from about {day(new Date(Date.parse(`${d.updated}T12:00:00Z`) + (4 - d.nights) * 86400_000).toISOString().slice(0, 10))}); until then this shows tonight's charts.</p>}
          </>}
        </div>
      </section>

      {d && !d.error && tab === 'spread' && <>
        <section className="panel">
          <div className="gx-h"><b>Spreading</b><span className="small muted">on one country's charts first, then others · apps, songs, games</span></div>
          <div className="gx-pad">
            {d.spreading.length ? (
              <table className="ad-table gtr-t"><thead><tr><th>What</th><th>First</th><th>Then</th><th className="r">Countries</th></tr></thead><tbody>
                {d.spreading.map((s) => <tr key={s.id}><td><Name r={s} /><div className="muted small">{SRC_LABEL[s.src]}</div></td><td className="small">{flag(s.origin)} {s.originName}<div className="muted">{day(s.originFirst)}</div></td>
                  <td className="small">{s.later.map((l) => <span key={l.where} className="chip sm" title={`Best rank ${l.best}`}>{flag(l.where)} {day(l.first)}</span>)}</td><td className="r num">{s.places}</td></tr>)}
              </tbody></table>
            ) : <p className="small muted">{d.warmingUp ? 'Nothing yet: every chart entry started tonight, so nothing has had time to spread.' : 'Nothing has spread between countries in the database window.'}</p>}
          </div>
        </section>
        <div className="gtr-two">
          <section className="panel">
            <div className="gx-h"><b>Everywhere now</b><span className="small muted">on the charts in {d.wideMin} or more of the {d.countries.length} countries</span></div>
            <div className="gx-pad"><table className="ad-table gtr-t"><tbody>{d.wide.map((w) => <tr key={w.id}><td><Name r={w} /><div className="muted small">{SRC_LABEL[w.src]}</div></td><td className="small">{w.places.map((p) => <span key={p.cc} title={`${placeName(p.cc)}: #${p.rank}`} className="gtr-fl">{flag(p.cc)}<sub>{p.rank}</sub></span>)}</td></tr>)}</tbody></table></div>
          </section>
          <section className="panel">
            <div className="gx-h"><b>Big in one country only</b><span className="small muted">top 10 there, on no other country's chart: copycat leads</span></div>
            <div className="gx-pad"><table className="ad-table gtr-t"><tbody>{d.local.slice(0, 60).map((r) => <tr key={r.id + r.cc}><td className="small">{flag(r.cc)}</td><td><Name r={r} /><div className="muted small">{SRC_LABEL[r.src]} · #{r.rank}</div></td></tr>)}</tbody></table></div>
          </section>
        </div>
      </>}

      {d && !d.error && tab === 'countries' && c && (
        <section className="panel">
          <div className="gx-h"><b>Countries</b><span className="small muted">{d.warmingUp ? 'tonight\'s charts (new-this-week counts start once the database is a few nights old)' : 'colour = how many new things reached its charts this week'}</span></div>
          <div className="gx-pad">
            <div className="gtr-tiles">{d.countries.map((x) => <button key={x.cc} className={`gtr-tile ${x.cc === c.cc ? 'on' : ''}`} style={{ ['--h' as string]: d.warmingUp ? 0 : x.heat / maxHeat }} onClick={() => setCc(x.cc)} title={d.warmingUp ? x.name : `${x.name}: ${x.heat} new this week`}><span className="gtr-flag">{flag(x.cc)}</span><span className="small">{x.name}</span>{!d.warmingUp && <b className="num">{x.heat}</b>}</button>)}</div>
            <Country c={c} warm={d.warmingUp} />
          </div>
        </section>
      )}

      {d && !d.error && tab === 'startups' && (() => { const r = d.startups; return <>
        <section className="panel">
          <div className="gx-h"><b>Startup radar</b><span className="small muted">US companies raising money in the last 7 days (SEC Form D) · investment funds left out · filings since {day(r.from)}</span></div>
          <div className="gx-pad">
            {r.warmingUp && <p className="note small">Only {r.weeks} week{r.weeks === 1 ? '' : 's'} of earlier filings so far: "surge" (an industry raising at least twice its usual pace) switches on after 3 weeks.</p>}
            <table className="ad-table gtr-t"><thead><tr><th>Industry</th><th className="r">Raises, 7 days</th><th className="r">Sold so far</th><th className="r">Usual per week</th><th className="r">Founded this / last year</th></tr></thead><tbody>
              {r.industries.map((x) => <tr key={x.industry}><td>{x.industry}{x.surge && <span className="chip sm up" title="At least 3 raises and twice the usual weekly pace">surge</span>}</td><td className="r num">{x.n7}</td><td className="r num">{money(x.sold7)}</td><td className="r num muted">{r.warmingUp ? '—' : x.perWeek}</td><td className="r num">{x.young7 || ''}</td></tr>)}
            </tbody></table>
            <p className="note small">Form D is filed after a private sale of shares starts; "sold so far" is what the company reported at filing. Most startups raising from investors file one, but not all.</p>
          </div>
        </section>
        <div className="gtr-two">
          <section className="panel"><div className="gx-h"><b>Biggest raises, 7 days</b></div><div className="gx-pad"><table className="ad-table gtr-t"><tbody>{r.biggest.map((x) => <tr key={x.adsh}><td><a href={edgar(x)} target="_blank" rel="noreferrer noopener">{x.name}</a><div className="muted small">{x.industry} · {x.state}{x.yearInc ? ` · founded ${x.yearInc}` : ''}</div></td><td className="r num">{money(x.sold)}<div className="muted small">of {money(x.offering)}</div></td></tr>)}</tbody></table></div></section>
          <section className="panel"><div className="gx-h"><b>Young companies raising</b><span className="small muted">founded this year or last</span></div><div className="gx-pad"><table className="ad-table gtr-t"><tbody>{r.young.map((x) => <tr key={x.adsh}><td><a href={edgar(x)} target="_blank" rel="noreferrer noopener">{x.name}</a><div className="muted small">{x.industry} · {x.state} · founded {x.yearInc}</div></td><td className="r num">{money(x.sold)}</td></tr>)}</tbody></table>
            {!!r.states.length && <p className="small muted">By state (7 days): {r.states.map((x) => `${x.state} ${x.n}`).join(' · ')}</p>}</div></section>
        </div>
      </>; })()}

      {d && !d.error && tab === 'bans' && <>
        <section className="panel">
          <div className="gx-h"><b>Ban watch</b><span className="small muted">news of bans on apps, products, sales or imports, by country, in its own language (last 14 days)</span></div>
          <div className="gx-pad gtr-cols">{d.bans.filter((b) => b.items.length).map((b) => <div key={b.cc} className="fi-box"><h5>{flag(b.cc)} {b.name} <span className="muted small">{b.items.length}</span></h5><ul className="gtr-news">{b.items.map((n) => <li key={n.id}><a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a><span className="muted small"> · {n.source} · {day(n.date)}</span></li>)}</ul></div>)}</div>
          <p className="note small gx-pad">Headlines from Google News searches (an unofficial feed), matched by words like "ban" in each language: some are about another country's ban or only mention one. There is no mainland China edition.</p>
        </section>
        <section className="panel">
          <div className="gx-h"><b>US recalls</b><span className="small muted">Consumer Product Safety Commission and FDA, last 14 days</span></div>
          <div className="gx-pad"><ul className="gtr-news">{d.recalls.map((n) => <li key={n.id}>{n.url ? <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> : n.title}<span className="muted small"> · {n.source} · {day(n.date)}</span></li>)}</ul></div>
        </section>
      </>}

      {d && !d.error && tab === 'world' && (
        <section className="panel">
          <div className="gx-h"><b>Worldwide</b><span className="small muted">not tied to one country</span></div>
          <div className="gx-pad gtr-cols">{(['ai-models', 'github', 'launches'] as Src[]).map((s) => <div key={s} className="fi-box"><h5>{SRC_LABEL[s]}</h5><RowList rows={d.world[s]} /></div>)}</div>
        </section>
      )}

      {d && !d.error && tab === 'wiki' && (
        <section className="panel">
          <div className="gx-h"><b>What people read</b><span className="small muted">most-read Wikipedia pages yesterday, by language (a stand-in for search trends) · {COUNTRIES.length} countries share {d.wiki.length} languages</span></div>
          <div className="gx-pad gtr-cols">{d.wiki.map((w) => <div key={w.lang} className="fi-box"><h5>{w.lang.toUpperCase()} · {COUNTRIES.filter((x) => x.wiki === w.lang).map((x) => flag(x.cc)).join(' ')}</h5><RowList rows={w.rows} /></div>)}</div>
        </section>
      )}
      {d?.errors && d.errors.length > 0 && <p className="small muted gx-pad">Not collected last night: {d.errors.slice(0, 8).join(' · ')}</p>}
    </div>
  );
}
