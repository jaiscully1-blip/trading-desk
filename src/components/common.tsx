import { useDesk } from '../lib/deskctx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LEAN5_LABEL, leanColor, type Lean } from '../../shared/bias';
import type { Freshness } from '../types';
import { etTime } from '../lib/clock';
import { usePersisted } from '../lib/store';
import { beltOrder, splitBelt, toFront } from '../../shared/belt';

const LABEL: Record<Freshness, string> = {
  demo: 'DEMO DATA',
  live: 'LIVE',
  delayed: '15-MIN DELAYED',
  eod: 'END OF DAY',
  unavailable: 'UNAVAILABLE ON FREE TIER',
  pending: 'NOT BUILT YET',
  nodata: 'NO DATA',
};

const SHORT: Record<Freshness, string> = { demo: 'DEMO', live: 'LIVE', delayed: 'DELAYED', eod: 'EOD', unavailable: 'N/A FREE', pending: 'TODO', nodata: 'NO DATA' };

/** Source + freshness badge. Required on every panel. */
export function Fresh({ kind, at, src }: { kind: Freshness; at?: number; src?: string }) {
  return (
    <span className={`fresh fresh-${kind}`} title={[src && `Source: ${src}`, at != null && `As of ${etTime(at, true)} ET`].filter(Boolean).join(' · ') || undefined}>
      <span className="fresh-long">{LABEL[kind]}</span>
      <span className="fresh-short">{SHORT[kind]}</span>
      {at != null && <span className="fresh-at"> · {etTime(at)} ET</span>}
    </span>
  );
}

