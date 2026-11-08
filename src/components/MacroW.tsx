// Macro and liquidity widget: Fed balance sheet, Treasury cash, reverse repo, junk-bond spread, real yield, financial conditions (FRED, observed)
// plus net liquidity (calculated). Direction words only; nothing here says bullish or bearish.
import type { HomeData } from './HomeWidgets';
import { useMacroPack } from '../data/macro';
import { Fresh } from './common';
import type { LiqRow } from '../../shared/liquidity';

const money = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(2)}T` : `$${v.toFixed(0)}B`);
const fmt = (r: LiqRow, v: number) => (r.unit === '$B' ? money(v) : r.unit === '%' ? `${v.toFixed(2)}%` : v.toFixed(2));
const dlt = (r: LiqRow, v: number | null) => (v == null ? '' : `${v >= 0 ? '+' : '−'}${r.unit === '$B' ? money(Math.abs(v)).replace('$', '$') : Math.abs(v).toFixed(2) + (r.unit === '%' ? ' pt' : '')}`);
const word = (r: LiqRow) => {
  const v = r.chg4w;
  if (v == null || v === 0) return '';
  if (r.id === 'BAMLH0A0HYM2') return v > 0 ? 'wider' : 'tighter';
  if (r.id === 'NFCI') return v > 0 ? 'tightening' : 'loosening';
  return v > 0 ? 'rising' : 'falling';
};

export function MacroW({ d }: { d: HomeData; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const { pack, error, loading } = useMacroPack(d.mode);
  if (d.mode.kind !== 'live') return <p className="hw-pad small muted">Needs live data (FRED key). Nothing is shown in demo mode.</p>;
  if (loading) return <p className="hw-pad small muted">Loading from FRED…</p>;
  if (!pack?.liquidity.length) return <p className="hw-pad small down">{error || 'FRED returned no liquidity series.'}</p>;
  return (
    <div className="mw">
      <div className="hw-bar"><Fresh kind="eod" at={pack.asOf} src="FRED (St. Louis Fed), end of day / weekly" /><span className="muted small">net liquidity is calculated</span></div>
      <div className="mw-t">
        <div className="mw-r mw-h"><span>Series</span><span>Latest</span><span>1 week</span><span>4 weeks</span></div>
        {pack.liquidity.map((r) => (
          <div key={r.id} className="mw-r" title={`${r.note} As of ${r.date}.`}>
            <span>{r.label}{r.calculated && <span className="tag mw-calc">CALCULATED</span>}</span>
            <b className="num">{fmt(r, r.value)}</b>
            <span className="num small muted">{dlt(r, r.chg1w)}</span>
            <span className="num small">{dlt(r, r.chg4w)} <span className="muted">{word(r)}</span></span>
          </div>
        ))}
      </div>
      <p className="note">Hover a row for what it means. Weekly series update on Thursdays; reverse repo, spread and real yield update daily. These describe conditions, not direction.</p>
    </div>
  );
}
