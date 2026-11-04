import { Fragment, useMemo, useState } from 'react';
import type { Board } from '../types';
import type { ScanRow } from '../../shared/scan';
import type { ScanState, MoversState } from '../data/scan';
import { CRIT_META, FIELD_META, PRESET_FILTERS, gradeRank, matches, type Cond, type Criterion, type FilterField, type GradeResult, type Playbook, type SavedFilter } from '../lib/playbook';
import { etTime } from '../lib/clock';
import { pct, px, tone } from '../lib/format';
import { Fresh } from './common';

type SortKey = 'sym' | 'chgPct' | 'gapPct' | 'rvol' | 'rsRank' | 'grade';

export interface ScannerProps {
  rows: ScanRow[];
  grades: Record<string, GradeResult>;
  scan: ScanState;
  universe: string[];
  boards: Record<string, Board>;
  sel: string;
  onSelect: (s: string) => void;
  addSym: (s: string) => void;
  filterId: string;
  setFilterId: (id: string) => void;
  filters: SavedFilter[];
  setFilters: (f: SavedFilter[]) => void;
  playbooks: Playbook[];
  playbookId: string;
  setPlaybookId: (id: string) => void;
  onEditPlaybooks: () => void;
  scanList: string[];
  setScanList: (s: string[]) => void;
  includeMovers: boolean;
  setIncludeMovers: (v: boolean) => void;
  movers: MoversState | null;
  live: boolean;
}

const yes = (v: boolean | null) => v === true;

