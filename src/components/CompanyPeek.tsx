// Company peek: the pinned side panel. Hover any ticker for the small preview card, click the card (or any company
// name) and this panel opens on the right without leaving the page you're on. Click another company inside it and it
// stacks, with Back. What it does, the numbers, a 1-year chart you can move along, news, next earnings and your notes.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Quote } from '../types';
import type { DataMode } from '../data/live';
import { useTickerInfo } from '../data/info';
import { pct, px, tone } from '../lib/format';
import { useDesk } from '../lib/deskctx';
import { addResearch, useResearch } from '../lib/research';
import { Star } from './common';
import { TearSheet } from './TearSheet';
import { MoveChart, type MPoint } from './MoveChart';

let stack: string[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const openPeek = (sym: string) => { const s = sym.toUpperCase(); if (stack[stack.length - 1] !== s) stack = [...stack.filter((x) => x !== s), s].slice(-12); emit(); };
const back = () => { stack = stack.slice(0, -1); emit(); };
const closePeek = () => { stack = []; emit(); };
const useStack = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => stack);

type Head = { title: string; url?: string; src?: string; t: number; summary?: string; syms?: string[] };

function Body({ sym, mode, quotes, onChart, onCompany }: { sym: string; mode: DataMode; quotes: Record<string, Quote>; onChart: (s: string) => void; onCompany: (s: string) => void }) {
  const { data, loading } = useTickerInfo(sym, mode);
  const { openArticle, names } = useDesk();
  const [bars, setBars] = useState<MPoint[] | null>(null), [news, setNews] = useState<Head[] | null>(null), [note, setNote] = useState(''), [keptAt, setKeptAt] = useState(0);
  const notes = useResearch().filter((n) => n.sym === sym);
  const live = mode.kind === 'live', q = quotes[sym];
  useEffect(() => {
    let off = false; setBars(null); setNews(null);
    if (!live) return;
    fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(sym)}&tf=1d`).then((r) => r.json()).then((j) => { if (!off) setBars((j.bars ?? []).map((b: any) => ({ t: b.time * 1000, v: b.close }))); }).catch(() => !off && setBars([]));
    const nm = (names[sym] ?? data?.name ?? '').split(/[\s,]+/).slice(0, 2).join(' ');
    fetch(`/api/research?fn=tickernews&symbol=${encodeURIComponent(sym)}&name=${encodeURIComponent(nm)}`).then((r) => r.json()).then((j) => { if (!off) setNews((j.items ?? []).slice(0, 6)); }).catch(() => !off && setNews([]));
    return () => { off = true; };
  }, [sym, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const what = data?.what;
  const dayMove = useMemo(() => (bars ? new Map(bars.map((b, i) => [b.t, i ? (b.v / bars[i - 1].v - 1) * 100 : 0])) : new Map<number, number>()), [bars]);
  return (
    <div className="pk-body">
      <div className="pk-acts">
        <button className="btn primary" onClick={() => onCompany(sym)}>Open full company page</button>
        <button className="btn" onClick={() => onChart(sym)}>Chart on desk</button>
      </div>
      <section><h4>What it does</h4>
        {loading && !data ? <p className="small muted">Loading…</p> : what ? <p className="pk-what">{what}</p> : <p className="small muted">No write-up found yet. The full company page reads the latest annual report.</p>}
        <div className="pk-tags">{[data?.sector, data?.industry, data?.hq, data?.index].filter(Boolean).map((t) => <span key={t} className="tag">{t}</span>)}{data?.type === 'fund' && <span className="tag">Fund</span>}</div>
        {data?.source && <p className="small muted">{data.source}</p>}
      </section>
      <section><h4>Price, last 5 years</h4>
        {!live ? <p className="small muted">Live data only.</p> : bars == null ? <p className="small muted">Loading chart…</p> :
          <MoveChart series={[{ pts: bars, label: sym, fmt: (v) => px(v) }]} height={150} defaultRange="1Y"
            onPick={(t, v) => { const d = new Date(t).toISOString().slice(0, 10), m = dayMove.get(t) ?? 0, near = (news ?? []).filter((n) => Math.abs(n.t - t) < 3 * 86400000);
              return <div className="small"><b>{d}</b> close {v[0] != null ? px(v[0]) : '—'} · <span className={m >= 0 ? 'up' : 'down'}>{m >= 0 ? '+' : ''}{m.toFixed(2)}% that day</span>
                {near.length ? <ul>{near.map((n) => <li key={n.title}>{n.title}</li>)}</ul> : <> · <a href={`https://www.google.com/search?q=${encodeURIComponent(`${sym} stock news`)}&tbs=cdr:1,cd_min:${encodeURIComponent(new Date(t - 86400000).toLocaleDateString('en-US'))},cd_max:${encodeURIComponent(new Date(t + 86400000).toLocaleDateString('en-US'))}`} target="_blank" rel="noreferrer noopener">news around that day ↗</a></>}</div>; }} />}
      </section>
      <section><h4>Key numbers and next earnings</h4><TearSheet sym={sym} mode={mode} /></section>
      <section><h4>Latest news</h4>
        {!live ? <p className="small muted">Live data only.</p> : news == null ? <p className="small muted">Loading…</p> : !news.length ? <p className="small muted">No recent headlines.</p> :
          <ul className="pk-news">{news.map((n) => <li key={n.title}><button className="link" onClick={() => openArticle({ title: n.title, url: n.url, src: n.src ?? '', t: n.t, summary: n.summary, syms: n.syms })}>{n.title}</button><span className="small muted"> {n.src} · {new Date(n.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></li>)}</ul>}
      </section>
      <section><h4>Your notes {notes.length ? <span className="muted small">· {notes.length}</span> : null}</h4>
        {notes.slice(0, 4).map((n) => <div key={n.id} className="pk-note"><b className="small">{n.title}</b><p className="small">{n.body.slice(0, 240)}{n.body.length > 240 ? '…' : ''}</p></div>)}
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`Quick note on ${sym}…`} />
        <div className="pk-acts">
          <button className="btn" disabled={!note.trim()} onClick={() => { addResearch({ sym, title: note.trim().slice(0, 60), body: note.trim(), kind: 'My note' }); setNote(''); setKeptAt(Date.now()); }}>Add note</button>
          <button className="btn" onClick={() => { addResearch({ sym, title: `${sym}: ${data?.name ?? ''}`.trim(), body: [what, q && Number.isFinite(q.last) ? `Price ${px(q.last)} (${pct(q.chgPct, 2)})` : ''].filter(Boolean).join('\n'), src: data?.source, kind: 'Company' }); setKeptAt(Date.now()); }}>Save write-up to research</button>
          {Date.now() - keptAt < 3000 && <span className="small up">✓ Saved</span>}
        </div>
      </section>
    </div>
  );
}

export function CompanyPeek({ mode, quotes, onChart, onCompany }: { mode: DataMode; quotes: Record<string, Quote>; onChart: (s: string) => void; onCompany: (s: string) => void }) {
  const st = useStack(), sym = st[st.length - 1], { names } = useDesk();
  useEffect(() => { if (!sym) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.idr')) closePeek(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [sym]);
  if (!sym) return null;
  const q = quotes[sym], name = (q?.name && q.name !== sym ? q.name : names[sym]) ?? '';
  return (
    <aside className="pk" role="dialog" aria-label={`About ${sym}`}>
      <header className="pk-h">
        {st.length > 1 && <button className="chip sm" onClick={back} title={`Back to ${st[st.length - 2]}`}>← {st[st.length - 2]}</button>}
        <Star sym={sym} /><b className="pk-sym num">{sym}</b><span className="pk-n">{name}</span>
        {q && Number.isFinite(q.last) && <span className="pk-px num">{px(q.last)} <span className={tone(q.chgPct)}>{pct(q.chgPct, 2)}</span></span>}
        <button className="icon-btn" onClick={closePeek} aria-label="Close (Esc)" title="Close (Esc)">×</button>
      </header>
      {st.length > 1 && <div className="pk-trail small muted">{st.map((s, i) => <button key={s} className={`link ${i === st.length - 1 ? 'on' : ''}`} onClick={() => openPeek(s)}>{s}</button>)}</div>}
      <Body key={sym} sym={sym} mode={mode} quotes={quotes} onChart={(s) => { onChart(s); }} onCompany={(s) => { closePeek(); onCompany(s); }} />
    </aside>
  );
}