export function PanelHead({
  title,
  children,
  badge,
  onPopout,
}: {
  title: ReactNode;
  children?: ReactNode;
  badge?: ReactNode;
  onPopout?: () => void;
}) {
  return (
    <div className="phead">
      <div className="phead-title">{title}</div>
      <div className="phead-ctl">{children}</div>
      {badge}
      {onPopout && (
        <button className="icon-btn" onClick={onPopout} title="Pop out to a new window (second monitor)" aria-label="Pop out">
          ↗
        </button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; hint?: string; keyHint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)} title={o.hint} data-key={o.keyHint}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function popout(panel: string, sym: string) {
  const url = `${location.pathname}?panel=${panel}&sym=${encodeURIComponent(sym)}`;
  window.open(url, `td-${panel}`, 'popup,width=1100,height=720');
}

/** Star toggle: click to favorite, click again to remove. Never selects the row it sits in. */
export function Star({ sym, size = 'sm' }: { sym: string; size?: 'sm' | 'md' }) {
  const { stars, toggleStar } = useDesk();
  const on = stars.includes(sym);
  return (
    <button
      className={`star ${on ? 'on' : ''} ${size}`}
      onClick={(e) => { e.stopPropagation(); toggleStar(sym); }}
      title={on ? `Unstar ${sym}` : `Star ${sym}: pings for news, earnings, big moves, levels`}
      aria-label={on ? `Unstar ${sym}` : `Star ${sym}`}
      aria-pressed={on}
    >{on ? '★' : '☆'}</button>
  );
}

/** Company name next to a ticker; click opens the company page (what they do, products, supply chain). */
export function CoName({ sym, className = '' }: { sym: string; className?: string }) {
  const { names, openInfo } = useDesk();
  const n = names[sym];
  if (!n || n === sym) return null;
  return (
    <button className={`coname ${className}`} onClick={(e) => { e.stopPropagation(); openInfo(sym, { x: e.clientX, y: e.clientY }); }} title={`${n}: what is it?`}>{n}</button>
  );
}

/** A ticker you can click to see what it is (name + description card). */
export function SymInfo({ sym, className = '', children }: { sym: string; className?: string; children?: ReactNode }) {
  const { openInfo, names } = useDesk();
  return <button className={`syminfo ${className}`} title={names[sym] ? `${names[sym]}: what is it?` : 'What is this?'} onClick={(e) => { e.stopPropagation(); openInfo(sym, { x: e.clientX, y: e.clientY }); }}>{children ?? sym}</button>;
}

/** Political lean dot for a news item: blue = left, red = right, gray = center / neutral. Hover for why. */
export function LeanDot({ lean }: { lean?: Lean }) {
  const c = leanColor(lean);
  if (!lean || !c) return null;
  const parts = [
    lean.political && lean.article ? `This story's framing: ${lean.article === 'center' ? 'neutral / center' : lean.article === 'left' ? 'leans left' : 'leans right'}${lean.why ? ` (${lean.why})` : ''} · AI read` : lean.political ? 'Political story (framing not rated yet)' : 'Not a political story',
    lean.outlet ? `Outlet: ${LEAN5_LABEL[lean.outlet]} · ${lean.outletBasis}` : 'Outlet not rated',
  ];
  const short = lean.political && lean.article ? (lean.article === 'center' ? 'NEUTRAL' : lean.article === 'left' ? 'LEFT' : 'RIGHT') : lean.outlet ? LEAN5_LABEL[lean.outlet].toUpperCase().replace('LEAN ', 'LEAN-') : '';
  return <span className={`lean lean-${c} ${lean.political ? 'pol' : ''}`} title={parts.join('\n')}>{lean.political ? short : ''}</span>;
}

/** 'flash-up' / 'flash-down' for ~1 s after a number changes (empty on first paint and on big jumps like a symbol switch). */
export function useFlash(v: number | null | undefined): string {
  const prev = useRef(v);
  const [cls, setCls] = useState('');
  useEffect(() => {
    const p = prev.current;
    prev.current = v;
    if (v == null || p == null || v === p || Math.abs(v / p - 1) > 0.05) return;
    setCls(v > p ? 'flash-up' : 'flash-down');
    const t = setTimeout(() => setCls(''), 900);
    return () => clearTimeout(t);
  }, [v]);
  return cls;
}
/** A number that briefly tints green/red when it ticks up/down. */
export function FlashNum({ v, children, className = 'num' }: { v: number | null | undefined; children: ReactNode; className?: string }) {
  const f = useFlash(v);
  return <span className={`${className} ${f}`}>{children}</span>;
}
/** Shimmering placeholder block while a panel loads. */
export function Skel({ w = '100%', h = 12, n = 1 }: { w?: number | string; h?: number; n?: number }) {
  return <>{Array.from({ length: n }, (_, i) => <span key={i} className="skel" style={{ width: typeof w === 'number' ? w : i === n - 1 && n > 1 ? '62%' : w, height: h, marginBottom: n > 1 ? 8 : 0 }} aria-hidden />)}</>;
}

/** Filter chips as a conveyor belt: a few show; a new or picked one jumps to the front and the rest shift down. */
export function Belt({ items, value, onChange, orderKey, size = 3, trailing }: {
  items: { id: string; label: string; title?: string }[]; value: string; onChange: (id: string) => void; orderKey: string; size?: number; trailing?: ReactNode;
}) {
  const [stored, setStored] = usePersisted<string[]>(orderKey, []);
  const ids = items.map((i) => i.id);
  const order = beltOrder(stored, ids);
  const [menu, setMenu] = useState(false);
  const prev = useRef<Record<string, number> | null>(null); // null on the first render: nothing animates on page load
  const { shown, more } = splitBelt(items, order, size);
  // the active filter is always on the belt (it may have been picked elsewhere, e.g. from the command bar)
  const activeHidden = value && more.some((m) => m.id === value);
  useEffect(() => { if (activeHidden) setStored(toFront(order, value)); }, [activeHidden, value]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (stored.join() !== order.join()) setStored(order); }); // keep the saved order in step with new / removed items
  const pick = (id: string) => { setStored(toFront(order, id)); onChange(id); setMenu(false); };
  const cls = (id: string, i: number) => { if (!prev.current) return ''; const p = prev.current[id]; return p == null ? 'belt-new' : p < i ? 'belt-shift' : ''; };
  const classes = shown.map((x, i) => cls(x.id, i));
  useEffect(() => { prev.current = Object.fromEntries(shown.map((x, i) => [x.id, i])); });
  return (
    <div className="chips belt">
      {shown.map((x, i) => (
        <button key={x.id} className={`chip ${value === x.id ? 'on' : ''} ${classes[i]}`} onClick={() => pick(x.id)} title={x.title}>{x.label}</button>
      ))}
      {more.length > 0 && (
        <span className="belt-more">
          <button className={`chip ${menu ? 'on' : ''}`} onClick={() => setMenu(!menu)} aria-expanded={menu} title="More filters: pick one and it jumps to the front">More {more.length} ▾</button>
          {menu && <div className="belt-menu" role="menu">{more.map((x) => <button key={x.id} role="menuitem" className="belt-item" onClick={() => pick(x.id)} title={x.title}>{x.label}</button>)}</div>}
        </span>
      )}
      {trailing}
    </div>
  );
}


/** Page-level views (the big tabs under a page title). Larger than Seg, with an underline on the active one, a "2 of 3" count,
 *  arrow buttons, and the , and . keys to flip back and forth. Use Seg for small in-panel toggles, PageTabs for views of a page. */
export function PageTabs<T extends string>({ value, options, onChange, label = 'Views' }: {
  value: T; options: { id: T; label: string; hint?: string; count?: number }[]; onChange: (v: T) => void; label?: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  const go = (d: number) => onChange(options[(i + d + options.length) % options.length].id);
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || t?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (e.key === ',') { e.preventDefault(); goRef.current(-1); } else if (e.key === '.') { e.preventDefault(); goRef.current(1); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  return (
    <div className="ptabs" role="tablist" aria-label={label}>
      <button className="ptabs-arrow" onClick={() => go(-1)} title="Previous view ( , )" aria-label="Previous view">‹</button>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={`ptab ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)} title={o.hint}>
          {o.label}{o.count != null && <span className="ptab-n num">{o.count}</span>}
        </button>
      ))}
      <button className="ptabs-arrow" onClick={() => go(1)} title="Next view ( . )" aria-label="Next view">›</button>
      <span className="ptabs-pos num" title="Press , and . to flip between views">{i + 1}/{options.length}</span>
    </div>
  );
}


/** Data-quality dot for a single number or card, where a full badge would be clutter. Colour = kind; hover says the source.
 *  live = real time · delayed = minutes old · eod = end of day · calc = CALCULATED on the desk from other data · model = a model's
 *  forecast · unofficial = public data with no official terms · mine = your own journal or settings · demo = sample data. */
export type QKind = 'live' | 'delayed' | 'eod' | 'calc' | 'model' | 'unofficial' | 'mine' | 'demo';
const Q_LABEL: Record<QKind, string> = { live: 'Live', delayed: 'Delayed', eod: 'End of day', calc: 'Calculated on the desk', model: 'Model forecast, not data', unofficial: 'Unofficial public source', mine: 'From your own journal / settings', demo: 'Sample data, not real' };
export function Q({ k, src, at }: { k: QKind; src?: string; at?: number }) {
  const tip = [Q_LABEL[k], src, at != null ? `as of ${etTime(at)} ET` : ''].filter(Boolean).join(' · ');
  return <i className={`q q-${k}`} title={tip} aria-label={tip} role="img" />;
}
/** Freshness (the panel badge's kinds) -> the dot's kinds. */
export const qOf = (f: Freshness | undefined): QKind => (f === 'live' ? 'live' : f === 'eod' ? 'eod' : f === 'demo' ? 'demo' : 'delayed');
