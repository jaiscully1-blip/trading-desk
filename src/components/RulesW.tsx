// "My rules": live status of the guardrails the journal already enforces (check-in, daily loss, heat, cooldown, rule breaks)
// plus a personal before-the-open checklist that resets each trading day. Nothing here blocks a trade; it keeps the rules in view.
import { useState } from 'react';
import type { AccountSettings, Guard, Violation } from '../lib/journal';
import { VIOLATION_LABEL, etDay } from '../lib/journal';

export interface RulesData { g: Guard; settings: AccountSettings; checkedIn: boolean; viols: Violation[]; hasAccount: boolean }

export const DEFAULT_MY_RULES = [
  'Pre-session check-in done before the first trade',
  'Every trade has a playbook, entry, stop and target before I buy',
  'Size from the risk % — never bigger',
  'No new trades after the daily loss limit or during a cooldown',
  'The stop never moves further away',
  'Log every trade in the journal the same day',
];

type Row = { label: string; ok: boolean | null; detail: string };

export function ruleRows(r: RulesData, now: number): Row[] {
  const s = r.settings, g = r.g;
  const today = etDay(now);
  const lossUsed = s.maxDailyLossPct > 0 ? (Math.max(0, -g.todayRealized) / Math.max(1, g.startOfDay)) * 100 : 0;
  const todays = r.viols.filter((v) => etDay(v.t) === today);
  return [
    { label: 'Checked in today', ok: r.checkedIn, detail: r.checkedIn ? 'done' : 'open the check-in before your first trade' },
    { label: `Daily loss under ${s.maxDailyLossPct}%`, ok: r.hasAccount ? g.lockout !== 'Locked' : null, detail: r.hasAccount ? `${lossUsed.toFixed(2)}% used${g.lockout === 'Locked' ? ' · LOCKED for today' : ''}` : 'set a starting balance in the account drawer' },
    { label: `Heat under ${s.maxHeatPct}%`, ok: r.hasAccount ? g.heatPct <= s.maxHeatPct : null, detail: r.hasAccount ? `${g.heatPct.toFixed(2)}% of equity at risk in open trades` : '' },
    { label: 'No loss-streak cooldown', ok: g.lockout !== 'Cooldown', detail: g.lockout === 'Cooldown' && g.cooldownUntil ? `cooldown until ${new Date(g.cooldownUntil).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET` : `${g.lossStreak} loss${g.lossStreak === 1 ? '' : 'es'} in a row today` },
    { label: 'No rule breaks today', ok: todays.length === 0, detail: todays.length ? todays.map((v) => `${v.sym}: ${VIOLATION_LABEL[v.type]}`).join(' · ') : 'clean' },
  ];
}

/** Compact row of rule lights (used on the Morning page). */
export function RulesStatus({ r, now }: { r: RulesData; now: number }) {
  return (
    <div className="rules-lights">
      {ruleRows(r, now).map((x) => <span key={x.label} className={`rule-light ${x.ok == null ? 'na' : x.ok ? 'ok' : 'bad'}`} title={x.detail}>{x.ok == null ? '○' : x.ok ? '✓' : '✕'} {x.label}</span>)}
    </div>
  );
}

export function RulesW({ r, now, cfg, set }: { r: RulesData | undefined; now: number; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const mine: string[] = cfg.rules ?? DEFAULT_MY_RULES;
  const today = etDay(now);
  const done: number[] = cfg.doneDay === today ? cfg.done ?? [] : [];
  const [add, setAdd] = useState('');
  const [edit, setEdit] = useState(false);
  const toggle = (i: number) => set({ ...cfg, doneDay: today, done: done.includes(i) ? done.filter((x) => x !== i) : [...done, i] });
  const week = r ? r.viols.filter((v) => now - v.t < 7 * 86400_000) : [];
  const weekCost = week.reduce((a, v) => a + v.cost, 0);
  return (
    <div className="hw-pad rules-w">
      {r && (
        <ul className="rules-rows">
          {ruleRows(r, now).map((x) => (
            <li key={x.label} className={x.ok == null ? 'na' : x.ok ? 'ok' : 'bad'}><b>{x.ok == null ? '○' : x.ok ? '✓' : '✕'}</b><span>{x.label}</span>{x.detail && <em>{x.detail}</em>}</li>
          ))}
        </ul>
      )}
      {r && week.length > 0 && <p className="small down">Last 7 days: {week.length} rule break{week.length === 1 ? '' : 's'}, cost ${Math.round(weekCost).toLocaleString()}.</p>}
      <div className="rules-h"><b>Before the open</b> <span className="muted small">{done.length}/{mine.length}</span> <button className="link small" onClick={() => setEdit((e) => !e)}>{edit ? 'done' : 'edit'}</button></div>
      <ul className="rules-check">
        {mine.map((t, i) => (
          <li key={i}>
            <label><input type="checkbox" checked={done.includes(i)} onChange={() => toggle(i)} /> <span className={done.includes(i) ? 'muted' : ''}>{t}</span></label>
            {edit && <button className="link small down" onClick={() => set({ ...cfg, rules: mine.filter((_, j) => j !== i), done: [] })} aria-label={`Remove rule ${t}`}>remove</button>}
          </li>
        ))}
      </ul>
      {edit && (
        <form className="rules-add" onSubmit={(e) => { e.preventDefault(); if (add.trim()) { set({ ...cfg, rules: [...mine, add.trim().slice(0, 140)] }); setAdd(''); } }}>
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add a rule…" aria-label="New rule" />
          <button className="hw-btn" type="submit">Add</button>
          <button type="button" className="link small" onClick={() => set({ ...cfg, rules: DEFAULT_MY_RULES, done: [] })}>reset to defaults</button>
        </form>
      )}
    </div>
  );
}
