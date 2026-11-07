import type { Freshness, OrMinutes } from '../types';
import { LEVEL_SHORT, LEVEL_LABEL, type Level, type LevelId } from '../lib/levels';
import { pct, pts, px, tone } from '../lib/format';
import { Fresh, Seg } from './common';

export interface LevelCol {
  sym: string;
  last: number;
  levels: Level[];
  freshness: Freshness;
  asOf?: number;
  source?: string;
  error?: string;
}

const ROWS: LevelId[] = ['pdh', 'pdl', 'pdc', 'pmh', 'pml', 'vwap', 'orh', 'orl'];

export function LevelsPanel({
  cols, orMin, setOrMin, alertsOn, toggleAlerts, onSelect, sel, onClose,
}: {
  cols: LevelCol[]; orMin: OrMinutes; setOrMin: (m: OrMinutes) => void;
  alertsOn: Record<string, boolean>; toggleAlerts: (sym: string) => void;
  onSelect: (s: string) => void; sel: string; onClose: () => void;
}) {
  return (
    <section className="panel levels">
      <div className="phead">
        <div className="phead-title">Levels</div>
        <div className="phead-ctl">
          <span className="muted small">Opening range</span>
          <Seg<string> value={String(orMin)} onChange={(v) => setOrMin(+v as OrMinutes)} options={[{ id: '5', label: '5m' }, { id: '15', label: '15m' }, { id: '30', label: '30m' }]} />
        </div>
        <button className="icon-btn" onClick={onClose} title="Hide levels (L)" aria-label="Hide levels">×</button>
      </div>
      <div className="lv-grid" style={{ gridTemplateColumns: `minmax(64px, 112px) repeat(${cols.length}, minmax(max-content, 1fr))` }}>
        <div className="lv-h" />
        {cols.map((c) => (
          <div key={c.sym} className={`lv-h ${sel === c.sym ? 'sel' : ''}`}>
            <button className="lv-sym" onClick={() => onSelect(c.sym)}>{c.sym}</button>
            <span className="num">{px(c.last)}</span>
            <button
              className={`bell ${alertsOn[c.sym] ? 'on' : ''}`}
              onClick={() => toggleAlerts(c.sym)}
              title={alertsOn[c.sym] ? 'Alerts on: touch or break of any level' : 'Alerts off'}
              aria-pressed={!!alertsOn[c.sym]}
            >
              {alertsOn[c.sym] ? 'Alerts on' : 'Alerts off'}
            </button>
            <Fresh kind={c.freshness} at={c.asOf} src={c.source} />
          </div>
        ))}
        {ROWS.map((id) => (
          <Row key={id} id={id} cols={cols} />
        ))}
      </div>
      <p className="note lv-note">Distances are last price minus level.</p>
    </section>
  );
}

function Row({ id, cols }: { id: LevelId; cols: LevelCol[] }) {
  // a level the free data can't provide for any column (premarket high/low) is left out
  if (cols.length && cols.every((c) => c.levels.find((x) => x.id === id)?.status === 'unavailable')) return null;
  return (
    <>
      <div className="lv-l" title={LEVEL_LABEL[id]}>{LEVEL_SHORT[id]}<span className="muted small"> {LEVEL_LABEL[id].replace(/^(Prior-day|Premarket|Opening-range) /, '')}</span></div>
      {cols.map((c) => {
        const l = c.levels.find((x) => x.id === id);
        if (!l || l.value == null) {
          const why = l?.status === 'unavailable' ? 'free tier: n/a' : l?.status === 'forming' ? 'forming' : c.error ? 'no data' : '—';
          return <div key={c.sym} className="lv-c muted small">{why}</div>;
        }
        // nearest level gets highlighted
        const nearest = c.levels.filter((x) => x.value != null).sort((a, b) => Math.abs(c.last - a.value!) - Math.abs(c.last - b.value!))[0]?.id === id;
        const d = c.last - l.value;
        return (
          <div key={c.sym} className={`lv-c ${nearest && Number.isFinite(c.last) ? 'near' : ''}`}>
            <span className="num">{px(l.value)}</span>
            <span className={`num small ${tone(d)}`}>{pts(d)}</span>
            <span className={`num small ${tone(d)}`}>{pct((d / l.value) * 100)}</span>
          </div>
        );
      })}
    </>
  );
}
