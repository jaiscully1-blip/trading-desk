// "Suggested" strip under an input: a collapsible row of chips that fill in or add a value with one click, or a short
// list of links/tips when the value has to come from somewhere else (a press release, a website). Open by default
// until the viewer collapses it; that choice is remembered per strip.
import type { ReactNode } from 'react';
import { usePersisted } from '../lib/store';

export interface Pick { key: string; label: ReactNode; title?: string; on?: boolean; onPick: () => void }

export function Suggest({ id, title = 'Suggested', items, tips, links, note }: {
  id: string; title?: string; items?: Pick[]; tips?: string[]; links?: { label: string; url: string; note?: string }[]; note?: ReactNode;
}) {
  const [open, setOpen] = usePersisted<boolean>(`sg:${id}`, true);
  const n = (items?.length ?? 0) + (links?.length ?? 0) + (tips?.length ?? 0);
  return (
    <details className="sg" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><span className="sg-t">{title}</span> <span className="small muted">{n}</span></summary>
      {items && items.length > 0 && <div className="sg-chips">{items.map((x) => <button type="button" key={x.key} className={`sg-chip ${x.on ? 'on' : ''}`} title={x.title} onClick={x.onPick} disabled={x.on}>{x.label}</button>)}</div>}
      {links && links.length > 0 && <ul className="sg-links">{links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noreferrer noopener">{l.label}</a>{l.note && <span className="small muted"> · {l.note}</span>}</li>)}</ul>}
      {tips && tips.length > 0 && <ul className="sg-tips">{tips.map((t) => <li key={t}>{t}</li>)}</ul>}
      {note && <p className="small muted sg-note">{note}</p>}
    </details>
  );
}
