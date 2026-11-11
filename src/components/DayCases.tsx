// Day cases: bull / bear / stagnant for SPY, QQQ and IWM, weighted by how often past days like today closed each way, plus the
// special days coming up (Fed, data, expiries, holidays of every faith, federal days) with each one's measured effect.
// CALCULATED from history: no calls, puts, entries, stops or targets. Shown on the Morning page, as a Home widget and on Calendars.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import type { SymCases } from '../../shared/dayCases';
import type { EventStat } from '../../shared/eventDays';
import { Fresh, PageTabs, Q } from './common';

interface UpDay { kind: string; label: string; cat: string; measured: boolean; verdict: string; n: number; approx?: boolean }
export interface DayCasesFile {
  version: 1; asOf: number; date: string; premarket: boolean; indexes: SymCases[]; upcoming: { date: string; days: UpDay[] }[];
  offDays: { date: string; kind: string; label: string }[]; stats: Record<string, EventStat[]>; record: { n: number; topCaseHit: number | null; brier: number | null };
  sources: Record<string, string>; method: string; errors: Record<string, string>;
}

let cache: { f: DayCasesFile | null; err: string; at: number } = { f: null, err: '', at: 0 };
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();
async function load() {
  inflight ??= (async () => {
    try { const r = await fetch('/api/research?fn=daycases'); const j = await r.json(); cache = { f: j.file ?? cache.f, err: j.file ? '' : j.error ?? `HTTP ${r.status}`, at: Date.now() }; }
    catch (e) { cache = { ...cache, err: (e as Error).message, at: Date.now() }; }
    inflight = null; subs.forEach((f) => f());
  })();
  return inflight;
}
export function useDayCases(mode: DataMode) {
  const [, bump] = useState(0);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    const f = () => bump((x) => x + 1);
    subs.add(f);
    if (Date.now() - cache.at > 10 * 60_000) void load();
    const id = setInterval(() => { if (Date.now() - cache.at > 10 * 60_000) void load(); }, 60_000);
    return () => { subs.delete(f); clearInterval(id); };
  }, [mode.kind]);
  return { f: cache.f, err: cache.err, loading: mode.kind === 'live' && !cache.f && !cache.err };
}

const pc = (v: number) => `${Math.round(v * 100)}%`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const CASE_CLS: Record<string, string> = { bull: 'up', stag: 'flat', bear: 'down' };

function Bar3({ d }: { d: { bull: number; stag: number; bear: number } }) {
  return <span className="dc-bar" aria-hidden><i className="up" style={{ width: pc(d.bull) }} /><i className="flat" style={{ width: pc(d.stag) }} /><i className="down" style={{ width: pc(d.bear) }} /></span>;
}

