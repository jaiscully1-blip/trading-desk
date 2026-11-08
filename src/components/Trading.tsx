// Trade ticket (checklist-gated entry), open positions, risk panel and the pre-session check-in.
import { useEffect, useState } from 'react';
import { EMOTIONS, TILT_HIGH, sizeFor, tiltScore, unrealized, type AccountSettings, type CheckIn, type ChecklistItem, type Emotion, type Guard, type Trade, type TradeView, type Violation, VIOLATION_LABEL } from '../lib/journal';
import type { GradeResult, Playbook } from '../lib/playbook';
import { critLabel } from './Scanner';
import { etTime, hms } from '../lib/clock';
import { pct, px, sUsd, tone, usd } from '../lib/format';

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Resize to ≤1280px wide and JPEG-compress, so screenshots stay ~100-200 KB. */
export async function compressImage(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1280 / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.75);
  } finally { URL.revokeObjectURL(url); }
}

export function ScreenshotInput({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const take = async (f: Blob | null | undefined) => { if (f && f.type.startsWith('image/')) onChange(await compressImage(f)); };
  return (
    <div
      className="shot"
      tabIndex={0}
      onPaste={(e) => take([...e.clipboardData.items].find((i) => i.type.startsWith('image/'))?.getAsFile())}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]); }}
      title="Paste (Ctrl+V), drop or choose an image"
    >
      {value ? (
        <>
          <img src={value} alt="Trade screenshot" />
          <button type="button" className="wl-x vis" onClick={() => onChange(undefined)} aria-label="Remove screenshot">×</button>
        </>
      ) : (
        <label className="small muted">Screenshot: paste, drop, or <u>choose</u><input type="file" accept="image/*" hidden onChange={(e) => take(e.target.files?.[0])} /></label>
      )}
    </div>
  );
}

/* ---------------- Pre-session check-in ---------------- */
export function CheckInDialog({ day, onSave, onClose, existing }: { day: string; onSave: (c: CheckIn) => void; onClose: () => void; existing?: CheckIn }) {
  const [c, setC] = useState({ sleep: existing?.sleep ?? 3, mood: existing?.mood ?? 3, stress: existing?.stress ?? 3, chasing: existing?.chasing ?? false, note: existing?.note ?? '' });
  const tilt = tiltScore(c);
  const Scale = ({ k, label, lo, hi }: { k: 'sleep' | 'mood' | 'stress'; label: string; lo: string; hi: string }) => (
    <div className="ci-row">
      <span>{label}</span>
      <div className="seg">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={c[k] === n ? 'on' : ''} onClick={() => setC({ ...c, [k]: n })}>{n}</button>)}</div>
      <span className="muted small">{lo} → {hi}</span>
    </div>
  );
  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="cmd ci" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Pre-session check-in">
        <div className="phead"><div className="phead-title">Pre-session check-in · {day}</div><div className="phead-ctl" /><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
        <div className="ci-body">
          <Scale k="sleep" label="Sleep" lo="bad" hi="great" />
          <Scale k="mood" label="Mood" lo="low" hi="good" />
          <Scale k="stress" label="Stress" lo="calm" hi="high" />
          <label className="ci-row"><input type="checkbox" checked={c.chasing} onChange={(e) => setC({ ...c, chasing: e.target.checked })} /> I want to make back a recent loss today</label>
          <textarea rows={2} placeholder="Anything on your mind?" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} />
          <div className={`ci-score ${tilt >= TILT_HIGH ? 'down' : ''}`}>
            Tilt score <b className="num">{tilt}</b>/100 {tilt >= TILT_HIGH ? '· High: risk per trade is halved today' : '· OK to trade your normal size'}
          </div>
          <button className="btn primary" onClick={() => onSave({ day, t: Date.now(), ...c, tilt, updated: Date.now() })}>Save check-in</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Trade ticket ---------------- */
export interface TicketProps {
  sym: string;
  last: number;
  playbook: Playbook | undefined;
  grade: GradeResult | undefined;
  guard: Guard;
  settings: AccountSettings;
  checkin: CheckIn | undefined;
  onCheckIn: () => void;
  onLog: (t: Trade) => void;
  now: number;
  demoPrices: boolean;
}

