import { useState } from 'react';
import type { ScanRow } from '../../shared/scan';
import { CRIT_META, GRADE_CUTS, gradeRow, type CritType, type Criterion, type Playbook } from '../lib/playbook';

const uid = () => Math.random().toString(36).slice(2, 10);

export function PlaybookEditor({
  playbooks, setPlaybooks, activeId, setActiveId, rows, vwap, onClose,
}: {
  playbooks: Playbook[]; setPlaybooks: (p: Playbook[]) => void; activeId: string; setActiveId: (id: string) => void;
  rows: ScanRow[]; vwap: Record<string, number>; onClose: () => void;
}) {
  const [editId, setEditId] = useState(activeId);
  const pb = playbooks.find((x) => x.id === editId) ?? playbooks[0];
  const update = (next: Playbook) => setPlaybooks(playbooks.map((x) => (x.id === next.id ? next : x)));
  const setCrit = (id: string, patch: Partial<Criterion>) => update({ ...pb, criteria: pb.criteria.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const dist = { 'A+': 0, A: 0, B: 0, C: 0 } as Record<string, number>;
  for (const r of rows) if (r.sym !== 'SPY' && r.sym !== 'QQQ') dist[gradeRow(pb, r, { vwap: vwap[r.sym] }).grade]++;

  const addPlaybook = (from?: Playbook) => {
    const n: Playbook = from
      ? { ...from, id: uid(), name: `${from.name} copy`, criteria: from.criteria.map((c) => ({ ...c, id: uid() })) }
      : { id: uid(), name: 'New playbook', criteria: [{ id: uid(), type: 'rvolMin', weight: 2, enabled: true, min: 2 }] };
    setPlaybooks([...playbooks, n]);
    setEditId(n.id);
  };
  const used = new Set(pb.criteria.map((c) => c.type));

  return (
    <div className="overlay" role="dialog" aria-label="Playbook editor">
      <div className="overlay-in pbe">
        <div className="phead">
          <div className="phead-title">Playbooks</div>
          <div className="phead-ctl"><span className="muted small">Grades: {GRADE_CUTS.map(([g, c]) => `${g} ≥${c}%`).join(' · ')} of evaluable weight</span></div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="pbe-body">
          <aside className="pbe-list">
            {playbooks.map((x) => (
              <button key={x.id} className={`pbe-item ${x.id === pb.id ? 'on' : ''}`} onClick={() => setEditId(x.id)}>
                {x.name}{x.id === activeId && <span className="tag">active</span>}
              </button>
            ))}
            <button className="chip sm" onClick={() => addPlaybook()}>+ New</button>
            <button className="chip sm" onClick={() => addPlaybook(pb)}>Duplicate</button>
          </aside>
          <section className="pbe-main">
            <div className="pbe-head">
              <input className="pbe-name" value={pb.name} onChange={(e) => update({ ...pb, name: e.target.value })} aria-label="Playbook name" />
              <button className="btn" disabled={pb.id === activeId} onClick={() => setActiveId(pb.id)}>{pb.id === activeId ? 'Active in scanner' : 'Use in scanner'}</button>
              <button className="btn" disabled={playbooks.length < 2} onClick={() => { const rest = playbooks.filter((x) => x.id !== pb.id); setPlaybooks(rest); setEditId(rest[0].id); if (activeId === pb.id) setActiveId(rest[0].id); }}>Delete</button>
            </div>
            <table className="grid pbe-t">
              <thead><tr><th>On</th><th>Criterion</th><th>Threshold</th><th>Weight</th><th /></tr></thead>
              <tbody>
                {pb.criteria.map((c) => {
                  const m = CRIT_META[c.type];
                  return (
                    <tr key={c.id} className={c.enabled ? '' : 'off'}>
                      <td><input type="checkbox" checked={c.enabled} onChange={(e) => setCrit(c.id, { enabled: e.target.checked })} aria-label="Enabled" /></td>
                      <td title={m.help}>{m.label}<div className="small muted">{m.help}</div></td>
                      <td className="pbe-th">
                        {(m.params === 'min' || m.params === 'range') && <input inputMode="decimal" value={c.min ?? ''} placeholder="min" onChange={(e) => setCrit(c.id, { min: e.target.value === '' ? undefined : +e.target.value })} />}
                        {m.params === 'range' && <><span className="muted">–</span><input inputMode="decimal" value={c.max ?? ''} placeholder="max" onChange={(e) => setCrit(c.id, { max: e.target.value === '' ? undefined : +e.target.value })} /></>}
                        {m.unit && m.params !== 'none' && <span className="muted small">{m.unit}</span>}
                        {m.params === 'none' && <span className="muted small">yes/no</span>}
                      </td>
                      <td className="pbe-w">
                        <input type="range" min={0} max={5} step={1} value={c.weight} onChange={(e) => setCrit(c.id, { weight: +e.target.value })} aria-label="Weight" />
                        <span className="num">{c.weight}</span>
                      </td>
                      <td><button className="wl-x vis" onClick={() => update({ ...pb, criteria: pb.criteria.filter((x) => x.id !== c.id) })} aria-label="Remove criterion">×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="pbe-foot">
              <select value="" onChange={(e) => { const t = e.target.value as CritType; if (t) update({ ...pb, criteria: [...pb.criteria, { id: uid(), type: t, weight: 2, enabled: true, min: CRIT_META[t].params === 'none' ? undefined : 0 }] }); }} aria-label="Add criterion">
                <option value="">+ Add criterion…</option>
                {(Object.keys(CRIT_META) as CritType[]).filter((t) => !used.has(t)).map((t) => <option key={t} value={t}>{CRIT_META[t].label}</option>)}
              </select>
              <span className="muted small">Across the current scan: {Object.entries(dist).map(([g, n]) => `${g} ${n}`).join(' · ')}</span>
            </div>
            <p className="note">Criteria without data for a ticker (e.g. VWAP when no intraday candles are loaded) are left out of that ticker’s score; a * on the grade means under half the weight could be checked.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
