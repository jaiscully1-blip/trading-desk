import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Headline } from '../types';
import { DEMO_AT } from '../lib/demo';
import { etTime } from '../lib/clock';
import { Fresh, Kbd } from './common';

/* ---------------- 24/7 news ticker ---------------- */
export function NewsTicker({
  headlines,
  boards,
  watchOnly,
  setWatchOnly,
  onSelect,
  fresh = 'demo',
  asOf = DEMO_AT,
}: {
  headlines: (Headline & { sentiment?: number; url?: string })[];
  fresh?: Freshness;
  asOf?: number;
  boards: Record<string, Board>;
  watchOnly: boolean;
  setWatchOnly: (v: boolean) => void;
  onSelect: (s: string) => void;
}) {
  const items = headlines.filter((h) => !watchOnly || h.syms.some((s) => boards[s])).slice(0, 30);
  const dur = Math.max(40, items.length * 7);
  return (
    <footer className="ticker">
      <span className="ticker-l">24/7 NEWS</span>
      <label className="ticker-f">
        <input type="checkbox" checked={watchOnly} onChange={(e) => setWatchOnly(e.target.checked)} /> My watchlist only
      </label>
      <div className="ticker-track">
        <div className="ticker-run" style={{ animationDuration: `${dur}s` }}>
          {[0, 1].map((k) => (
            <span key={k} aria-hidden={k === 1}>
              {items.map((h) => (
                <span key={h.id + k} className="ticker-item">
                  <span className="num muted">{etTime(h.t)}</span>{' '}
                  {h.syms.map((s) => (
                    <button key={s} className="sym-chip" onClick={() => onSelect(s)} tabIndex={k ? -1 : 0}>{s}</button>
                  ))}{' '}
                  {h.sentiment != null && <span className={`sent ${h.sentiment > 0 ? 'up' : h.sentiment < 0 ? 'down' : 'muted'}`}>● </span>}
                  {h.title}
                  <span className="muted small"> · {h.src}</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <Fresh kind={fresh} at={asOf || undefined} />
    </footer>
  );
}

/* ---------------- Command bar ---------------- */
export interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandBar({ open, onClose, commands, tickers, onTicker, allowAny }: { open: boolean; onClose: () => void; commands: Cmd[]; tickers: { sym: string; name: string }[]; onTicker: (s: string) => void; allowAny?: (s: string) => boolean }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const [msg, setMsg] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      setMsg('');
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmds = commands.filter((c) => !s || c.id.toLowerCase().includes(s.replace(/^\//, '')) || c.label.toLowerCase().includes(s));
    if (s.startsWith('/')) return cmds.map((c) => ({ kind: 'cmd' as const, c }));
    const t = tickers
      .filter((x) => !s || x.sym.toLowerCase().startsWith(s) || x.name.toLowerCase().includes(s))
      .sort((a, b) => (a.sym.toLowerCase() === s ? -1 : b.sym.toLowerCase() === s ? 1 : 0))
      .slice(0, 8)
      .map((x) => ({ kind: 'sym' as const, x }));
    return [...t, ...cmds.slice(0, s ? 6 : 12).map((c) => ({ kind: 'cmd' as const, c }))];
  }, [q, commands, tickers]);

  if (!open) return null;
  const run = (k: number) => {
    const r = results[k];
    const typed = q.trim().toUpperCase();
    // live mode: any valid symbol jumps, even if it's not in the list
    if (allowAny && typed && !typed.startsWith('/') && allowAny(typed) && (!r || r.kind !== 'sym' || r.x.sym !== typed) && k === 0) {
      onTicker(typed);
      onClose();
      return;
    }
    if (!r) {
      if (q.trim()) setMsg(allowAny ? `"${typed}" isn't a valid ticker symbol.` : `"${typed}" isn't in the demo universe. Any ticker works once /api has data keys.`);
      return;
    }
    if (r.kind === 'sym') onTicker(r.x.sym);
    else r.c.run();
    onClose();
  };
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="cmd" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Command bar">
        <input
          ref={input}
          value={q}
          onChange={(e) => { setQ(e.target.value); setI(0); setMsg(''); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(results.length - 1, x + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(i); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }}
          placeholder="Ticker, or /command  (try /gappers, /journal, /map)"
          aria-label="Search tickers or commands"
        />
        <ul className="cmd-list">
          {results.map((r, k) => (
            <li key={r.kind === 'sym' ? r.x.sym : r.c.id} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onMouseDown={() => run(k)}>
              {r.kind === 'sym' ? (
                <><b className="wl-sym">{r.x.sym}</b><span className="muted">{r.x.name}</span><span className="cmd-k">ticker</span></>
              ) : (
                <><b className="num">/{r.c.id}</b><span className="muted">{r.c.label}</span>{r.c.hint && <Kbd>{r.c.hint}</Kbd>}</>
              )}
            </li>
          ))}
        </ul>
        {msg && <div className="cmd-msg">{msg}</div>}
      </div>
    </div>
  );
}

/* ---------------- Full-screen overlays ---------------- */
export function OverlayView({ kind, onClose }: { kind: 'map' | 'globe' | 'help'; onClose: () => void }) {
  if (kind === 'help') {
    const rows: [string, string][] = [
      ['Ctrl K', 'Command bar: jump to ticker or run /command'],
      ['D  S  M  G  C', 'Pages: Desk, Scanner, World map, Money flow, Calendars'],
      ['↑ ↓  or  J K', 'Move through watchlist'],
      ['1  2  3', 'Chart timeframe: Daily, 1-hour, 5-minute'],
      ['L', 'Show/hide levels panel'],
      ['P', 'Playbook editor'],
      ['N  Q  R', 'Desk right rail: News, Quick Journal (trade ticket), Risk'],
      ['[   ]', 'Hide/show left or right rail'],
      ['B', 'Hide/show news ticker'],
      ['F', 'Hide/show fear strip'],
      ['A', 'Account drawer'],
      ['Shift J', 'Journal page: trades, stats, violations, CSV import (Replay from any trade)'],
      ['Ctrl K → /recap', 'Daily recap; /replay replays your last trade'],
      ['T', 'Terminal (dark) / paper (light) theme'],
      ['?', 'This help'],
      ['Esc', 'Close whatever is open'],
    ];
    return (
      <div className="overlay" role="dialog" aria-label="Keyboard shortcuts">
        <div className="overlay-in help">
          <div className="phead"><div className="phead-title">Keyboard</div><div className="phead-ctl" /><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
          <table className="grid"><tbody>{rows.map(([k, d]) => <tr key={k}><td><Kbd>{k}</Kbd></td><td>{d}</td></tr>)}</tbody></table>
        </div>
      </div>
    );
  }
  const map = kind === 'map';
  return (
    <div className="overlay" role="dialog" aria-label={map ? 'World map' : 'Money flow globe'}>
      <div className="overlay-in placeholder">
        <div className="phead">
          <div className="phead-title">{map ? 'World map · News + Sentiment weather' : 'Money flow globe · ETF proxy'}</div>
          <div className="phead-ctl" />
          <Fresh kind="pending" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ph-body">
          <div className="ph-ring" />
          <p><b>Not built yet.</b> This overlay lands in Milestone 8.</p>
          <p className="muted">{map ? 'GDELT-driven hotspots colored by market sentiment; click to filter headlines and affected tickers.' : 'Sector and asset-class rotation using ETF performance and volume, labeled as a proxy.'}</p>
          <p className="muted small">Press Esc to close.</p>
        </div>
      </div>
    </div>
  );
}
