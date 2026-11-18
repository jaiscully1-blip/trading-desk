// Quick-math calculators for the Learn page: each takes a few numbers and shows the answer as you type.
import { useState } from 'react';
import type { CalcId } from '../../shared/lessons';
import { calc } from '../../shared/quickmath';

const FIELDS: Record<CalcId, [string, string, number][]> = {
  size: [['acct', 'Account $', 25000], ['risk', 'Risk %', 1], ['entry', 'Entry', 50], ['stop', 'Stop', 49]],
  rr: [['entry', 'Entry', 20], ['stop', 'Stop', 19], ['target', 'Target / exit', 22.5]],
  breakeven: [['rr', 'Reward : risk', 2]],
  expect: [['win', 'Win rate %', 40], ['avgWin', 'Avg win (R)', 2], ['avgLoss', 'Avg loss (R)', 1]],
  dd: [['loss', 'Drawdown %', 25]],
  atr: [['entry', 'Entry', 100], ['atr', 'ATR', 2], ['k', 'ATR multiple', 2], ['riskUsd', 'Risk $', 200]],
  em: [['price', 'Price', 100], ['iv', 'Implied vol %', 32], ['days', 'Calendar days', 30]],
  opt: [['strike', 'Strike', 50], ['prem', 'Premium', 1.2], ['qty', 'Contracts', 1], ['put', 'Put? (1 = yes)', 0]],
  kelly: [['win', 'Win rate %', 45], ['rr', 'Reward : risk', 2]],
  streak: [['win', 'Win rate %', 50], ['n', 'Losses in a row', 5], ['trades', 'Trades', 100]],
  compound: [['start', 'Start $', 10000], ['rate', 'Rate % per period', 10], ['periods', 'Periods', 10]],
  avg: [['q1', 'Shares 1', 100], ['p1', 'Price 1', 50], ['q2', 'Shares 2', 100], ['p2', 'Price 2', 46], ['now', 'Price now', 49]],
};

export function Calc({ id }: { id: CalcId }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(FIELDS[id].map(([k, , d]) => [k, String(d)])));
  const nums = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x)]));
  const out = calc(id, nums);
  return (
    <div className="qc">
      <div className="qc-in">{FIELDS[id].map(([k, label]) => <label key={k}><span>{label}</span><input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}</div>
      <div className="qc-out">{out.map((o) => <div key={o.label} className={o.main ? 'main' : ''}><span>{o.label}</span><b className={`num ${o.tone ?? ''}`}>{o.value}</b></div>)}</div>
    </div>
  );
}