export function Scanner(p: ScannerProps) {
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'grade', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'filter' | 'universe'>('none');
  const allFilters = [...PRESET_FILTERS, ...p.filters];
  const f = allFilters.find((x) => x.id === p.filterId) ?? PRESET_FILTERS[0];

  const shown = useMemo(() => {
    const val = (r: ScanRow): number | string => {
      if (sort.k === 'sym') return r.sym;
      if (sort.k === 'grade') return p.grades[r.sym] ? p.grades[r.sym].score : -1;
      const v = r[sort.k];
      return v == null || !Number.isFinite(v) ? -Infinity : v;
    };
    return p.rows
      .filter((r) => r.sym !== 'SPY' && r.sym !== 'QQQ' && matches(r, f, p.grades[r.sym]))
      .sort((a, b) => {
        const va = val(a), vb = val(b);
        return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
      });
  }, [p.rows, p.grades, f, sort]);

  const H = ({ k, children, title }: { k: SortKey; children: string; title?: string }) => (
    <th onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : k === 'sym' ? 1 : -1 }))} className={sort.k === k ? 'sorted' : ''} title={title}>
      {children}{sort.k === k ? (sort.dir === -1 ? '↓' : '↑') : ''}
    </th>
  );

  const filled = Object.keys(p.scan.bases).filter((s) => p.universe.includes(s)).length;

  return (
    <>
      <div className="rr-tools sc-tools">
        <div className="sc-line">
          <select className="sc-sel" value={p.playbookId} onChange={(e) => p.setPlaybookId(e.target.value)} aria-label="Playbook used for grades">
            {p.playbooks.map((pb) => <option key={pb.id} value={pb.id}>{pb.name}</option>)}
          </select>
          <button className="chip sm" onClick={p.onEditPlaybooks} title="Edit playbooks (P)">Edit playbooks</button>
          <button className={`chip sm ${panel === 'universe' ? 'on' : ''}`} onClick={() => setPanel(panel === 'universe' ? 'none' : 'universe')} title="Which tickers get scanned">
            Universe {filled}/{p.universe.length}
          </button>
          <Fresh kind={p.scan.freshness} at={p.scan.asOf || undefined} src={p.scan.source} />
        </div>
        <div className="chips">
          {allFilters.map((x) => (
            <button key={x.id} className={`chip ${p.filterId === x.id ? 'on' : ''}`} onClick={() => p.setFilterId(x.id)} title={x.builtin ? undefined : 'Saved filter'}>
              {x.name}
            </button>
          ))}
          <button className={`chip ${panel === 'filter' ? 'on' : ''}`} onClick={() => setPanel(panel === 'filter' ? 'none' : 'filter')} title="Build and save a filter">+ Filter</button>
        </div>
        {p.scan.pending.length > 0 && (
          <div className="sc-pending" title={p.scan.pending.join(', ')}>
            Loading {p.scan.pending.length} more ticker{p.scan.pending.length > 1 ? 's' : ''} as free-tier credits free up (8 a minute)…
          </div>
        )}
      </div>

      {panel === 'filter' && <FilterBuilder filters={p.filters} setFilters={p.setFilters} onSaved={(id) => { p.setFilterId(id); setPanel('none'); }} />}
      {panel === 'universe' && <UniverseEditor {...p} />}

      <table className="grid sc">
        <thead>
          <tr>
            <H k="sym">Sym</H>
            <H k="chgPct">Chg</H>
            <H k="gapPct">Gap</H>
            <H k="rvol" title="Relative volume, time-of-day adjusted">RVOL</H>
            <H k="rsRank" title="RS percentile vs SPY over 5/20/60 days, within the universe">RS</H>
            <H k="grade" title="Playbook grade">Gr</H>
            <th aria-label="Add" />
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const g = p.grades[r.sym];
            const isOpen = open === r.sym;
            return (
              <Fragment key={r.sym}>
                <tr className={`${p.sel === r.sym ? 'sel' : ''} ${isOpen ? 'open' : ''}`} onClick={() => { p.onSelect(r.sym); setOpen(isOpen ? null : r.sym); }}>
                  <td className="wl-sym">{r.sym}<Flags r={r} /></td>
                  <td className={`num ${tone(r.chgPct)}`}>{pct(r.chgPct, 1)}</td>
                  <td className={`num ${tone(r.gapPct ?? 0)}`}>{r.gapPct == null ? '—' : pct(r.gapPct, 1)}</td>
                  <td className="num">{r.rvol == null ? '—' : r.rvol.toFixed(1)}</td>
                  <td className="num">{r.rsRank ?? '—'}</td>
                  <td>{g ? <span className={`grade g-${g.grade.replace('+', 'p')}`} title={`${g.score.toFixed(0)}%${g.partial ? ' (under half the criteria had data)' : ''}`}>{g.grade}{g.partial ? '*' : ''}</span> : '—'}</td>
                  <td>
                    {p.boards[r.sym] ? <span className="muted small" title="On watchlist">✓</span> : (
                      <button className="add-btn" onClick={(e) => { e.stopPropagation(); p.addSym(r.sym); }} title="Add to watchlist (Watching)">+</button>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="sc-detail"><td colSpan={7}><Detail r={r} g={g} /></td></tr>
                )}
              </Fragment>
            );
          })}
          {!shown.length && (
            <tr><td colSpan={7} className="muted sc-empty">{p.scan.loading ? 'Scanning…' : p.rows.length ? 'Nothing matches this filter right now.' : 'No scan data yet.'}</td></tr>
          )}
        </tbody>
      </table>
      <p className="note">
        Premarket volume is not available on free tiers. RVOL uses daily bars refreshed hourly{p.live ? '' : ' (demo)'} and a typical intraday volume curve.
        {p.scan.siSource ? ` Short interest: ${p.scan.siSource} (twice monthly).` : ' Short interest unavailable right now, so the squeeze filter can’t fully apply.'}
      </p>
    </>
  );
}

