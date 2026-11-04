import { useEffect, useMemo, useRef, useState } from 'react';
import { ColorType, LineSeries, createChart, type UTCTimestamp } from 'lightweight-charts';
import type { Board, Headline } from '../types';
import { DEMO_ACCOUNT, DEMO_AT } from '../lib/demo';
import { etTime } from '../lib/clock';
import { sUsd, tone, usd } from '../lib/format';
import { Fresh, Kbd } from './common';

/* ---------------- 24/7 news ticker ---------------- */
export function NewsTicker({
  headlines,
  boards,
  watchOnly,
  setWatchOnly,
  onSelect,
}: {
  headlines: Headline[];
  boards: Record<string, Board>;
  watchOnly: boolean;
  setWatchOnly: (v: boolean) => void;
  onSelect: (s: string) => void;
}) {
  const items = headlines.filter((h) => !watchOnly || h.syms.some((s) => boards[s])).slice(0, 24);
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
                  {h.title}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
      <Fresh kind="demo" at={DEMO_AT} />
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

export function CommandBar({ open, onClose, commands, tickers, onTicker }: { open: boolean; onClose: () => void; commands: Cmd[]; tickers: { sym: string; name: string }[]; onTicker: (s: string) => void }) {
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
    if (!r) {
      if (q.trim()) setMsg(`"${q.trim().toUpperCase()}" isn't in the demo universe yet. Any ticker works once Milestone 2 connects data.`);
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

/* ---------------- Account drawer ---------------- */
export function AccountDrawer({ open, onClose, theme }: { open: boolean; onClose: () => void; theme: string }) {
  const el = useRef<HTMLDivElement>(null);
  const a = DEMO_ACCOUNT;
  useEffect(() => {
    if (!open || !el.current) return;
    const v = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: v('--panel') }, textColor: v('--muted'), fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: v('--line') } },
      rightPriceScale: { borderColor: v('--line') },
      timeScale: { borderColor: v('--line') },
      handleScroll: false,
      handleScale: false,
    });
    const s = c.addSeries(LineSeries, { color: v('--accent'), lineWidth: 2, priceLineVisible: false });
    s.setData(a.daily.map((d) => ({ time: d.time as UTCTimestamp, value: d.equity })));
    c.timeScale().fitContent();
    return () => c.remove();
  }, [open, theme, a.daily]);

  if (!open) return null;
  const max = Math.max(...a.daily.map((d) => Math.abs(d.pnl)));
  // Calendar: weeks as columns, Mon-Fri rows
  const weeks: (typeof a.daily[number] | null)[][] = [];
  for (const d of a.daily) {
    const wd = new Date(Date.UTC(d.date.y, d.date.mo - 1, d.date.d)).getUTCDay(); // 1..5
    if (!weeks.length || wd === 1) weeks.push([null, null, null, null, null]);
    weeks[weeks.length - 1][wd - 1] = d;
  }
  const wins = a.daily.filter((d) => d.pnl > 0).length;
  return (
    <div className="drawer-scrim" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Account">
        <div className="phead">
          <div className="phead-title">Account</div>
          <div className="phead-ctl" />
          <Fresh kind="demo" at={DEMO_AT} src="Sample equity. Milestone 4 computes it from the journal + broker CSV" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="kv wide">
          <span>Starting balance</span><b className="num">{usd(a.start)}</b>
          <span>Equity</span><b className="num">{usd(a.equity)}</b>
          <span>Net</span><b className={`num ${tone(a.equity - a.start)}`}>{sUsd(a.equity - a.start)}</b>
          <span>Green days</span><b className="num">{wins}/{a.daily.length}</b>
        </div>
        <h4>Equity curve</h4>
        <div className="eq" ref={el} />
        <h4>P&amp;L calendar <span className="muted small">last {a.daily.length} sessions</span></h4>
        <div className="cal">
          <div className="cal-days">{['M', 'T', 'W', 'T', 'F'].map((x, i) => <span key={i}>{x}</span>)}</div>
          {weeks.map((w, i) => (
            <div key={i} className="cal-wk">
              {w.map((d, j) => (
                <span
                  key={j}
                  className={`cal-c ${d ? (d.pnl >= 0 ? 'pos' : 'neg') : 'nil'}`}
                  style={d ? { opacity: 0.25 + 0.75 * (Math.abs(d.pnl) / max) } : undefined}
                  title={d ? `${d.date.mo}/${d.date.d}: ${sUsd(d.pnl)}` : ''}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="note">No manual deposits. Set the starting balance once; deposits and withdrawals will be detected from your broker CSV (Milestone 4).</p>
      </aside>
    </div>
  );
}

/* ---------------- Full-screen overlays ---------------- */
export function OverlayView({ kind, onClose }: { kind: 'map' | 'globe' | 'help'; onClose: () => void }) {
  if (kind === 'help') {
    const rows: [string, string][] = [
      ['Ctrl K', 'Command bar: jump to ticker or run /command'],
      ['↑ ↓  or  J K', 'Move through watchlist'],
      ['1  2  3', 'Chart timeframe: Daily, 1-hour, 5-minute'],
      ['N  S  Q  R', 'Right rail: News, Scanner, Quick Journal, Risk'],
      ['[   ]', 'Hide/show left or right rail'],
      ['B', 'Hide/show news ticker'],
      ['A', 'Account drawer'],
      ['M', 'World map overlay'],
      ['G', 'Money flow globe overlay'],
      ['T', 'Light / dark theme'],
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
