// The "tell me more" drawer: anything on the desk can open it (a diagram box, a tear-sheet number, a term, a
// transcript line) with whatever is known about it, plus actions: save to the research notebook, open the company,
// learn more. <Term> wraps any label so a click explains it.
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { lookupTerm, type Term as TermDef } from '../../shared/terms';
import { addResearch } from '../lib/research';
import { save } from '../lib/store';
import { useDesk } from '../lib/deskctx';

export interface Explain { title: string; sub?: string; sym?: string; what?: string; lines?: string[]; term?: string; src?: string; url?: string; kind?: string; actions?: { label: string; run: () => void }[]; note?: string }
let cur: Explain | null = null;
const subs = new Set<() => void>();
export const openExplain = (x: Explain) => { cur = x; subs.forEach((f) => f()); };
const close = () => { cur = null; subs.forEach((f) => f()); };
const useCur = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => cur);

/** A label that explains itself on click (dotted underline). Falls back to plain text when nothing is written for it. */
export function Term({ k, children, sym }: { k: string; children?: ReactNode; sym?: string }) {
  const t = lookupTerm(k);
  if (!t) return <>{children ?? k}</>;
  return <button type="button" className="term" title={`${t.title}: ${t.what}`} onClick={(e) => { e.stopPropagation(); openExplain({ title: t.title, term: k, sym, kind: 'Term' }); }}>{children ?? k}</button>;
}

export function InfoDrawer({ onLearn }: { onLearn: (tab: string) => void }) {
  const x = useCur(), { openCompany, openInfo } = useDesk();
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => { setSaved(false); setNote(''); }, [x]);
  useEffect(() => { if (!x) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [x]);
  if (!x) return null;
  const t: TermDef | null = x.term ? lookupTerm(x.term) : null;
  const what = x.what ?? t?.what, lines = [...(x.lines ?? []), ...(t?.read ?? [])];
  const keep = () => {
    addResearch({ sym: x.sym, title: x.title, body: [what, ...lines.map((l) => `- ${l}`), note && `\nMy note: ${note}`].filter(Boolean).join('\n'), src: x.src ?? (t ? 'Trade Desk explainer' : undefined), url: x.url, kind: x.kind });
    setSaved(true);
  };
  return (
    <aside className="idr" role="dialog" aria-label={x.title}>
      <header className="idr-h">
        <div>{x.kind && <span className="idr-k">{x.kind}</span>}<h3>{x.title}</h3>{x.sub && <p className="small muted">{x.sub}</p>}</div>
        <button className="icon-btn" onClick={close} aria-label="Close (Esc)" title="Close (Esc)">×</button>
      </header>
      <div className="idr-b">
        {what && <p className="idr-what">{what}</p>}
        {lines.length > 0 && <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        {x.note && <p className="small muted">{x.note}</p>}
        {x.src && <p className="small muted">Source: {x.url ? <a href={x.url} target="_blank" rel="noreferrer noopener">{x.src} ↗</a> : x.src}</p>}
        <div className="idr-acts">
          {x.actions?.map((a) => <button key={a.label} className="btn" onClick={() => { a.run(); }}>{a.label}</button>)}
          {x.sym && <button className="btn" onClick={() => { openCompany(x.sym!); close(); }}>Open {x.sym} company page</button>}
          {x.sym && <button className="btn" onClick={(e) => openInfo(x.sym!, { x: e.clientX - 340, y: e.clientY - 40 })}>Quick look</button>}
          {t?.learn && <button className="btn" onClick={() => { save('learnTab2', t.learn); onLearn(t.learn!); close(); }}>Learn more</button>}
          {t?.watch && <a className="btn" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(t.watch)}`} target="_blank" rel="noreferrer noopener">▶ Videos</a>}
        </div>
        <div className="idr-save">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add your own note (optional)…" rows={2} />
          <button className="btn primary" onClick={keep} disabled={saved}>{saved ? '✓ Saved to Journal → Research' : 'Save to research'}</button>
        </div>
      </div>
    </aside>
  );
}