function Flags({ r }: { r: ScanRow }) {
  const f: [boolean, string, string][] = [
    [yes(r.brk52), '52W', 'Above 52-week high'],
    [yes(r.brk50) && !yes(r.brk52), '50D', 'Above 50-day high'],
    [yes(r.brk20) && !yes(r.brk50), '20D', 'Above 20-day high'],
    [yes(r.gapAndGo), 'G&G', 'Gap-and-go'],
    [yes(r.squeeze), 'SQZ', 'Squeeze: high short interest + rising volume + catalyst'],
    [r.bullFlag.ok, 'FLAG', r.bullFlag.detail ?? 'Bull flag'],
    [r.cupHandle.ok, 'CUP', r.cupHandle.detail ?? 'Cup and handle'],
    [yes(r.catalyst), 'NEWS', r.base.catalyst?.latest ?? 'News in last 24h'],
  ];
  const on = f.filter(([v]) => v);
  if (!on.length) return null;
  const more = on.slice(3);
  return (
    <span className="sc-flags">
      {on.slice(0, 3).map(([, t, title]) => <span key={t} className={`tag t-${t.replace('&', '')}`} title={title}>{t}</span>)}
      {more.length > 0 && <span className="tag" title={more.map(([, t, title]) => `${t}: ${title}`).join('\n')}>+{more.length}</span>}
    </span>
  );
}

