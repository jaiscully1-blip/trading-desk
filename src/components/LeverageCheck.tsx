// Leverage and conviction check (a reminder, not a gate). Used as a Home widget, as a read-only strip on the Webull ticket and in
// the My rules widget. Nothing here blocks or sends an order.
import { useState } from 'react';
import { usePersisted } from '../lib/store';
import { CONVICTION, DEFAULT_LIMITS, RISK_LABEL, assess, type Limits, type Risk } from '../../shared/leverage';

export const LEVERAGE_REMINDER = 'Don’t over-leverage. Size it so a loss won’t hurt. Options: buy time (far-dated expirations), and scale size to how sure you are.';

export function LeverageBanner() {
  return <p className="lv-banner small" role="note"><b>Reminder:</b> {LEVERAGE_REMINDER}</p>;
}

export function LeverageCheck({ equity, seed, compact }: { equity: number | null; seed?: { atRisk?: number | null; position?: number | null }; compact?: boolean }) {
  const [limits, setLimits] = usePersisted<Limits>('leverageLimits', DEFAULT_LIMITS);
  const [conv, setConv] = useState<number | null>(null); // never remembered: pick it fresh for every trade
  const [macro, setMacro] = usePersisted<Risk>('macroRisk', 'normal'); // changes slowly, so it is remembered
  const [company, setCompany] = useState<Risk>('normal');
  const [kind, setKind] = useState<'stock' | 'option'>('stock');
  const [risk, setRisk] = useState('');
  const [pos, setPos] = useState('');
  const [dte, setDte] = useState('');
  const [edit, setEdit] = useState(false);
  const num = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const fromSeed = seed != null;
  const r = assess({
    conviction: conv, equity, limits, macro, company,
    atRisk: fromSeed ? seed!.atRisk ?? null : num(risk), position: fromSeed ? seed!.position ?? null : num(pos),
    option: !fromSeed && kind === 'option', dte: !fromSeed && kind === 'option' && dte !== '' ? Math.round(num(dte) ?? NaN) || null : null,
  });
  return (
    <div className={`lv ${compact ? 'compact' : 'hw-pad'}`}>
      <LeverageBanner />
      <div className="lv-conv" role="group" aria-label="Conviction">
        <span className="small muted">How sure am I?</span>
        {CONVICTION.map((c, i) => <button key={c} className={`chip sm ${conv === i + 1 ? 'on' : ''}`} onClick={() => setConv(conv === i + 1 ? null : i + 1)} aria-pressed={conv === i + 1}>{c}</button>)}
      </div>
      <div className="lv-conv" role="group" aria-label="Macro risk">
        <span className="small muted" title="Check Credit market (spreads, yield curve), the Calendar (Fed, CPI) and the VIX">Macro risk now</span>
        {(['low', 'normal', 'high'] as Risk[]).map((r) => <button key={r} className={`chip sm ${macro === r ? 'on' : ''}`} onClick={() => setMacro(r)} aria-pressed={macro === r}>{RISK_LABEL[r]}</button>)}
      </div>
      <div className="lv-conv" role="group" aria-label="Company risk">
        <span className="small muted" title="Earnings inside the option's life, small or unprofitable company, distress flags, headline risk">Company risk</span>
        {(['low', 'normal', 'high'] as Risk[]).map((r) => <button key={r} className={`chip sm ${company === r ? 'on' : ''}`} onClick={() => setCompany(r)} aria-pressed={company === r}>{RISK_LABEL[r]}</button>)}
      </div>
      {!fromSeed && (
        <div className="lv-in">
          <label className="small">Instrument<select value={kind} onChange={(e) => setKind(e.target.value as 'stock' | 'option')}><option value="stock">Stock / ETF</option><option value="option">Option (long)</option></select></label>
          <label className="small">{kind === 'option' ? 'Premium I pay ($)' : 'Most I could lose ($)'}<input inputMode="decimal" value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="e.g. 150" /></label>
          {kind === 'stock' && <label className="small">Position size ($)<input inputMode="decimal" value={pos} onChange={(e) => setPos(e.target.value)} placeholder="optional" /></label>}
          {kind === 'option' && <label className="small">Days to expiration<input inputMode="numeric" value={dte} onChange={(e) => setDte(e.target.value)} placeholder="e.g. 90" /></label>}
        </div>
      )}
      <div className="lv-out" role="status" aria-live="polite">
        {r.pct != null && <p className="lv-num"><b className="num">{r.pct < 10 ? r.pct.toFixed(2) : r.pct.toFixed(1)}%</b> of my account at risk{r.cap != null ? <> · my limit at conviction {conv} is <b className="num">{r.cap}%</b></> : null}</p>}
        {r.flags.map((f, i) => <p key={i} className={`small ${f.level === 'warn' ? 'lv-warn' : 'muted'}`}>{f.level === 'warn' ? '⚠ ' : ''}{f.text}</p>)}
        {r.flags.length === 0 && conv && <p className="small muted">Within your limits. A reminder, not a green light: the trade can still lose.</p>}
      </div>
      {!compact && (
        <>
          <button className="link small" onClick={() => setEdit(!edit)}>{edit ? 'done' : 'edit my limits'}</button>
          {edit && (
            <div className="lv-lim">
              <p className="small muted">Most I will lose on one trade, as % of my account, by conviction. These starting numbers are generic: set your own.</p>
              <div className="lv-in">{limits.capPct.map((c, i) => <label key={i} className="small">{CONVICTION[i].split(' · ')[0]} · {CONVICTION[i].split(' · ')[1]}<input inputMode="decimal" value={c} onChange={(e) => { const v = parseFloat(e.target.value); const a = [...limits.capPct]; a[i] = Number.isFinite(v) && v >= 0 ? v : 0; setLimits({ ...limits, capPct: a }); }} /></label>)}
                <label className="small">Options: least days to expiration<input inputMode="numeric" value={limits.minDte} onChange={(e) => { const v = parseInt(e.target.value, 10); setLimits({ ...limits, minDte: Number.isFinite(v) && v >= 0 ? v : 0 }); }} /></label></div>
              <button className="link small" onClick={() => setLimits(DEFAULT_LIMITS)}>reset to defaults</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
