// Agencies page: the newest publications from central banks and financial regulators (BIS, ECB, Bank of England, Fed, FSB,
// OCC, ESMA, EBA, Bank of Japan, Bank of Canada...), your keyword matches as quiet notes, filters, and a Summarize button
// (AI, every point quotes the publication). Official publications; summaries can be wrong. Not advice.
import { useEffect, useMemo, useState } from 'react';
import { keywordHits, type Pub } from '../../shared/agencies';
import { usePersisted } from '../lib/store';
import { getDeskJson } from './PatentsSection';
import { Fresh } from './common';

interface Resp { error?: string; items?: Pub[]; status?: Record<string, { ok: boolean; n: number; err?: string }>; feeds?: { id: string; agency: string; type: string }[]; notAvailable?: string[]; source?: string }
interface Sum { error?: string; points?: { text: string; quote: string }[]; dropped?: number; model?: string | null; short?: boolean }
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

function Item({ p, hits, isNew }: { p: Pub; hits: string[]; isNew: boolean }) {
  const [s, setS] = useState<Sum | 'loading' | null>(null);
  const run = () => {
    if (s && s !== 'loading') { setS(null); return; }
    setS('loading');
    getDeskJson<Sum>(`/api/research?fn=agencysum&url=${encodeURIComponent(p.url)}&title=${encodeURIComponent(p.title)}&agency=${encodeURIComponent(p.agencies[0])}`).then(setS).catch((e) => setS({ error: (e as Error).message }));
  };
  return (
    <li className="agy-item">
      <div className="agy-row">
        <span className="num small muted">{day(p.t)}</span>
        <span className="small agy-who">{p.agencies.join(' + ')}</span>
        <span className="chip sm">{p.type}</span>
        <a href={p.url} target="_blank" rel="noreferrer noopener">{p.title}</a>
        {isNew && <span className="chip sm up">new</span>}
        {hits.map((h) => <span key={h} className="chip sm agy-hit">{h}</span>)}
        <button className="pt-what" onClick={run} aria-expanded={!!s}>{s && s !== 'loading' ? 'hide' : 'Summarize'}</button>
      </div>
      {s && (
        <div className="agy-sum small">
          {s === 'loading' ? <span className="muted">Reading the publication…</span> : s.error ? <span className="down">{s.error}</span> : s.short ? <span className="muted">The page has too little text to summarize; open it instead.</span> : <>
            {s.points?.length ? <ul>{s.points.map((x, i) => <li key={i} title={`Publication: "${x.quote}"`}>{x.text}</li>)}</ul> : <span className="muted">The AI found nothing it could back with a quote.</span>}
            <span className="muted">AI summary{s.model ? ` (${s.model})` : ''}; hover a point for the exact sentence.{s.dropped ? ` ${s.dropped} point${s.dropped === 1 ? ' was' : 's were'} left out (quote not in the text).` : ''} Can be wrong: read the original for anything you act on.</span>
          </>}
        </div>
      )}
    </li>
  );
}

export default function AgenciesPage() {
  const [d, setD] = useState<Resp | null>(null);
  const [kw, setKw] = usePersisted<string>('agencyKeywords', 'Basel, capital, stablecoin, liquidity, stress test, G-SIB');
  const [lastSeen, setLastSeen] = usePersisted<number>('agencyLastSeen', 0);
  const [seenAtOpen] = useState(lastSeen);
  const [who, setWho] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { getDeskJson<Resp>('/api/research?fn=agencies').then(setD).catch((e) => setD({ error: (e as Error).message })); }, []);
  useEffect(() => () => setLastSeen(Date.now()), [setLastSeen]); // "new" = published since your last visit
  const keywords = useMemo(() => kw.split(',').map((x) => x.trim()).filter(Boolean), [kw]);
  const items = d?.items ?? [];
  const agencies = useMemo(() => [...new Set(items.flatMap((i) => i.agencies))].sort(), [items]);
  const shown = items.filter((i) => (!who.length || i.agencies.some((a) => who.includes(a))) && (!type || i.type === type) && (!q || i.title.toLowerCase().includes(q.toLowerCase())));
  const matches = items.filter((i) => keywordHits(i.title, keywords).length && i.t >= Date.now() - 14 * 86400000);
  const failing = Object.entries(d?.status ?? {}).filter(([, v]) => !v.ok);
  return (
    <div className="pp agy">
      <section className="panel">
        <div className="gx-h"><b>Agencies</b><span className="small muted">central banks and financial regulators: newest publications</span><Fresh kind="live" src="Agency RSS feeds, refreshed every 30 minutes" /></div>
        <div className="gx-pad">
          <label className="small agy-kw">Your keywords (comma separated) <input value={kw} onChange={(e) => setKw(e.target.value)} /></label>
          {!d && <p className="small muted">Reading 18 agency feeds…</p>}
          {d?.error && <p className="small down">{d.error}</p>}
          {d && !d.error && (matches.length
            ? <><p className="small"><b>{matches.length}</b> publication{matches.length === 1 ? '' : 's'} in the last 14 days match your keywords{matches.some((m) => m.t > seenAtOpen) ? `, ${matches.filter((m) => m.t > seenAtOpen).length} new since your last visit` : ''}:</p>
              <ul className="agy-list">{matches.slice(0, 12).map((p) => <Item key={p.url} p={p} hits={keywordHits(p.title, keywords)} isNew={!!seenAtOpen && p.t > seenAtOpen} />)}</ul></>
            : <p className="small muted">Nothing in the last 14 days matches your keywords.</p>)}
        </div>
      </section>
      {d?.items && (
        <section className="panel">
          <div className="gx-h"><b>All publications</b><span className="small muted">last 45 days · {shown.length} shown</span></div>
          <div className="gx-pad">
            <div className="pt-mix agy-filters">
              {agencies.map((a) => <button key={a} className={`chip sm${who.includes(a) ? ' up' : ''}`} onClick={() => setWho(who.includes(a) ? who.filter((x) => x !== a) : [...who, a])}>{a}</button>)}
              <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type"><option value="">All types</option>{['Press', 'Speech', 'Research', 'Publication'].map((t) => <option key={t}>{t}</option>)}</select>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles" aria-label="Search titles" />
            </div>
            <ul className="agy-list">{shown.slice(0, 150).map((p) => <Item key={p.url} p={p} hits={keywordHits(p.title, keywords)} isNew={!!seenAtOpen && p.t > seenAtOpen} />)}</ul>
            {shown.length > 150 && <p className="small muted">Showing the newest 150; narrow with the filters.</p>}
          </div>
        </section>
      )}
      {d?.items && <p className="note small">{d.source}. {failing.length ? `Not loaded this time: ${failing.map(([k, v]) => `${k} (${v.err})`).join(', ')}. ` : ''}Not included because their sites refuse automated reading or moved their feeds: {(d.notAvailable ?? []).join(', ')}. Joint releases from several agencies show once.</p>}
    </div>
  );
}