function Detail({ r, g }: { r: ScanRow; g?: GradeResult }) {
  const b = r.base;
  return (
    <div className="sc-d">
      {g && (
        <ul className="crit">
          {g.results.map((x) => (
            <li key={x.c.id} className={`c-${x.status}`}>
              <span className="c-mark">{x.status === 'pass' ? '✓' : x.status === 'fail' ? '✗' : '–'}</span>
              <span className="c-l">{critLabel(x.c)}</span>
              <span className="num small muted">{x.value}</span>
              <span className="num small muted">×{x.c.weight}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="kv sc-kv">
        <span>Last</span><b className="num">{px(r.last)}</b>
        <span>RS 5/20/60</span><b className="num">{[r.rs5, r.rs20, r.rs60].map((x) => (x == null ? '—' : x.toFixed(1))).join(' / ')}</b>
        <span>20D / 50D avg</span><b className="num">{b.sma20?.toFixed(2) ?? '—'} / {b.sma50?.toFixed(2) ?? '—'}</b>
        <span>52W high</span><b className="num">{b.hi252?.toFixed(2) ?? '—'}</b>
        <span>ATR %</span><b className="num">{r.atrPct?.toFixed(1) ?? '—'}</b>
        <span>Vol 5D/20D</span><b className="num">{Number.isFinite(r.volTrend) ? `${r.volTrend.toFixed(2)}x` : '—'}</b>
        <span>Short interest</span>
        <b className="num">
          {b.si === undefined ? 'n/a' : b.si === null ? 'not reported' : `${(b.si.shares / 1e6).toFixed(1)}M sh · ${b.si.daysToCover.toFixed(1)} days${b.si.pctOut != null ? ` · ${b.si.pctOut.toFixed(1)}% of shares out` : ''}`}
        </b>
        {b.si && <><span>SI settled</span><b className="num">{b.si.settlementDate}</b></>}
        <span>Catalyst</span><b>{b.catalyst === undefined ? 'n/a' : b.catalyst?.count ? `${b.catalyst.latest}${b.catalyst.latestAt ? ` (${etTime(b.catalyst.latestAt)} ET)` : ''}` : 'none in 24h'}</b>
        {r.bullFlag.ok && <><span>Bull flag</span><b>{r.bullFlag.detail} · trigger {r.bullFlag.trigger?.toFixed(2)}</b></>}
        {r.cupHandle.ok && <><span>Cup &amp; handle</span><b>{r.cupHandle.detail} · pivot {r.cupHandle.trigger?.toFixed(2)}</b></>}
      </div>
    </div>
  );
}

export function critLabel(c: Criterion) {
  const m = CRIT_META[c.type];
  const u = m.unit ?? '';
  if (m.params === 'min') return `${m.label} ${c.min ?? 0}${u}`;
  if (m.params === 'range') return `${m.label} ${c.min ?? '−∞'}–${c.max ?? '∞'}${u}`;
  return m.label;
}

function FilterBuilder({ filters, setFilters, onSaved }: { filters: SavedFilter[]; setFilters: (f: SavedFilter[]) => void; onSaved: (id: string) => void }) {
  const [conds, setConds] = useState<Cond[]>([{ field: 'rvol', op: '>=', value: 2 }]);
  const [name, setName] = useState('');
  const set = (i: number, c: Partial<Cond>) => setConds((cs) => cs.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div className="fb">
      {conds.map((c, i) => {
        const kind = FIELD_META[c.field].kind;
        return (
          <div key={i} className="fb-row">
            <select value={c.field} onChange={(e) => {
              const field = e.target.value as FilterField;
              const k = FIELD_META[field].kind;
              set(i, { field, op: k === 'bool' ? 'is' : '>=', value: k === 'bool' ? 1 : k === 'grade' ? 2 : c.value });
            }}>
              {(Object.keys(FIELD_META) as FilterField[]).map((k) => <option key={k} value={k}>{FIELD_META[k].label}</option>)}
            </select>
            {kind === 'num' && (
              <>
                <select value={c.op} onChange={(e) => set(i, { op: e.target.value as Cond['op'] })}><option value=">=">≥</option><option value="<=">≤</option></select>
                <input inputMode="decimal" value={c.value} onChange={(e) => set(i, { value: +e.target.value || 0 })} />
              </>
            )}
            {kind === 'bool' && (
              <select value={c.value} onChange={(e) => set(i, { value: +e.target.value })}><option value={1}>yes</option><option value={0}>no</option></select>
            )}
            {kind === 'grade' && (
              <select value={c.value} onChange={(e) => set(i, { value: +e.target.value })}>{['C', 'B', 'A', 'A+'].map((g, j) => <option key={g} value={j}>{g}</option>)}</select>
            )}
            <button className="wl-x vis" onClick={() => setConds((cs) => cs.filter((_, j) => j !== i))} aria-label="Remove condition">×</button>
          </div>
        );
      })}
      <div className="fb-row">
        <button className="chip sm" onClick={() => setConds((cs) => [...cs, { field: 'rsRank', op: '>=', value: 80 }])}>+ condition</button>
        <input placeholder="Filter name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim() || !conds.length} onClick={() => {
          const id = `f-${Date.now().toString(36)}`;
          setFilters([...filters, { id, name: name.trim(), conds }]);
          onSaved(id);
        }}>Save</button>
      </div>
      {filters.length > 0 && (
        <div className="fb-saved">
          {filters.map((x) => (
            <span key={x.id} className="tag">{x.name} <button className="wl-x vis" onClick={() => setFilters(filters.filter((y) => y.id !== x.id))} aria-label={`Delete ${x.name}`}>×</button></span>
          ))}
        </div>
      )}
    </div>
  );
}

function UniverseEditor(p: ScannerProps) {
  const [txt, setTxt] = useState(p.scanList.join(' '));
  const parsed = [...new Set(txt.toUpperCase().split(/[\s,]+/).filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)))];
  const wl = Object.keys(p.boards);
  return (
    <div className="fb">
      <div className="small muted">Scanned: your watchlist ({wl.length}) + scan list{p.includeMovers ? ' + market movers' : ''}, up to 40. Each ticker costs about 8 Twelve Data credits a day (of 800).</div>
      <textarea rows={3} value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Scan list tickers" />
      <div className="fb-row">
        <label className="small"><input type="checkbox" checked={p.includeMovers} onChange={(e) => p.setIncludeMovers(e.target.checked)} disabled={!p.live} /> Add top market movers{p.movers?.lastUpdated ? ` (as of ${p.movers.lastUpdated.replace(' US/Eastern', ' ET')})` : ''}</label>
        <button className="btn primary" onClick={() => p.setScanList(parsed)}>Save list ({parsed.length})</button>
      </div>
      {p.universe.length >= 40 && <div className="small down">At the 40-ticker cap; extra names are skipped.</div>}
      {Object.keys(p.scan.errors).length > 0 && <div className="small down">Couldn’t load: {Object.entries(p.scan.errors).map(([s, e]) => `${s} (${e})`).join(', ')}</div>}
    </div>
  );
}

export const gradeSort = gradeRank;