function IndexCases({ c, open, onToggle }: { c: SymCases; open: boolean; onToggle: () => void }) {
  return (
    <div className="dc-ix">
      <div className="dc-ix-h">
        <b className="num">{c.sym}</b>
        <span className="small muted num">close {c.prevClose.toFixed(2)} · normal day ±{c.sigmaPct.toFixed(2)}%{c.gapPct != null ? ` · premarket ${c.gapPct >= 0 ? '+' : ''}${c.gapPct.toFixed(2)}% (${c.gapBucket})` : ''} · {c.volRegime} volatility</span>
      </div>
      <Bar3 d={c.blend} />
      <ul className="dc-cases">
        {c.cases.map((k) => (
          <li key={k.id} className={CASE_CLS[k.id]}>
            <span className="dc-p num">{pc(k.p)}</span>
            <span><b>{k.label}</b>: {k.confirms}. <span className="muted">{k.range}.</span></span>
          </li>
        ))}
      </ul>
      <button className="link small" onClick={onToggle}>{open ? 'Hide' : 'Show'} what the odds are made of</button>
      {open && (
        <table className="dc-f">
          <thead><tr><th>Past days like this</th><th>Bull</th><th>Flat</th><th>Bear</th><th>Days</th></tr></thead>
          <tbody>
            {[{ id: 'all', label: 'All days (15 years)', dist: c.base }, ...c.factors].map((f) => (
              <tr key={f.id}><td>{f.label}</td><td className="num up">{pc(f.dist.bull)}</td><td className="num">{pc(f.dist.stag)}</td><td className="num down">{pc(f.dist.bear)}</td><td className="num muted">{f.dist.n}</td></tr>
            ))}
            <tr className="dc-blend"><td>Blend (small samples count less)</td><td className="num up">{pc(c.blend.bull)}</td><td className="num">{pc(c.blend.stag)}</td><td className="num down">{pc(c.blend.bear)}</td><td /></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function Upcoming({ f, compact }: { f: DayCasesFile; compact?: boolean }) {
  const rows = f.upcoming.filter((u) => u.days.length).slice(0, compact ? 5 : 10);
  const off = f.offDays.filter((o) => !f.upcoming.some((u) => u.date === o.date));
  return (
    <div className="dc-up">
      {rows.map((u) => (
        <div key={u.date} className="dc-up-r">
          <span className="num small dc-up-d">{u.date === f.date ? 'Today' : dayLabel(u.date)}</span>
          <span className="dc-up-k">{u.days.map((d) => (
            <span key={d.kind} className={`dc-ev ${d.measured ? 'm' : ''} c-${d.cat}`} title={`${d.verdict}${d.n ? ` (${d.n} days of history)` : ''}${d.approx ? ' · date approximate' : ''}`}>
              {d.label}{d.measured && <em> · {d.verdict.replace(/^SPY /, '')}</em>}{d.approx && <sup>~</sup>}
            </span>
          ))}</span>
        </div>
      ))}
      {!rows.length && <p className="small muted">No special days in the next two weeks.</p>}
      {off.length > 0 && <p className="small muted">Markets closed / weekend: {off.map((o) => `${o.label} (${dayLabel(o.date)})`).join(', ')}</p>}
    </div>
  );
}

/** The panel: Morning page and Home widget. */
export function DayCasesPanel({ mode, compact = false }: { mode: DataMode; compact?: boolean }) {
  const { f, err, loading } = useDayCases(mode);
  const [sym, setSym] = useState('SPY');
  const [open, setOpen] = useState(false);
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Needs live data. The cases are never made up from sample prices.</p>;
  if (loading) return <p className="hw-pad small muted">Loading the day cases…</p>;
  if (!f) return <p className="hw-pad small muted">{err === 'not-run-yet' ? 'The Day cases Action hasn’t run yet (GitHub → Actions → Day cases → Run workflow).' : err || 'Unavailable.'}</p>;
  const c = f.indexes.find((x) => x.sym === sym) ?? f.indexes[0];
  return (
    <div className={`dc ${compact ? 'compact' : ''}`}>
      <div className="hw-bar">
        <PageTabs value={c.sym} onChange={setSym} label="Index" options={f.indexes.map((x) => ({ id: x.sym, label: x.sym }))} />
        <span className="small muted">{f.date === new Date().toISOString().slice(0, 10) ? 'Today' : dayLabel(f.date)}{f.premarket ? ' · with premarket gap' : ' · before premarket'}</span>
        <Fresh kind="eod" at={f.asOf} src={`CALCULATED base rates. ${Object.values(f.sources).join(' · ')}`} />
      </div>
      <IndexCases c={c} open={open} onToggle={() => setOpen((o) => !o)} />
      <h4 className="dc-h"><Q k="calc" src="each day type measured against SPY history; only real, stable differences are called out" />Special days coming up</h4>
      <Upcoming f={f} compact={compact} />
      {f.record.n > 0 && <p className="small muted dc-rec">Track record: the most likely case happened {pc(f.record.topCaseHit ?? 0)} of {f.record.n} index-days{f.record.brier != null ? ` · Brier score ${f.record.brier.toFixed(2)} (lower is better)` : ''}.</p>}
      <p className="note">History, not a forecast: how often past days like today closed each way. No calls, puts, entries, stops or targets. {f.method}</p>
    </div>
  );
}

/** Calendars page section: every day type and what SPY / QQQ / IWM history says about it. */
export function SpecialDaysTable({ mode }: { mode: DataMode }) {
  const { f } = useDayCases(mode);
  const [sym, setSym] = useState('SPY');
  const [all, setAll] = useState(false);
  if (!f) return null;
  const st = (f.stats[sym] ?? []).slice().sort((a, b) => Number(b.measured) - Number(a.measured) || b.n - a.n);
  const rows = all ? st : st.filter((s) => s.measured);
  return (
    <div className="dc-tab">
      <div className="hw-bar">
        <PageTabs value={sym} onChange={setSym} label="Index" options={Object.keys(f.stats).map((s) => ({ id: s, label: s }))} />
        <button className={`chip sm ${all ? 'on' : ''}`} onClick={() => setAll((x) => !x)}>{all ? 'Only measured effects' : 'Show every day type'}</button>
      </div>
      <table className="dc-f">
        <thead><tr><th>Day type</th><th>Days</th><th>Closed up</th><th>Avg move</th><th>What history shows</th></tr></thead>
        <tbody>{rows.map((s) => (
          <tr key={s.kind} className={s.measured ? '' : 'muted'}>
            <td>{s.label}{s.approx && <sup title="date approximate">~</sup>}</td><td className="num">{s.n}</td>
            <td className="num">{s.n ? `${pc(s.upPct)} (vs ${pc(s.baseUpPct)})` : ''}</td><td className="num">{s.n ? `${s.relMove.toFixed(2)}x` : ''}</td>
            <td className="small">{s.measured ? s.verdict.replace(new RegExp(`^${sym} `), '') : s.verdict}{s.years ? ` · ${s.years[0]}-${s.years[1]}` : ''}</td>
          </tr>
        ))}</tbody>
      </table>
      <p className="note">Avg move = the day's move vs the 20 days before it (1.00x = a usual day). A day type counts only with |t| ≥ 2.5, 12+ days and the same direction in the older and newer half of the history; about 30 day types are tested, so a looser bar would flag some by chance.</p>
    </div>
  );
}
