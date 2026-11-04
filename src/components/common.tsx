import type { ReactNode } from 'react';
import type { Freshness } from '../types';
import { etTime } from '../lib/clock';

const LABEL: Record<Freshness, string> = {
  demo: 'DEMO DATA',
  live: 'LIVE',
  delayed: '15-MIN DELAYED',
  eod: 'END OF DAY',
  unavailable: 'UNAVAILABLE ON FREE TIER',
  pending: 'NOT BUILT YET',
};

/** Source + freshness badge. Required on every panel. */
export function Fresh({ kind, at, src }: { kind: Freshness; at?: number; src?: string }) {
  return (
    <span className={`fresh fresh-${kind}`} title={src ? `Source: ${src}` : undefined}>
      {LABEL[kind]}
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
  options: { id: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)} title={o.hint}>
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