export function TradeTicket(p: TicketProps) {
  const blank = () => ({ sym: p.sym, side: 'long' as 'long' | 'short', entry: '', stop: '', target: '', size: '', setup: '', thesis: '', emotion: null as Emotion | null, shot: undefined as string | undefined });
  const [f, setF] = useState(blank);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => { setF((x) => (x.entry || x.stop ? x : { ...x, sym: p.sym })); }, [p.sym]);
  useEffect(() => { setTicks({}); }, [p.playbook?.id, f.sym]);

  const entry = +f.entry || (f.sym === p.sym && Number.isFinite(p.last) ? p.last : 0);
  const stop = +f.stop, target = +f.target;
  const tilted = (p.checkin?.tilt ?? 0) >= TILT_HIGH;
  const riskPct = p.settings.riskPct * (tilted ? 0.5 : 1);
  const sz = entry && stop ? sizeFor(p.guard.startOfDay || p.guard.equity, riskPct, entry, stop) : null;
  const size = f.size ? +f.size : sz?.shares ?? 0;
  const wrongSide = entry && stop ? (f.side === 'long' ? stop >= entry : stop <= entry) : false;
  const riskDollars = entry && stop ? Math.abs(entry - stop) * size : 0;
  const rTarget = entry && stop && target ? Math.abs(target - entry) / Math.abs(entry - stop) : 0;
  const heatAfter = p.guard.equity > 0 && Number.isFinite(p.guard.openRisk) ? ((p.guard.openRisk + riskDollars) / p.guard.equity) * 100 : NaN;

  // checklist from the active playbook, with the scanner's verdict as a hint
  const items: ChecklistItem[] = (p.playbook?.criteria ?? []).filter((c) => c.enabled && c.weight > 0).map((c) => {
    const r = f.sym === p.sym ? p.grade?.results.find((x) => x.c.id === c.id) : undefined;
    return { label: critLabel(c), auto: r?.status ?? 'na' };
  });
  const allTicked = items.length > 0 && items.every((_, i) => ticks[i]);

  const blocks: string[] = [];
  if (p.settings.startBalance == null) blocks.push('Set your starting balance (account drawer) first');
  if (!p.checkin) blocks.push('Do the pre-session check-in first');
  if (p.guard.lockout === 'Locked') blocks.push(`Locked: ${p.guard.reason}`);
  if (p.guard.lockout === 'Cooldown' && p.guard.cooldownUntil) blocks.push(`Cooldown: ${hms(Math.ceil((p.guard.cooldownUntil - p.now) / 1000))} left`);
  if (!items.length) blocks.push('Active playbook has no criteria');
  else if (!allTicked) blocks.push(`Tick every checklist item (${items.filter((_, i) => ticks[i]).length}/${items.length})`);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(f.sym)) blocks.push('Ticker');
  if (!(entry > 0) || !(stop > 0)) blocks.push('Entry and stop');
  else if (wrongSide) blocks.push('Stop is on the wrong side of entry');
  if (!(size > 0)) blocks.push('Size');

  const warns: string[] = [];
  if (sz && size > sz.shares) warns.push(`Size ${size} is over your ${riskPct}% risk (${sz.shares} sh). It will be logged as a violation.`);
  if (heatAfter > p.settings.maxHeatPct) warns.push(`Heat would be ${heatAfter.toFixed(1)}% (max ${p.settings.maxHeatPct}%).`);
  const failTicked = items.filter((it, i) => ticks[i] && it.auto === 'fail');
  if (failTicked.length) warns.push(`You ticked ${failTicked.length} item(s) the data says failed. Logged as a violation.`);

  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: k === 'sym' ? e.target.value.toUpperCase() : e.target.value }));
  const log = () => {
    const now = Date.now();
    p.onLog({
      id: uid(), created: now, updated: now, sym: f.sym, side: f.side, initialStop: stop, stop, stopHistory: [], target: target || null, plannedSize: size,
      thesis: f.thesis, setup: f.setup, emotion: f.emotion,
      grade: f.sym === p.sym && p.grade && p.playbook ? { grade: p.grade.grade + (p.grade.partial ? '*' : ''), score: Math.round(p.grade.score), playbook: p.playbook.name } : null,
      checklist: items, screenshot: f.shot,
      fills: [{ id: uid(), t: now, action: f.side === 'long' ? 'buy' : 'sell', qty: size, price: entry, src: 'manual' }],
    });
    setF(blank()); setTicks({});
  };

  return (
    <div className="ticket">
      {!p.checkin && <button className="banner warn" onClick={p.onCheckIn}>Pre-session check-in not done today. Do it now →</button>}
      {tilted && <div className="banner warn">Tilt {p.checkin!.tilt}/100: risk per trade halved to {riskPct}%.</div>}
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (!blocks.length) log(); }}>
        <label>Ticker<input value={f.sym} onChange={set('sym')} /></label>
        <label>Side
          <select value={f.side} onChange={set('side')}><option value="long">Long</option><option value="short">Short</option></select>
        </label>
        <label>Entry<input inputMode="decimal" value={f.entry} onChange={set('entry')} placeholder={entry ? px(entry) : ''} /></label>
        <label>Stop<input inputMode="decimal" value={f.stop} onChange={set('stop')} /></label>
        <label>Target<input inputMode="decimal" value={f.target} onChange={set('target')} /></label>
        <label>Size (sh)<input inputMode="numeric" value={f.size} onChange={set('size')} placeholder={sz ? String(sz.shares) : ''} /></label>
        <label className="span2">Setup tag<input value={f.setup} onChange={set('setup')} placeholder="ORB, bull flag, gap-and-go…" /></label>
        <label className="span2">Thesis<textarea rows={2} value={f.thesis} onChange={set('thesis')} /></label>
        <div className="span2 emo">
          {EMOTIONS.map((e) => <button type="button" key={e} className={`chip sm ${f.emotion === e ? 'on' : ''}`} onClick={() => setF((x) => ({ ...x, emotion: x.emotion === e ? null : e }))}>{e}</button>)}
        </div>
        <div className="span2"><ScreenshotInput value={f.shot} onChange={(v) => setF((x) => ({ ...x, shot: v }))} /></div>
        <div className="span2 qj-calc">
          <span>Risk <b className="num">{riskDollars ? usd(riskDollars) : '—'}</b></span>
          <span>Target <b className="num">{rTarget ? `${rTarget.toFixed(2)}R` : '—'}</b></span>
          <span>Grade <b>{f.sym === p.sym && p.grade ? `${p.grade.grade}${p.grade.partial ? '*' : ''}` : '—'}</b></span>
          {p.demoPrices && <span className="demo-txt small">demo price</span>}
        </div>
        <fieldset className="span2 checklist">
          <legend>Pre-trade checklist · {p.playbook?.name ?? 'no playbook'}</legend>
          {items.map((it, i) => (
            <label key={i} className={`ck ck-${it.auto}`}>
              <input type="checkbox" checked={!!ticks[i]} onChange={(e) => setTicks((t) => ({ ...t, [i]: e.target.checked }))} />
              <span>{it.label}</span>
              <span className="ck-auto" title="What the scanner data says">{it.auto === 'pass' ? '✓ data' : it.auto === 'fail' ? '✗ data' : ''}</span>
            </label>
          ))}
        </fieldset>
        {warns.map((w) => <div key={w} className="span2 banner warn small">{w}</div>)}
        <div className="span2 ticket-go">
          <button className="btn primary" disabled={blocks.length > 0} title={blocks.join('\n')}>Log entry</button>
          {blocks.length > 0 && <span className="small muted">{blocks[0]}</span>}
        </div>
      </form>
    </div>
  );
}

