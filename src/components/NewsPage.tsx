// News page: Top stories (headlines from different outlets grouped into one story, ranked by how many outlets carry it),
// Search (every headline this browser has seen in the last three weeks, plus what's loaded now), and By ticker (one
// company's news from Yahoo Finance, Google News and Finnhub). Headlines and links only.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import type { NewsItem } from '../../shared/news';
import { mergeArchive, searchNews, topStories, type Head } from '../../shared/newsx';
import { useDesk } from '../lib/deskctx';
import { load, save } from '../lib/store';
import { Fresh, PageTabs, Star } from './common';

type Tab = 'top' | 'search' | 'ticker';
const ago = (t: number) => { const m = Math.max(0, Math.round((Date.now() - t) / 60_000)); return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`; };
const toneCls = (s: number | null | undefined) => (s == null ? 'muted' : s > 0.2 ? 'up' : s < -0.2 ? 'down' : 'muted');

/** The browser's own archive of headlines (localStorage, about 3,000 items / 21 days). */
export function useNewsArchive(current: Head[]) {
  const [arch, setArch] = useState<Head[]>(() => load<Head[]>('newsArchive', []));
  const sig = current.length ? `${current.length}:${current[0].id}` : '';
  useEffect(() => {
    if (!current.length) return;
    setArch((a) => { const next = mergeArchive(a, current, Date.now()); save('newsArchive', next); return next; });
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  return arch;
}

export default function NewsPage({ mode, news, sel, onChart }: { mode: DataMode; news: NewsItem[]; sel: string; onChart: (s: string) => void }) {
  const [tab, setTab] = useState<Tab>('top');
  const [q, setQ] = useState('');
  const [sym, setSym] = useState(sel);
  const [typed, setTyped] = useState('');
  const { openArticle, names } = useDesk();
  const live = mode.kind === 'live';
  const [world, setWorld] = useState<Head[]>([]);
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const go = () => fetch('/api/research?fn=globalnews').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop && j?.items) setWorld(j.items); }).catch(() => {});
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, 5 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [live]);
  const current = useMemo<Head[]>(() => [...news.map((n) => ({ id: n.id, t: n.t, title: n.title, src: n.src, url: n.url, syms: n.syms, sentiment: n.sentiment, summary: n.summary })), ...world], [news, world]);
  const archive = useNewsArchive(current);
  const stories = useMemo(() => topStories(current, Date.now()), [current]);
  const results = useMemo(() => (q.trim() ? searchNews(mergeArchive(archive, current, Date.now()), q) : []), [q, archive, current]);
  const [tk, setTk] = useState<{ sym: string; items: Head[]; err?: string } | null>(null);
  useEffect(() => {
    if (tab !== 'ticker' || !live || !sym) return;
    let stop = false;
    setTk(null);
    fetch(`/api/research?fn=tickernews&symbol=${encodeURIComponent(sym)}&name=${encodeURIComponent((names[sym] ?? '').split(/[\s,]+/).slice(0, 2).join(' '))}`).then(async (r) => { const j = await r.json(); if (!stop) setTk(r.ok ? { sym, items: j.items } : { sym, items: [], err: j.error }); }).catch((e) => !stop && setTk({ sym, items: [], err: String(e) }));
    return () => { stop = true; };
  }, [tab, sym, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (h: Head) => openArticle({ title: h.title, url: h.url, src: h.src, t: h.t, summary: h.summary, syms: h.syms });
  const Row = ({ h }: { h: Head }) => (
    <div className="nx-row">
      <span className="num small muted">{ago(h.t)}</span>
      <span className={`sent ${toneCls(h.sentiment)}`}>●</span>
      <button className="link nx-t" onClick={() => open(h)}>{h.title}</button>
      <span className="nx-tags small">{h.syms.slice(0, 3).map((s) => <button key={s} className="chip sm" onClick={() => onChart(s)}>{s}</button>)}<span className="muted"> {h.src}</span></span>
    </div>
  );
  return (
    <div className="page"><section className="panel nx">
      <div className="phead">
        <div className="phead-title">News</div>
        <div className="phead-ctl">
          <PageTabs<Tab> value={tab} onChange={setTab} options={[{ id: 'top', label: 'Top stories', hint: 'grouped across outlets, last 24 hours' }, { id: 'search', label: 'Search', hint: `every headline kept in this browser (${archive.length.toLocaleString('en-US')})` }, { id: 'ticker', label: 'By ticker' }]} />
          <Fresh kind={live ? 'live' : 'demo'} src="Desk news feeds (CNBC, MarketWatch, Yahoo Finance, Fed, BLS, Finnhub, Alpaca when keyed) plus 12 world business feeds" />
        </div>
      </div>
      {tab === 'top' && (
        <div className="nx-list">
          {stories.map((s, i) => (
            <div key={s.key} className="nx-story">
              <div className="nx-sh"><span className="num nx-rank">{i + 1}</span><button className="link nx-t big" onClick={() => open(s.items[s.items.length - 1])}>{s.title}</button></div>
              <div className="small muted nx-meta">
                <b className="num">{s.sources.length}</b> outlets · {s.items.length} headlines · first {ago(s.t0)} ago, latest {ago(s.t1)} ago
                {s.tone != null && <span className={toneCls(s.tone)}> · tone {s.tone > 0.2 ? 'positive' : s.tone < -0.2 ? 'negative' : 'mixed'}</span>}
                {s.syms.map((x) => <button key={x} className="chip sm" onClick={() => onChart(x)}>{x}</button>)}
              </div>
              <details className="small"><summary>{s.sources.join(', ')}</summary>{s.items.map((h) => <Row key={h.id} h={h} />)}</details>
            </div>
          ))}
          {!stories.length && <p className="hw-pad small muted">{current.length ? 'No story is being carried by two or more outlets yet.' : 'Loading headlines…'}</p>}
          <p className="note small">A story ranks higher when more different outlets carry it. Tone is a keyword read of the headlines, not a model.</p>
        </div>
      )}
      {tab === 'search' && (
        <div className="nx-list">
          <div className="nx-search"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder='Search headlines: tariffs chips, "rate cut", $NVDA' aria-label="Search headlines" /><span className="small muted">{q.trim() ? `${results.length} found` : `${archive.length.toLocaleString('en-US')} headlines kept (last 21 days, this browser only)`}</span></div>
          {results.map((h) => <Row key={h.id} h={h} />)}
          {q.trim() && !results.length && <p className="hw-pad small muted">Nothing matches. Every word has to appear; put exact phrases in quotes.</p>}
        </div>
      )}
      {tab === 'ticker' && (
        <div className="nx-list">
          <div className="nx-search"><Star sym={sym} /><b>{sym}</b> <span className="muted small">{names[sym] ?? ''}</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { const s = typed.trim().toUpperCase().replace(/^\$/, ''); if (/^[A-Z][A-Z0-9.]{0,9}$/.test(s)) setSym(s); setTyped(''); } }} placeholder="another ticker ↵" aria-label="Ticker" className="tp-in" />
            <button className="link small" onClick={() => onChart(sym)}>chart</button>
          </div>
          {!live && <p className="hw-pad small muted">Needs the live desk.</p>}
          {live && !tk && <p className="hw-pad small muted">Loading {sym} news…</p>}
          {tk?.err && <p className="hw-pad small down">{tk.err}</p>}
          {tk?.items.map((h) => <Row key={h.id} h={h} />)}
          {tk && !tk.items.length && !tk.err && <p className="hw-pad small muted">No headlines for {sym} in the last few days.</p>}
        </div>
      )}
    </section></div>
  );
}
