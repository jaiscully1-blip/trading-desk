import { usePersisted } from '../lib/store';
import { fuzzyScore } from '../lib/fuzzy';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Board, Freshness, Headline } from '../types';
import { DEMO_AT } from '../lib/demo';
import { etTime } from '../lib/clock';
import { Fresh, Kbd, LeanDot, Spark } from './common';
import { useDesk } from '../lib/deskctx';

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
  const { openArticle } = useDesk();
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
                  <button className="ticker-hl" tabIndex={k ? -1 : 0} onClick={() => openArticle({ title: h.title, url: h.url, src: h.src, t: h.t, syms: h.syms, sentiment: h.sentiment })} title="Open the article reader">{h.title}</button>
                  <span className="muted small"> · {h.src}</span><LeanDot lean={(h as { lean?: import('../../shared/bias').Lean }).lean} />
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
  /** section in the command bar; pages are detected from the side menu */
  group?: string;
  run: () => void;
}

export function CommandBar({ open, onClose, commands, tickers, onTicker, allowAny, quotes, pages }: { open: boolean; onClose: () => void; commands: Cmd[]; tickers: { sym: string; name: string }[]; onTicker: (s: string) => void; allowAny?: (s: string) => boolean; quotes?: Record<string, import('../types').Quote>; pages?: Set<string> }) {
  const [recent, setRecent] = usePersisted<string[]>('cmdRecent', []);
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

  type R = { kind: 'sym'; x: { sym: string; name: string }; g: string } | { kind: 'cmd'; c: Cmd; g: string };
  const results = useMemo((): R[] => {
    const s = q.trim();
    const grp = (c: Cmd) => c.group ?? (pages?.has(c.id) ? 'Pages' : 'Actions');
    const cq = s.replace(/^\//, '');
    const scored = commands.map((c) => ({ c, sc: Math.max(fuzzyScore(cq, c.label) ?? -1, (fuzzyScore(cq, c.id) ?? -1) + 50) })).filter((r) => r.sc >= 0);
    if (!s) {
      // empty: what you picked last, then tickers on your lists, then pages
      const rec = recent.map((id) => commands.find((c) => c.id === id) ?? (id.startsWith('$') ? null : null)).filter((c): c is Cmd => !!c).slice(0, 4);
      const recSyms = recent.filter((id) => id.startsWith('$')).map((id) => tickers.find((t) => t.sym === id.slice(1))).filter((t): t is { sym: string; name: string } => !!t).slice(0, 4);
      return [...recSyms.map((x) => ({ kind: 'sym' as const, x, g: 'Recent' })), ...rec.map((c) => ({ kind: 'cmd' as const, c, g: 'Recent' })),
        ...commands.filter((c) => grp(c) === 'Pages' && !rec.includes(c)).map((c) => ({ kind: 'cmd' as const, c, g: 'Pages' }))];
    }
    const byScore = scored.sort((a, b) => b.sc - a.sc);
    if (s.startsWith('/')) { const all = byScore.map(({ c }) => ({ kind: 'cmd' as const, c, g: grp(c) })); return [...new Set(all.map((r) => r.g))].flatMap((g) => all.filter((r) => r.g === g)); }
    const up = s.toUpperCase();
    const t = tickers.map((x) => ({ x, sc: x.sym === up ? 2000 : x.sym.startsWith(up) ? 1500 - x.sym.length : fuzzyScore(s, x.name) ?? -1 }))
      .filter((r) => r.sc >= 0).sort((a, b) => b.sc - a.sc).slice(0, 7).map(({ x }) => ({ kind: 'sym' as const, x, g: 'Tickers' }));
    // best 8 commands, kept together by section (sections in the order of their best match) so each heading shows once
    const top = byScore.slice(0, 8).map(({ c }) => ({ kind: 'cmd' as const, c, g: grp(c) }));
    const order = [...new Set(top.map((r) => r.g))];
    const cs = order.flatMap((g) => top.filter((r) => r.g === g));
    // a strong command match (e.g. "jour") goes above weak ticker-name matches
    return (byScore[0]?.sc ?? 0) >= 700 && !tickers.some((x) => x.sym === up) ? [...cs, ...t] : [...t, ...cs];
  }, [q, commands, tickers, recent, pages]);

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
    const id = r.kind === 'sym' ? `$${r.x.sym}` : r.c.id;
    setRecent((x) => [id, ...x.filter((y) => y !== id)].slice(0, 8));
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
          {results.map((r, k) => {
            const head = k === 0 || results[k - 1].g !== r.g ? <li key={`h:${r.g}:${k}`} className="cmd-g" aria-hidden>{r.g}</li> : null;
            const qt = r.kind === 'sym' ? quotes?.[r.x.sym] : undefined;
            return [head, (
              <li key={r.kind === 'sym' ? `s:${r.x.sym}` : r.c.id} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onMouseDown={() => run(k)}>
                {r.kind === 'sym' ? (
                  <><b className="wl-sym">{r.x.sym}</b><span className="muted cmd-nm">{r.x.name}</span>
                    <span className="cmd-q">{qt?.spark && <Spark v={qt.spark} w={44} h={14} />}{qt && Number.isFinite(qt.last) && <span className="num small">{qt.last.toFixed(2)}</span>}{qt && Number.isFinite(qt.chgPct) && <span className={`num small ${qt.chgPct >= 0 ? 'up' : 'down'}`}>{qt.chgPct >= 0 ? '+' : ''}{qt.chgPct.toFixed(1)}%</span>}</span></>
                ) : (
                  <><b className="num">/{r.c.id}</b><span className="muted">{r.c.label}</span>{r.c.hint && <Kbd>{r.c.hint}</Kbd>}</>
                )}
              </li>
            )];
          })}
          {!results.length && q.trim() && <li className="cmd-g">No match. Enter jumps to the ticker if it exists.</li>}
        </ul>
        {msg && <div className="cmd-msg">{msg}</div>}
        <div className="cmd-foot"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span><span><Kbd>↵</Kbd> open</span><span><Kbd>/</Kbd> commands only</span><span><Kbd>esc</Kbd> close</span></div>
      </div>
    </div>
  );
}

/* ---------------- Full-screen overlays ---------------- */
export function OverlayView({ kind, onClose }: { kind: 'map' | 'globe' | 'help'; onClose: () => void }) {
  if (kind === 'help') {
    const rows: [string, string][] = [
      ['Ctrl K', 'Command bar: jump to ticker or run /command'],
      ['W  H  E  C', 'Today: Morning plan, Home, Messages, Calendars'],
      ['D  ⇧M  X  O', 'Charts: Desk, Multi-timeframe, Patterns, Company'],
      ['S  G  U  I  ⇧R', 'Scan: Scanner, Rotation, ETFs and sectors, Smart money, Distress'],
      ['V  M  Y  ⇧B', 'Flow and risk: Gamma and IV, World map, Econ odds, Data status'],
      ['⇧J', 'Journal'],
      [',  .', 'Flip between the views of a page (previous / next)'],
      ['4  5  6', 'Chart: Weekly, Monthly, 15-minute'],
      ['Z', 'Focus mode: hide side bars, strips and ticker (Z again to exit)'],
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