/* ---------------- Open positions ---------------- */
export function OpenPositions({ views, lastPx, onClose, onStop, onSelect }: {
  views: TradeView[]; lastPx: (s: string) => number | undefined;
  onClose: (id: string, qty: number, price: number) => void; onStop: (id: string, stop: number) => void; onSelect: (s: string) => void;
}) {
  const open = views.filter((v) => v.status === 'open');
  const [edit, setEdit] = useState<{ id: string; mode: 'close' | 'stop'; a: string; b: string } | null>(null);
  if (!open.length) return null;
  return (
    <div className="openpos">
      <h4>Open positions</h4>
      {open.map((v) => {
        const last = lastPx(v.t.sym);
        const u = unrealized(v, last);
        const e = edit?.id === v.t.id ? edit : null;
        return (
          <div key={v.t.id} className="op-row">
            <button className="wl-sym" onClick={() => onSelect(v.t.sym)}>{v.t.sym}</button>
            <span className={v.t.side === 'long' ? 'up small' : 'down small'}>{v.t.side}</span>
            <span className="num small">{v.openQty}@{px(v.avgEntry ?? NaN)}</span>
            <span className={`num ${tone(u)}`}>{sUsd(u)}</span>
            <span className="num small muted">{v.risk ? `${(u / v.risk).toFixed(2)}R` : ''}</span>
            <span className="num small muted">stop {v.t.stop ?? '—'}</span>
            <button className="chip sm" onClick={() => setEdit({ id: v.t.id, mode: 'close', a: String(v.openQty), b: last ? last.toFixed(2) : '' })}>Close</button>
            <button className="chip sm" onClick={() => setEdit({ id: v.t.id, mode: 'stop', a: String(v.t.stop ?? ''), b: '' })}>Stop</button>
            {e && (
              <form className="op-edit" onSubmit={(ev) => {
                ev.preventDefault();
                if (e.mode === 'close' && +e.a > 0 && +e.b > 0) onClose(v.t.id, Math.min(+e.a, v.openQty), +e.b);
                if (e.mode === 'stop' && +e.a > 0) onStop(v.t.id, +e.a);
                setEdit(null);
              }}>
                {e.mode === 'close' ? (
                  <>
                    <input inputMode="numeric" value={e.a} onChange={(x) => setEdit({ ...e, a: x.target.value })} aria-label="Shares" />
                    <span className="muted small">sh @</span>
                    <input inputMode="decimal" value={e.b} onChange={(x) => setEdit({ ...e, b: x.target.value })} aria-label="Exit price" autoFocus />
                  </>
                ) : (
                  <input inputMode="decimal" value={e.a} onChange={(x) => setEdit({ ...e, a: x.target.value })} aria-label="New stop" autoFocus />
                )}
                <button className="btn primary">{e.mode === 'close' ? 'Exit' : 'Move'}</button>
                <button type="button" className="btn" onClick={() => setEdit(null)}>Cancel</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Risk panel ---------------- */
export function RiskPanel({ guard: g, settings: s, setSettings, checkin, onCheckIn, violations, now, last }: {
  guard: Guard; settings: AccountSettings; setSettings: (s: AccountSettings) => void; checkin?: CheckIn; onCheckIn: () => void;
  violations: Violation[]; now: number; last?: number;
}) {
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const tilted = (checkin?.tilt ?? 0) >= TILT_HIGH;
  const riskPct = s.riskPct * (tilted ? 0.5 : 1);
  const e = +entry || last || 0;
  const sz = e && +stop ? sizeFor(g.startOfDay || g.equity, riskPct, e, +stop) : null;
  const usedOfMax = Math.min(100, (g.riskUsedPct / s.maxDailyLossPct) * 100);
  const heatOfMax = Number.isFinite(g.heatPct) ? Math.min(100, (g.heatPct / s.maxHeatPct) * 100) : 100;
  const locked = g.lockout === 'Locked';
  const num = (k: keyof AccountSettings, v: string) => { const n = +v; if (Number.isFinite(n) && n >= 0) setSettings({ ...s, [k]: n }); };
  const cost = violations.reduce((a, v) => a + v.cost, 0);
  return (
    <div className="risk">
      <h4>Position size</h4>
      <div className="form">
        <label>Start-of-day equity <input value={usd(g.startOfDay || g.equity)} readOnly title="From your journal; sizing uses this" /></label>
        <label>Risk %<input value={`${riskPct}${tilted ? ' (tilt ½)' : ''}`} readOnly /></label>
        <label>Entry<input inputMode="decimal" value={entry} onChange={(x) => setEntry(x.target.value)} placeholder={last ? px(last) : ''} /></label>
        <label>Stop<input inputMode="decimal" value={stop} onChange={(x) => setStop(x.target.value)} /></label>
      </div>
      <div className="kv">
        <span>Risk $</span><b className="num">{sz ? usd(sz.dollars) : '—'}</b>
        <span>Shares</span><b className="num">{sz?.shares || '—'}</b>
        <span>Position</span><b className="num">{sz?.shares ? usd(sz.shares * e) : '—'}</b>
      </div>

      <h4>Guardrails</h4>
      <div className="kv">
        <span>Status</span><b className={g.lockout === 'Clear' ? 'up' : 'down'}>{g.lockout}{g.cooldownUntil ? ` · ${hms(Math.ceil((g.cooldownUntil - now) / 1000))}` : ''}</b>
        {g.reason && <><span>Why</span><b className="small">{g.reason}</b></>}
        <span>Daily loss used</span><b className="num">{g.riskUsedPct.toFixed(2)}% of {s.maxDailyLossPct}%</b>
      </div>
      <div className="meter" title="Realized loss today + open risk, vs max daily loss"><div className="meter-fill" style={{ width: `${usedOfMax}%` }} /></div>
      <div className="kv">
        <span>Portfolio heat</span><b className="num">{Number.isFinite(g.heatPct) ? `${g.heatPct.toFixed(2)}%` : 'open trade without stop'} of {s.maxHeatPct}%</b>
      </div>
      <div className="meter" title="Open risk to stops vs max heat"><div className={`meter-fill ${heatOfMax >= 100 ? 'bad' : ''}`} style={{ width: `${heatOfMax}%` }} /></div>
      <div className="kv">
        <span>Loss streak</span><b className="num">{g.lossStreak}</b>
        <span>Check-in</span><b>{checkin ? <button className="link" onClick={onCheckIn}>tilt {checkin.tilt}/100 · {etTime(checkin.t)}</button> : <button className="link down" onClick={onCheckIn}>not done</button>}</b>
      </div>

      <h4>Rules {locked && <span className="small muted">(can’t loosen while locked)</span>}</h4>
      <div className="form" key={JSON.stringify(s)}>
        <label>Risk / trade %<input inputMode="decimal" defaultValue={s.riskPct} disabled={locked} onBlur={(x) => num('riskPct', x.target.value)} /></label>
        <label>Max daily loss %<input inputMode="decimal" defaultValue={s.maxDailyLossPct} disabled={locked} onBlur={(x) => num('maxDailyLossPct', x.target.value)} /></label>
        <label>Max heat %<input inputMode="decimal" defaultValue={s.maxHeatPct} disabled={locked} onBlur={(x) => num('maxHeatPct', x.target.value)} /></label>
        <label>Cooldown min<input inputMode="numeric" defaultValue={s.cooldownMin} disabled={locked} onBlur={(x) => num('cooldownMin', x.target.value)} /></label>
      </div>

      <h4>Rule violations <span className={`num ${cost ? 'down' : ''}`}>{usd(-cost)}</span></h4>
      <ul className="viol">
        {violations.slice(0, 8).map((v, i) => (
          <li key={i}><span className="num muted small">{etTime(v.t)}</span><b>{v.sym}</b><span className="small">{VIOLATION_LABEL[v.type]}</span><span className={`num ${v.cost ? 'down' : 'muted'}`}>{usd(-v.cost)}</span></li>
        ))}
        {!violations.length && <li className="muted small">None. Keep it that way.</li>}
      </ul>
      <p className="note">Lockout and cooldown block new entries in the ticket. Size and heat breaks are allowed but logged and priced.</p>
    </div>
  );
}

export const fmtPct = pct;
