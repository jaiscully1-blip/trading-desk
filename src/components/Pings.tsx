// On-screen ping messages for starred stocks, and the Starred list that sits at the top of the Scanner tab.
import { useEffect, useState } from 'react';
import type { Ping } from '../lib/pings';
import type { Quote } from '../types';
import { useDesk } from '../lib/deskctx';
import { pct, px, tone } from '../lib/format';
import { etTime } from '../lib/clock';
import { CoName, Star } from './common';

const KIND: Record<Ping['kind'], string> = { news: 'NEWS', earnings: 'EARNINGS', move: 'MOVE', level: 'LEVEL' };

function PingCard({ p, onOpen, onClose }: { p: Ping; onOpen: () => void; onClose: () => void }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(onClose, 14_000);
    return () => clearTimeout(t);
  }, [hover]); // eslint-disable-line react-hooks/exhaustive-deps
  const { names } = useDesk();
  return (
    <div className={`ping ${p.tone ?? ''}`} role="status" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="ping-h">
        <span className={`ping-k k-${p.kind}`}>{KIND[p.kind]}</span>
        <button className="ping-sym" onClick={onOpen} title="Open on the desk">★ {p.sym}</button>
        <span className="ping-n">{names[p.sym] ?? ''}</span>
        <span className="ping-t">{etTime(p.t)}</span>
        <button className="ping-x" onClick={onClose} aria-label="Dismiss">×</button>
      </div>
      <div className="ping-b">{p.url ? <a href={p.url} target="_blank" rel="noreferrer noopener">{p.text}</a> : p.text}</div>
    </div>
  );
}

export function PingStack({ pings, onOpen, onDismiss }: { pings: Ping[]; onOpen: (sym: string) => void; onDismiss: (id: string) => void }) {
  if (!pings.length) return null;
  return (
    <div className="pings" aria-live="polite">
      {pings.slice(0, 5).map((p) => <PingCard key={p.id} p={p} onOpen={() => { onOpen(p.sym); onDismiss(p.id); }} onClose={() => onDismiss(p.id)} />)}
      {pings.length > 1 && <button className="ping-clear" onClick={() => pings.forEach((p) => onDismiss(p.id))}>Clear all ({pings.length})</button>}
    </div>
  );
}

export function StarredList({ quotes, log, sel, onSelect, threshold, setThreshold }: {
  quotes: Record<string, Quote>; log: Ping[]; sel: string; onSelect: (s: string) => void; threshold: number; setThreshold: (n: number) => void;
}) {
  const { stars } = useDesk();
  return (
    <div className="starred">
      <div className="starred-h">
        <b>★ Starred</b><span className="muted small">{stars.length}</span>
        <label className="small muted starred-th">Ping at ±<input type="number" min={1} max={20} step={0.5} value={threshold} onChange={(e) => setThreshold(Math.max(0.5, +e.target.value || 3))} />%</label>
      </div>
      {!stars.length && <p className="small muted starred-empty">Click ☆ next to any ticker to star it. You’ll get pings for its news, earnings, big moves and key levels.</p>}
      {stars.map((s) => {
        const q = quotes[s];
        const last = log.find((p) => p.sym === s);
        return (
          <div key={s} className={`starred-row ${sel === s ? 'sel' : ''}`} onClick={() => onSelect(s)} role="button" tabIndex={-1}>
            <Star sym={s} />
            <span className="wl-sym">{s}</span>
            <CoName sym={s} className="starred-name" />
            <span className="num">{q ? px(q.last) : '—'}</span>
            <span className={`num ${tone(q?.chgPct ?? NaN)}`}>{q ? pct(q.chgPct, 1) : ''}</span>
            {last && <span className="starred-last small muted" title={last.text}>{KIND[last.kind].toLowerCase()} · {last.text}</span>}
          </div>
        );
      })}
    </div>
  );
}
