// Learn hub: topic tabs (each with short guides and Watch / Read / Papers / Tools shelves), strategy cards with what
// published research found, a searchable library of every resource, a glossary with flashcards, a learning path with
// saved progress, and a chart game on real historical bars. Links open the original site; nothing here is advice.
import { lazy, Suspense, useMemo, useState } from 'react';
import { PageHero } from './PageHero';
import type { Page } from './SideNav';
import { usePersisted } from '../lib/store';
import { pickIndex } from '../../shared/chartgame';
import { EVIDENCE_NOTE, GLOSSARY, GUIDES, PATH, RESOURCES, STRATEGIES, TOPICS, resourceById, searchResources, type Kind, type Resource, type Topic } from '../../shared/learn';

const ChartGame = lazy(() => import('./LearnChartGame'));
const Setups = lazy(() => import('./LearnSetups'));
type Tab = Topic | 'setups' | 'library' | 'glossary' | 'game';
const SHELVES: { label: string; kinds: Kind[] }[] = [
  { label: 'Watch and listen', kinds: ['Channel', 'Video', 'Podcast', 'Course'] },
  { label: 'Books', kinds: ['Book'] },
  { label: 'Papers and articles', kinds: ['Paper', 'Article', 'PDF'] },
  { label: 'Tools and practice', kinds: ['Tool', 'Game', 'Puzzle'] },
];

function Res({ r }: { r: Resource }) {
  return (
    <li className="ln-res">
      <a href={r.url} target="_blank" rel="noreferrer noopener"><b>{r.title}</b></a>
      <span className="ln-kind">{r.kind}</span>
      {(r.tags ?? []).filter((t) => t !== 'Free').map((t) => <span key={t} className={`ln-tag ${t === 'Sells courses' ? 'warn' : ''}`}>{t}</span>)}
      <span className="small muted"> · {r.by}</span>
      <p className="small">{r.why}</p>
    </li>
  );
}

function Shelves({ list }: { list: Resource[] }) {
  return (
    <div className="ln-shelves">
      {SHELVES.map((s) => { const xs = list.filter((r) => s.kinds.includes(r.kind)); return xs.length ? (
        <section key={s.label} className="ad-card"><header className="ad-h"><h3>{s.label}</h3><span className="small muted">{xs.length}</span></header><ul className="ln-list">{xs.map((r) => <Res key={r.id} r={r} />)}</ul></section>
      ) : null; })}
    </div>
  );
}

function Strategies({ go }: { go?: (p: Page) => void }) {
  const families = [...new Set(STRATEGIES.map((s) => s.family))];
  const [fam, setFam] = useState<string>('All');
  const [open, setOpen] = useState<string | null>(null);
  const shown = STRATEGIES.filter((s) => fam === 'All' || s.family === fam);
  return (
    <>
      <div className="ln-chips">{['All', ...families].map((f) => <button key={f} className={`chip sm ${fam === f ? 'on' : ''}`} onClick={() => setFam(f)}>{f}</button>)}</div>
      <div className="ln-strats">
        {shown.map((s) => { const on = open === s.id; return (
          <article key={s.id} className={`ad-card ln-strat ${on ? 'open' : ''}`}>
            <button className="ln-strat-h" onClick={() => setOpen(on ? null : s.id)} aria-expanded={on}>
              <span className="ln-fam">{s.family}</span>
              <b>{s.name}</b>
              <span className={`ln-ev ev-${s.evidence.toLowerCase()}`} title={EVIDENCE_NOTE[s.evidence]}>{s.evidence}</span>
            </button>
            <p className="small">{s.how}</p>
            {on && (
              <dl className="ln-dl">
                <dt>Why it might work</dt><dd>{s.why}</dd>
                <dt>What history shows</dt><dd>{s.history} <span className="muted">({EVIDENCE_NOTE[s.evidence]}.)</span></dd>
                <dt>Who trades it</dt><dd>{s.who}</dd>
                <dt>Patterns it shows up in</dt><dd>{s.patterns}</dd>
                <dt>Try it on the desk</dt><dd>{s.run.text} {s.run.page && go && <button className="chip sm" onClick={() => go(s.run.page as Page)}>Open</button>}</dd>
                <dt>How it fails</dt><dd>{s.fails}</dd>
                <dt>Sources</dt><dd><ul className="ln-src">{s.sources.map((id) => { const r = resourceById(id); return r ? <li key={id}><a href={r.url} target="_blank" rel="noreferrer noopener">{r.title}</a> <span className="muted small">· {r.by}</span></li> : null; })}</ul></dd>
              </dl>
            )}
            <button className="ln-more small" onClick={() => setOpen(on ? null : s.id)}>{on ? 'Less' : 'History, who trades it, how to try it →'}</button>
          </article>
        ); })}
      </div>
      <p className="note">Past results are history, not a forecast. Published edges tend to shrink once widely known, and every backtest leaves out some costs. Learning material, not advice.</p>
    </>
  );
}

