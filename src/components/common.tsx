import { useDesk } from '../lib/deskctx';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LEAN5_LABEL, leanColor, type Lean } from '../../shared/bias';
import type { Freshness } from '../types';
import { etTime } from '../lib/clock';

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
