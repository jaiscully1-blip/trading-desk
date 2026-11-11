// Data status page: every provider the desk uses, whether it is working, how much of its free budget this server has used, what it feeds, and what takes over.
// Counts and errors are per serverless instance, so they describe what the server has seen recently, not an account-wide total.
import { useEffect, useState } from 'react';
import type { DataMode } from '../data/live';
import { STATE_LABEL, type ProviderState } from '../../shared/providers';
import { etTime } from '../lib/clock';
import { privatePost } from '../data/private';

/** Phone alerts card: how to switch them on, and a test button (desk password required on the server). */
function PhoneAlerts({ on }: { on: boolean }) {
  const [msg, setMsg] = useState('');
  const test = async () => { setMsg('Sending…'); const r = await privatePost({ fn: 'notify-test' }, {}); setMsg(r.ok ? 'Sent. Check your phone.' : String(r.j?.error ?? `HTTP ${r.status}`)); };
  return (
    <div className="pa-card">
      <h4>Phone alerts while the desk is closed <span className="ds-pill idle"><i />Paused</span></h4>
      <p className="small muted">Paused for now by choice: the market-hours check is switched off in <code>.github/workflows/alerts.yml</code>. Everything below is ready for when you want it back.</p>
      <p className="small">Every ~10 minutes in market hours a GitHub Action checks the tickers in <code>alerts/tickers.txt</code> and pushes to the free <a href="https://ntfy.sh" target="_blank" rel="noreferrer noopener">ntfy</a> app: a 4% and 8% move, or a break of yesterday's high or low, each once a day. The nightly distress read also pushes when a name on that list changes label. Only tickers and prices are sent. Information only: nothing trades.</p>
      {!on && <ol className="small muted"><li>Install ntfy on your phone and subscribe to a long random topic name (it works like a password).</li><li>Add that name as <code>NTFY_TOPIC</code> in Vercel and as a GitHub Actions secret. Optional repo variables: <code>DESK_URL</code>, <code>ALERT_MOVE_PCT</code>.</li><li>Redeploy, then press Send test.</li></ol>}
      <button className="btn sm" onClick={test}>Send test</button> <span className="small muted">{msg}</span>
    </div>
  );
}

interface Row {
  id: string; label: string; feeds: string; fallback: string; unofficial: boolean; keyed: boolean; hasKey: boolean; state: ProviderState;
  min: { used: number; limit: number }; day: { used: number; limit: number | null }; lastOk: number | null; lastError: string | null; lastErrorAt: number | null;
}
const ORDER: Record<ProviderState, number> = { limited: 0, error: 1, 'no-key': 2, ok: 3, idle: 4 };
const ago = (t: number | null) => { if (t == null) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

export default function DataStatus({ mode }: { mode: DataMode }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false;
    const go = async () => {
      try { const r = await fetch('/api/research?fn=status'); const j = await r.json(); if (!stop) { if (r.ok) { setRows(j.rows); setAt(j.asOf); setErr(''); } else setErr(j.error ?? `HTTP ${r.status}`); } } catch (e) { if (!stop) setErr((e as Error).message); }
    };
    void go();
    const id = setInterval(go, 20_000);
    return () => { stop = true; clearInterval(id); };
  }, [mode.kind]);

  if (mode.kind !== 'live') return <section className="panel"><div className="phead"><div className="phead-title">Data status</div></div><p className="hw-pad small muted">Needs live data: there are no providers to check in demo mode.</p></section>;
  const sorted = rows ? [...rows].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.label.localeCompare(b.label)) : [];
  const bad = sorted.filter((r) => r.state === 'limited' || r.state === 'error').length;
  return (
    <section className="panel ds">
      <div className="phead">
        <div className="phead-title">Data status</div>
        <div className="phead-ctl"><span className="muted small">{rows ? (bad ? `${bad} source${bad > 1 ? 's' : ''} need attention` : 'all sources fine') : 'checking…'}{at ? ` · updated ${etTime(at)} ET` : ''}</span></div>
      </div>
      <div className="ds-body">
        <PhoneAlerts on={!!mode.health.private?.alerts} />
        <p className="note">Why a chart or table can be empty: a free source ran out of its limit, so the desk switched to the backup listed here. Candles try <b>Twelve Data</b>, then <b>Yahoo Finance</b>, then <b>Alpha Vantage</b> (daily only). Counts are per server instance, so they show what this server has seen recently.</p>
        {err && <p className="down small hw-pad">{err}</p>}
        <div className="ds-t">
          <div className="ds-r ds-h"><span>Source</span><span>Status</span><span>This minute</span><span>Today</span><span>Feeds</span><span>Backup</span></div>
          {sorted.map((r) => (
            <div key={r.id} className={`ds-r ds-${r.state}`}>
              <span className="ds-n"><b>{r.label}</b>{r.unofficial && <span className="tag" title="Public data with no official terms: works today, no promise">unofficial</span>}</span>
              <span><span className={`ds-pill ${r.state}`}><i />{STATE_LABEL[r.state]}</span>{r.lastError && (r.state === 'limited' || r.state === 'error') && <span className="small muted ds-err" title={r.lastError}>{ago(r.lastErrorAt)}: {r.lastError.slice(0, 60)}</span>}</span>
              <span className="num small">{r.keyed && !r.hasKey ? '' : `${r.min.used} / ${r.min.limit}`}</span>
              <span className="num small">{r.keyed && !r.hasKey ? '' : `${r.day.used}${r.day.limit ? ` / ${r.day.limit}` : ''}`}</span>
              <span className="small">{r.feeds}</span>
              <span className="small muted">{r.fallback}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