function PathCard({ go, setTab }: { go?: (p: Page) => void; setTab: (t: Tab) => void }) {
  const [done, setDone] = usePersisted<Record<string, boolean>>('learnPath', {});
  const all = PATH.flatMap((l) => l.steps), n = all.filter((s) => done[s.id]).length;
  return (
    <section className="ad-card ln-path">
      <header className="ad-h"><h3>Learning path</h3><span className="small muted">{n} of {all.length} done</span></header>
      <div className="ln-bar"><span style={{ width: `${(n / all.length) * 100}%` }} /></div>
      <div className="ln-levels">
        {PATH.map((l) => (
          <div key={l.level}>
            <h4>{l.level} <span className="small muted">{l.steps.filter((s) => done[s.id]).length}/{l.steps.length}</span></h4>
            <ul>{l.steps.map((s) => { const r = s.res ? resourceById(s.res) : undefined; return (
              <li key={s.id} className={done[s.id] ? 'done' : ''}>
                <label><input type="checkbox" checked={!!done[s.id]} onChange={(e) => setDone({ ...done, [s.id]: e.target.checked })} /> {s.text}</label>
                {r && <a className="small" href={r.url} target="_blank" rel="noreferrer noopener">open</a>}
                {s.tab && <button className="small linkish" onClick={() => setTab(s.tab!)}>go</button>}
                {s.page && go && <button className="small linkish" onClick={() => go(s.page as Page)}>go</button>}
              </li>
            ); })}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Glossary() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'list' | 'cards'>('list');
  const [stats, setStats] = usePersisted<{ seen: number; known: number; again: string[] }>('learnCards', { seen: 0, known: 0, again: [] });
  const [i, setI] = useState(() => pickIndex(GLOSSARY.length));
  const [flip, setFlip] = useState(false);
  const shown = GLOSSARY.filter((g) => !q || `${g.term} ${g.def}`.toLowerCase().includes(q.toLowerCase()));
  const next = (known: boolean) => {
    const t = GLOSSARY[i].term;
    setStats((s) => ({ seen: s.seen + 1, known: s.known + (known ? 1 : 0), again: known ? s.again.filter((x) => x !== t) : [...new Set([...s.again, t])].slice(-30) }));
    // terms marked "again" come back more often
    const pool = stats.again.length && pickIndex(10) < 4 ? GLOSSARY.filter((g) => stats.again.includes(g.term) && g.term !== t) : GLOSSARY;
    const pick = pool[pickIndex(pool.length)] ?? GLOSSARY[0];
    setI(GLOSSARY.indexOf(pick)); setFlip(false);
  };
  return (
    <>
      <div className="ln-chips">
        <button className={`chip sm ${mode === 'list' ? 'on' : ''}`} onClick={() => setMode('list')}>Glossary</button>
        <button className={`chip sm ${mode === 'cards' ? 'on' : ''}`} onClick={() => setMode('cards')}>Flashcards</button>
        {mode === 'list' && <input className="ln-search" placeholder={`Search ${GLOSSARY.length} terms…`} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {mode === 'list' ? (
        <dl className="ad-card ln-gloss">{shown.map((g) => <div key={g.term}><dt>{g.term} <span className="ln-kind">{TOPICS.find((t) => t.id === g.topic)?.label}</span></dt><dd>{g.def}</dd></div>)}</dl>
      ) : (
        <div className="ln-cardwrap">
          <button className={`ln-flash ${flip ? 'back' : ''}`} onClick={() => setFlip(!flip)}>
            {flip ? <><span className="small muted">{GLOSSARY[i].term}</span><p>{GLOSSARY[i].def}</p></> : <><b>{GLOSSARY[i].term}</b><span className="small muted">Tap to see the meaning</span></>}
          </button>
          <div className="ln-chips"><button className="chip" onClick={() => next(false)}>Again</button><button className="chip on" onClick={() => next(true)}>Got it</button></div>
          <p className="small muted">{stats.seen} cards seen · {stats.known} known · {stats.again.length} to review</p>
        </div>
      )}
    </>
  );
}

function Library() {
  const [q, setQ] = usePersisted('learnQ', '');
  const [kind, setKind] = useState<Kind | 'All'>('All');
  const [freeOnly, setFreeOnly] = useState(false);
  const kinds = [...new Set(RESOURCES.map((r) => r.kind))];
  const list = searchResources(q).filter((r) => (kind === 'All' || r.kind === kind) && (!freeOnly || !!r.tags?.includes('Free')));
  return (
    <>
      <div className="ln-chips">
        <input className="ln-search" placeholder={`Search ${RESOURCES.length} resources: “momentum”, “options”, “psychology”…`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {(['All', ...kinds] as const).map((k) => <button key={k} className={`chip sm ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}
        <label className="small"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only</label>
      </div>
      <p className="small muted">{list.length} result{list.length === 1 ? '' : 's'}</p>
      <section className="ad-card"><ul className="ln-list two">{list.map((r) => <Res key={r.id} r={r} />)}</ul></section>
    </>
  );
}

export default function LearnPage({ go }: { go?: (p: Page) => void }) {
  const [tab, setTab] = usePersisted<Tab>('learnTab', 'start');
  const topic = TOPICS.find((t) => t.id === tab);
  const list = useMemo(() => (topic ? RESOURCES.filter((r) => r.topics.includes(topic.id)) : []), [topic]);
  const terms = topic ? GLOSSARY.filter((g) => g.topic === topic.id) : [];
  const tabs: { id: Tab; label: string }[] = [...TOPICS.flatMap((t) => (t.id === 'technical' ? [{ id: t.id as Tab, label: t.label }, { id: 'setups' as Tab, label: 'Setups & traps' }] : [{ id: t.id as Tab, label: t.label }])), { id: 'library', label: 'Library' }, { id: 'glossary', label: 'Glossary & cards' }, { id: 'game', label: 'Chart game' }];
  return (
    <div className="page ad">
      <PageHero page="learn" title="Learn" sub="Channels, books, papers and strategy history, with a learning path, flashcards and a chart game. Links open the original site. Learning material, not advice." />
      <nav className="ln-tabs" role="tablist" aria-label="Learn topics">
        {tabs.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </nav>
      {topic && <p className="ln-blurb">{topic.blurb}</p>}
      {tab === 'start' && <PathCard go={go} setTab={setTab} />}
      {topic && GUIDES[topic.id] && (
        <div className="ln-guides">{GUIDES[topic.id]!.map((g) => <section key={g.title} className="ad-card"><header className="ad-h"><h3>{g.title}</h3></header><ul className="ln-points">{g.points.map((p) => <li key={p}>{p}</li>)}</ul></section>)}</div>
      )}
      {tab === 'strategies' && <Strategies go={go} />}
      {tab === 'technical' && <section className="ad-card ln-cta"><b>Practise reading charts</b><span className="small muted">Real historical charts with the ending hidden: call the next move, then see what happened.</span><button className="chip on" onClick={() => setTab('game')}>Play the chart game</button></section>}
      {topic && <Shelves list={list} />}
      {topic && terms.length > 0 && (
        <details className="ad-card ln-terms"><summary><b>Key terms</b> <span className="small muted">{terms.length}</span></summary><dl className="ln-gloss">{terms.map((g) => <div key={g.term}><dt>{g.term}</dt><dd>{g.def}</dd></div>)}</dl></details>
      )}
      {tab === 'setups' && <><p className="ln-blurb">Opening-range breakouts, fakeouts, liquidity grabs, traps, VWAP and volume: what defines each, why it happens, what to watch for, and how often it happened on real bars for the ticker you pick.</p><Suspense fallback={<section className="ad-card">Loading…</section>}><Setups /></Suspense></>}
      {tab === 'library' && <Library />}
      {tab === 'glossary' && <Glossary />}
      {tab === 'game' && <Suspense fallback={<section className="ad-card">Loading…</section>}><ChartGame /></Suspense>}
      <p className="note">Channels tagged “Sells courses” also sell paid products; nothing here is an endorsement. Book links search Open Library; some papers link to a Google Scholar search. The Jane Street practice links came from the community list at <a href="https://jane-street-free.pages.dev/" target="_blank" rel="noreferrer noopener">jane-street-free.pages.dev</a>.</p>
    </div>
  );
}
