// "Reload all data" and the desk health report. The ↻ button in the top bar reloads the page with every cache skipped
// (browser, CDN and server), then this panel opens on its own with what failed, what was slow, any errors in the page
// and which data sources aren't OK, plus a report to copy for Claude. A daily scheduled run also writes the live
// site's health into the vault inbox, so issues reach the next Claude session.
import { useEffect, useState } from 'react';
import { health, reloadAll, reportText, summarize, type Summary } from '../lib/health';

type Row = { id: string; label: string; state: string; lastError: string | null; hasKey: boolean; keyed: boolean };
export const openHealth = () => dispatchEvent(new Event('td:health'));

export function ReloadButton() {
  return <button className="icon-btn" onClick={() => reloadAll()} title="Reload all data: skip every saved copy and pull the latest, then show a health report" aria-label="Reload all data">↻</button>;
}

export function HealthPanel() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState<Row[] | null>(null), [sum, setSum] = useState<Summary | null>(null), [copied, setCopied] = useState(false);
  useEffect(() => {
    const show = () => { setOpen(true); setSum(summarize()); };
    addEventListener('td:health', show);
    // right after "Reload all data", give the pages ~12 s to load, then report
    let t: ReturnType<typeof setTimeout> | undefined;
    try { if (sessionStorage.getItem('td.healthAfter')) t = setTimeout(() => { try { sessionStorage.removeItem('td.healthAfter'); } catch { /* ignore */ } show(); }, 12_000); } catch { /* private mode */ }
    return () => { removeEventListener('td:health', show); clearTimeout(t); };
  }, []);
  useEffect(() => { if (!open) return; fetch('/api/research?fn=status').then((r) => r.json()).then((j) => setRows(j.rows ?? [])).catch(() => setRows([])); const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [open]);
  if (!open || !sum) return null;
  const bad = (rows ?? []).filter((r) => r.state !== 'ok' && r.state !== 'idle' && !(r.keyed && !r.hasKey));
  const noKey = (rows ?? []).filter((r) => r.keyed && !r.hasKey);
  const text = reportText(sum, bad.map((r) => ({ name: r.label, state: r.state, note: r.lastError?.slice(0, 120) ?? undefined })));
  const ok = !sum.failed.length && !sum.slow.length && !sum.errors.length && !bad.length;
  return (
    <div className="overlay" role="dialog" aria-label="Desk health" onClick={() => setOpen(false)}>
      <div className="overlay-in hp" onClick={(e) => e.stopPropagation()}>
        <div className="phead"><div className="phead-title">Desk health {ok ? <span className="up small">· all good</span> : null}</div><button className="icon-btn" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        <div className="hp-body">
          <div className="hp-tiles">
            <div className="hp-tile"><span className="small muted">Data calls</span><b className="num">{sum.calls}</b><span className="small muted">avg {sum.avgMs} ms</span></div>
            <div className="hp-tile"><span className="small muted">Failed</span><b className={`num ${sum.failed.length ? 'down' : 'up'}`}>{sum.failed.reduce((a, f) => a + f.n, 0)}</b></div>
            <div className="hp-tile"><span className="small muted">Slow (over 3 s)</span><b className={`num ${sum.slow.length ? 'down' : 'up'}`}>{sum.slow.reduce((a, f) => a + f.n, 0)}</b></div>
            <div className="hp-tile"><span className="small muted">Freezes</span><b className="num">{sum.longTasks}</b><span className="small muted">worst {sum.worstTask} ms</span></div>
          </div>
          {sum.failed.length > 0 && <section><h4>Failed calls</h4><ul>{sum.failed.map((f) => <li key={f.path}><code>{f.path}</code> HTTP {f.status || 'network'} ×{f.n}</li>)}</ul></section>}
          {sum.slow.length > 0 && <section><h4>Slow calls</h4><ul>{sum.slow.map((f) => <li key={f.path}><code>{f.path}</code> up to {(f.ms / 1000).toFixed(1)} s ×{f.n}</li>)}</ul></section>}
          {sum.errors.length > 0 && <section><h4>Errors in the page</h4><ul>{sum.errors.map((e) => <li key={e}>{e}</li>)}</ul></section>}
          <section><h4>Data sources</h4>{rows == null ? <p className="small muted">Checking…</p> : bad.length ? <ul>{bad.map((r) => <li key={r.id}><b>{r.label}</b> · {r.state}{r.lastError ? <span className="small muted"> · {r.lastError.slice(0, 140)}</span> : null}</li>)}</ul> : <p className="small up">All keyed sources answering.</p>}
            {noKey.length > 0 && <p className="small muted">No key set (optional): {noKey.map((r) => r.label).join(', ')}.</p>}</section>
          <div className="hp-acts">
            <button className="btn primary" onClick={() => { void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => {}); }}>{copied ? '✓ Copied' : 'Copy report for Claude'}</button>
            <button className="btn" onClick={() => reloadAll()}>↻ Reload all data again</button>
            <button className="btn" onClick={() => setSum(summarize(health()))}>Update report</button>
          </div>
          <p className="small muted">This report covers this browser tab since it loaded. A daily scheduled run also checks the live site and drops a health note into your vault inbox, so issues reach the next Claude session.</p>
        </div>
      </div>
    </div>
  );
}
