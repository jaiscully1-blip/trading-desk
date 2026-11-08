import type { LadderRow } from '../../shared/ladder';
import { distLabel } from '../../shared/ladder';
import { px } from '../lib/format';

/** Slim strip beside the chart: every level in price order, last price marked, nearest level highlighted. */
export function Ladder({ rows, nearest }: { rows: LadderRow[]; nearest: string | null }) {
  if (rows.length < 2) return null;
  return (
    <aside className="ladder" aria-label="Level ladder">
      {rows.map((r) => (
        <div key={r.key} className={`lad-r ${r.kind} ${r.key === nearest ? 'near' : ''} ${r.dist > 0 ? 'above' : r.dist < 0 ? 'below' : ''}`} title={`${r.label} ${px(r.value)}`}>
          <span className="lad-n">{r.short}</span>
          <span className="lad-v num">{px(r.value)}</span>
          {r.kind !== 'last' && <span className="lad-d num">{distLabel(r.dist)}</span>}
        </div>
      ))}
    </aside>
  );
}
