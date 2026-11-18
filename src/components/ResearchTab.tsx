// Journal → Research: a notebook for research that isn't a trade. Clips saved from anywhere on the desk ("Save to
// research") land here next to notes you type yourself, grouped by ticker, searchable, and exportable as Markdown.
import { useMemo, useState } from 'react';
import { addResearch, removeResearch, toMarkdown, updateResearch, useResearch, type ResearchNote } from '../lib/research';

const when = (t: number) => new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Note({ n }: { n: ResearchNote }) {
  const [edit, setEdit] = useState(false), [body, setBody] = useState(n.body), [ask, setAsk] = useState(false);
  return (
    <article className="rs-note">
      <header><b>{n.title}</b><span className="small muted">{when(n.t)}{n.kind ? ` · ${n.kind}` : ''}{n.src ? ` · ${n.src}` : ''}</span></header>
      {edit ? <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} /> : <p className="rs-body">{n.body}</p>}
      {n.url && <a className="small" href={n.url} target="_blank" rel="noreferrer noopener">{n.url.replace(/^https?:\/\//, '').slice(0, 70)} ↗</a>}
      <div className="rs-acts">
        {edit ? <><button className="chip sm on" onClick={() => { updateResearch(n.id, { body }); setEdit(false); }}>Save</button><button className="chip sm" onClick={() => { setBody(n.body); setEdit(false); }}>Cancel</button></> : <button className="chip sm" onClick={() => setEdit(true)}>Edit</button>}
        {ask ? <><span className="small">Delete this note?</span><button className="chip sm dn" onClick={() => removeResearch(n.id)}>Delete</button><button className="chip sm" onClick={() => setAsk(false)}>Keep</button></> : <button className="chip sm" onClick={() => setAsk(true)}>Delete</button>}
      </div>
    </article>
  );
}

export function ResearchTab() {
  const notes = useResearch();
  const [q, setQ] = useState(''), [sym, setSym] = useState('All'), [copied, setCopied] = useState(false);
  const [d, setD] = useState({ sym: '', title: '', body: '', url: '' });
  const syms = useMemo(() => ['All', ...[...new Set(notes.map((n) => n.sym ?? 'General'))].sort()], [notes]);
  const xs = notes.filter((n) => (sym === 'All' || (n.sym ?? 'General') === sym) && (!q || `${n.title} ${n.body} ${n.sym ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const groups = new Map<string, ResearchNote[]>(); for (const n of xs) groups.set(n.sym ?? 'General', [...(groups.get(n.sym ?? 'General') ?? []), n]);
  const add = (e: React.FormEvent) => { e.preventDefault(); if (!d.title.trim() && !d.body.trim()) return; addResearch({ sym: d.sym.trim() || undefined, title: d.title.trim() || d.body.trim().slice(0, 60), body: d.body.trim(), url: /^https?:\/\//.test(d.url.trim()) ? d.url.trim() : undefined, kind: 'My note' }); setD({ sym: d.sym, title: '', body: '', url: '' }); };
  const copy = async () => { try { await navigator.clipboard.writeText(toMarkdown(xs)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div className="rs">
      <form className="rs-add" onSubmit={add}>
        <input value={d.sym} onChange={(e) => setD({ ...d, sym: e.target.value.toUpperCase() })} placeholder="Ticker (optional)" maxLength={10} aria-label="Ticker" />
        <input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Title" aria-label="Title" />
        <textarea value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} placeholder="What you found, why it matters, what to check next…" rows={3} aria-label="Note" />
        <input value={d.url} onChange={(e) => setD({ ...d, url: e.target.value })} placeholder="Link (optional)" aria-label="Link" />
        <button className="btn primary" type="submit">Add note</button>
      </form>
      <div className="ln-chips">
        {syms.map((s) => <button key={s} className={`chip sm ${s === sym ? 'on' : ''}`} onClick={() => setSym(s)}>{s}{s !== 'All' ? ` · ${notes.filter((n) => (n.sym ?? 'General') === s).length}` : ''}</button>)}
        <input className="ln-search" placeholder={`Search ${notes.length} notes…`} value={q} onChange={(e) => setQ(e.target.value)} />
        {xs.length > 0 && <button className="chip sm" onClick={copy}>{copied ? '✓ Copied' : 'Copy as Markdown'}</button>}
      </div>
      {!notes.length && <p className="small muted">Nothing yet. Click any underlined term, diagram box or transcript line and press “Save to research”, or type a note above.</p>}
      {[...groups].map(([k, v]) => <section key={k} className="rs-group"><h4>{k} <span className="muted small">· {v.length}</span></h4>{v.map((n) => <Note key={n.id} n={n} />)}</section>)}
      <p className="small muted">Saved in this browser for this desk account. Research notes, not advice.</p>
    </div>
  );
}
