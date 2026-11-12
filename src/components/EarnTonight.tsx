// "Tonight & tomorrow": the earnings that matter for the next session. After 9:30 ET it lists today's after-close reports and the
// next session's before-open reports; before 9:30 ET it lists last night's after-close reports and this morning's before-open ones.
// Each row shows the EPS estimate, the actual and beat / miss once reported, and the after-hours or premarket move (Yahoo, delayed).
import { useEffect, useMemo, useState } from 'react';
import { et } from '../../shared/clock';
import { earningsWindow, type ExtMove } from '../../shared/extMove';
import { surprisePct, type EarnItem } from '../../shared/eventsCal';
import { Fresh } from './common';

const eps = (v: number | null) => (v == null ? '' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`);
const cap = (v: number | null) => (v == null ? '' : v >= 1e12 ? `$${(v / 1e12).toFixed(1)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(0)}B` : `$${(v / 1e6).toFixed(0)}M`);
const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });

function useMoves(syms: string[]) {
  const [st, setSt] = useState<{ moves: Record<string, ExtMove>; asOf: number }>({ moves: {}, asOf: 0 });
  const key = syms.join(',');
  useEffect(() => {
    if (!syms.length) return;
    let stop = false;
    const go = () => fetch(`/api/research?fn=earnmoves&symbols=${encodeURIComponent(key)}`).then((r) => r.json()).then((j) => {
      if (!stop && Array.isArray(j.moves)) setSt({ moves: Object.fromEntries(j.moves.map((m: ExtMove) => [m.sym, m])), asOf: j.asOf });
    }).catch(() => {});
    go();
    const id = setInterval(() => { if (!document.hidden) go(); }, 90_000);
    return () => { stop = true; clearInterval(id); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}

export function EarnTonight({ earnings, days, mySyms, onSelect, compact }: { earnings: EarnItem[]; days: string[]; mySyms: Set<string>; onSelect: (s: string) => void; compact?: boolean }) {
  const [sortBy, setSortBy] = useState<'size' | 'move'>('size');
  const e = et(Date.now());
  const today = `${e.y}-${String(e.mo).padStart(2, '0')}-${String(e.d).padStart(2, '0')}`;
  const win = useMemo(() => earningsWindow(earnings, days, today, Math.floor(e.sod / 60)), [earnings, days, today, Math.floor(e.sod / 900)]); // eslint-disable-line react-hooks/exhaustive-deps
  // moves for the biggest names plus yours (Yahoo is asked for at most 30)
  const pickSyms = useMemo(() => {
    const all = [...win.tonight.rows, ...win.morning.rows];
    const mine = all.filter((r) => mySyms.has(r.sym)).map((r) => r.sym);
    const big = [...all].sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0)).map((r) => r.sym);
    return [...new Set([...mine, ...big])].slice(0, 30);
  }, [win, mySyms]);
  const { moves, asOf } = useMoves(pickSyms);

  // has the report time passed? after-close reports land from about 16:05 ET, before-open ones by 9:30 ET
  const passed = (day: string, at: number) => day < today || (day === today && e.sod >= at);
  const Section = ({ title, sub, rows, out }: { title: string; sub: string; rows: EarnItem[]; out: boolean }) => {
    const list = [...rows].sort((a, b) => sortBy === 'move' ? Math.abs(moves[b.sym]?.chgPct ?? 0) - Math.abs(moves[a.sym]?.chgPct ?? 0) : (Number(mySyms.has(b.sym)) - Number(mySyms.has(a.sym))) || (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, compact ? 12 : 40);
    return (
      <>
        <div className="ei-sec">{title} <span className="muted">{sub}</span></div>
        {list.map((r) => {
          const m = moves[r.sym], sp = surprisePct(r.epsAct, r.epsEst);
          return (
            <div key={r.date + r.sym} className="ei-row et-row" title={`${r.name}${r.quarter ? ` · quarter ending ${r.quarter}` : ''} · ${r.source}`}>
              <button className={`wl-sym ${mySyms.has(r.sym) ? 'mine' : ''}`} onClick={() => onSelect(r.sym)}>{r.sym}</button>
              <span className="ei-name small muted">{r.name}</span>
              <span className="num small">{r.epsAct != null ? <><b>{eps(r.epsAct)}</b> <span className="muted">vs {eps(r.epsEst)}</span></> : r.epsEst != null ? <span className="muted">est {eps(r.epsEst)}</span> : ''}</span>
              <span className={`num small ${sp == null ? 'muted' : sp >= 0 ? 'up' : 'down'}`}>{sp != null ? `${sp >= 0 ? 'beat' : 'miss'} ${Math.abs(sp).toFixed(0)}%` : r.epsAct == null ? (out ? 'reported' : 'not out yet') : ''}</span>
              <span className={`num small et-move ${m?.chgPct == null ? 'muted' : m.chgPct >= 0 ? 'up' : 'down'}`} title={m?.ext != null ? `${m.session === 'post' ? 'After hours' : 'Premarket'} $${m.ext.toFixed(2)} vs close $${m.base.toFixed(2)}` : 'No extended-hours trade yet'}>
                {m?.chgPct != null ? `${m.session === 'post' ? 'AH' : 'PM'} ${m.chgPct >= 0 ? '+' : ''}${m.chgPct.toFixed(1)}%` : ''}
              </span>
              <span className="num small muted ei-cap">{cap(r.mcap)}</span>
            </div>
          );
        })}
        {!list.length && <p className="muted small hw-pad">None on the calendar.</p>}
      </>
    );
  };

  return (
    <div className="ei-list">
      <div className="et-bar">
        <span className="chips"><button className={`chip sm ${sortBy === 'size' ? 'on' : ''}`} onClick={() => setSortBy('size')}>Biggest companies</button><button className={`chip sm ${sortBy === 'move' ? 'on' : ''}`} onClick={() => setSortBy('move')}>Biggest moves</button></span>
        {asOf > 0 && <Fresh kind="delayed" at={asOf} src="After-hours / premarket prices: Yahoo Finance extended-hours chart data (unofficial, delayed). Estimates and actuals: Nasdaq's calendar (unofficial) + Finnhub." />}
      </div>
      <Section title={`After the close · ${dayName(win.tonight.day)}`} sub="moves are after-hours vs that day's close" rows={win.tonight.rows} out={passed(win.tonight.day, 16 * 3600 + 300)} />
      <Section title={`Before the open · ${dayName(win.morning.day)}`} sub="moves are premarket vs the previous close, once trading starts at 4:00 ET" rows={win.morning.rows} out={passed(win.morning.day, 9.5 * 3600)} />
      <p className="note">Companies with no announced time are on the Earnings tab. Extended-hours prices are thin and can swing; this is information, not a signal.</p>
    </div>
  );
}
