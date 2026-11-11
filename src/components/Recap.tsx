// End-of-day recap card: on screen, exportable as a PNG that matches what you see, with the day's journal CSV backup.
// "Add broker CSV" imports trades you did not log at the time; the card rebuilds from the journal right away.
import { useMemo, useRef, useState } from 'react';
import type { Recap } from '../lib/recap';
import { sUsd, tone } from '../lib/format';
import { importFiles, readImportLog, writeImportLog, type ImportDeps } from './Journal';
import { download } from '../lib/download';

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const cssVar = (n: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || fallback;

export { download };

const rulesLine = (r: Recap) => (r.violations.n ? `${r.violations.n} · cost ${r.violations.cost ? sUsd(-r.violations.cost) : '$0'}${r.violations.top ? ` · ${r.violations.top}` : ''}` : 'none');
const openLine = (r: Recap) => (r.open?.length ? `${r.open.length} still open: ${r.open.slice(0, 4).map((o) => o.sym).join(', ')}${r.open.length > 4 ? '…' : ''}` : '');

/** Draws the card on a 1200x630 canvas (share-image size) in the colours of the theme you are using, so the picture matches the screen. */
export function recapPng(r: Recap): Promise<Blob> {
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const sans = '"IBM Plex Sans", system-ui, sans-serif', mono = '"IBM Plex Mono", ui-monospace, monospace';
  const bg = cssVar('--panel', '#110e0c'), soft = cssVar('--panel-2', '#181310'), ink = cssVar('--text', '#ece6df'), muted = cssVar('--muted', '#a69a8c'), line = cssVar('--line-2', '#3b2f25');
  const up = cssVar('--up', '#46d69a'), down = cssVar('--down', '#ff5a4d'), accent = cssVar('--accent', '#ee9a45'), warn = cssVar('--warn', '#ffb347');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = accent; g.fillRect(0, 0, W, 6);
  g.fillStyle = muted; g.font = `600 18px ${mono}`; g.fillText('DESK · DAILY RECAP', 56, 70);
  g.fillStyle = ink; g.font = `600 40px ${sans}`; g.fillText(dayLabel(r.day), 56, 120);
  // grade
  const gc = { A: up, B: accent, C: warn, D: down, F: down }[r.grade];
  g.strokeStyle = gc; g.lineWidth = 6; g.beginPath(); g.arc(1060, 110, 64, 0, Math.PI * 2); g.stroke();
  g.fillStyle = gc; g.font = `700 64px ${sans}`; g.textAlign = 'center'; g.fillText(r.grade, 1060, 133);
  g.fillStyle = muted; g.font = `500 14px ${sans}`; g.fillText(`process ${r.score}/100`, 1060, 200); g.textAlign = 'left';
  // metrics
  const cells: [string, string, string?][] = [
    ['P&L', sUsd(r.pnl), r.pnl > 0 ? up : r.pnl < 0 ? down : ink], ...(r.r !== 0 ? [['R', `${r.r >= 0 ? '+' : ''}${r.r.toFixed(2)}R`, r.r > 0 ? up : down] as [string, string, string]] : []),
    ...(r.winRate == null ? [] : [['Win rate', `${r.winRate.toFixed(0)}%`] as [string, string]]), ['Closed', String(r.trades)], ['Opened', String(r.opened ?? 0)],
  ];
  const cw = (W - 112) / cells.length;
  cells.forEach(([l, v, col], i) => {
    const x = 56 + i * cw;
    g.fillStyle = muted; g.font = `500 15px ${sans}`; g.fillText(l.toUpperCase(), x, 250);
    g.fillStyle = col ?? ink; g.font = `600 38px ${mono}`; g.fillText(v, x, 298);
  });
  g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(56, 330); g.lineTo(W - 56, 330); g.stroke();
  let y = 372;
  const row = (l: string, v: string, col = ink) => { g.fillStyle = muted; g.font = `500 17px ${sans}`; g.fillText(l, 56, y); g.fillStyle = col; g.font = `500 19px ${mono}`; g.fillText(v, 260, y); y += 34; };
  if (r.best) row('Best', `${r.best.sym}  ${sUsd(r.best.pnl)}${r.best.r != null ? `  ${r.best.r.toFixed(2)}R` : ''}`, up);
  if (r.worst) row('Worst', `${r.worst.sym}  ${sUsd(r.worst.pnl)}${r.worst.r != null ? `  ${r.worst.r.toFixed(2)}R` : ''}`, r.worst.pnl < 0 ? down : ink);
  if (openLine(r)) row('Positions', openLine(r));
  row('Rules broken', rulesLine(r), r.violations.n ? down : up);
  // lesson (wrapped)
  g.fillStyle = soft; g.fillRect(56, 486, W - 112, 104);
  g.fillStyle = muted; g.font = `600 14px ${sans}`; g.fillText('LESSON', 76, 514);
  g.fillStyle = ink; g.font = `500 21px ${sans}`;
  let ln = '', ly = 546;
  for (const w of r.lesson.split(' ')) {
    const t = ln ? `${ln} ${w}` : w;
    if (g.measureText(t).width > W - 160) { g.fillText(ln, 76, ly); ln = w; ly += 28; } else ln = t;
  }
  g.fillText(ln, 76, ly);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('could not draw the image'))), 'image/png'));
}

export function RecapOverlay({ recaps, initialDay, onClose, onReplay, csvFor, importDeps, onOpenImport }: {
  recaps: Recap[]; initialDay?: string; onClose: () => void; onReplay: (tradeId: string) => void; csvFor: (day: string | null) => string;
  /** lets the recap import a broker CSV itself (trades you did not log at the time) */
  importDeps?: ImportDeps; onOpenImport?: () => void;
}) {
  const sorted = useMemo(() => [...recaps].sort((a, b) => b.day.localeCompare(a.day)), [recaps]);
  const [day, setDay] = useState<string | undefined>(initialDay);
  const idx = sorted.findIndex((r) => r.day === day);
  const i = idx >= 0 ? idx : 0;
  const r = sorted[i];
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const say = (text: string, bad = false) => { setMsg({ text, bad }); };

  const addCsv = async (files: FileList | null) => {
    if (!files?.length || !importDeps) return;
    try {
      const { out, pending } = await importFiles(importDeps, files, setBusy);
      if (!out.length) { say('That is not a CSV file.', true); return; }
      writeImportLog([...[...out].reverse(), ...readImportLog()]); // same list as Journal → Import, so Undo works there
      const ok = out.filter((x) => x.ok), added = ok.reduce((a, x) => a + x.added, 0), dup = ok.reduce((a, x) => a + x.dup, 0);
      if (pending.length) say(`${pending.length} file${pending.length > 1 ? 's' : ''} could not be read automatically. Open Journal → Import to match the columns by hand.`, true);
      else if (!added && dup) say(`Nothing new: all ${dup} fills in ${ok.length > 1 ? 'those files' : 'that file'} were already in your journal.`);
      else {
        const first = Math.min(...ok.map((x) => x.first ?? Infinity));
        say(`Added ${added} fill${added === 1 ? '' : 's'}${dup ? ` (${dup} already there)` : ''}. The recap cards now include them${Number.isFinite(first) ? `, starting ${new Date(first).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}` : ''}. Use Older / Newer to see each day.`);
      }
    } catch (e) { say(`Import failed: ${(e as Error).message}`, true); }
    setBusy('');
  };
  const run = async (what: string, f: () => void | Promise<void>) => { try { await f(); say(`${what} saved to your Downloads folder.`); } catch (e) { say(`${what} failed: ${(e as Error).message}`, true); } };

  return (
    <div className="overlay" role="dialog" aria-label="Daily recap">
      <div className="overlay-in rc">
        <div className="phead">
          <div className="phead-title">Daily recap</div>
          <div className="phead-ctl">
            {sorted.length > 1 && <span className="muted small num">{i + 1} of {sorted.length}</span>}
            <button className="btn" disabled={i >= sorted.length - 1} onClick={() => { setDay(sorted[i + 1].day); setMsg(null); }}>◀ Older</button>
            <button className="btn" disabled={i <= 0} onClick={() => { setDay(sorted[i - 1].day); setMsg(null); }}>Newer ▶</button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="rc-body">
          {!r ? <p className="muted">No recaps yet. One appears for every day you have trades in the journal. Did not log them at the time? Add your broker's CSV below.</p> : (
            <div className="rc-card" id="recap-card">
              <div className="rc-top">
                <div><div className="muted small">DAILY RECAP{r.partial ? ' · DAY IN PROGRESS' : ''}</div><div className="rc-day">{dayLabel(r.day)}</div></div>
                <div className={`rc-grade g-${r.grade}`} title={r.reasons.join('\n')}>{r.grade}<span className="small">process {r.score}/100</span></div>
              </div>
              <div className="cards">
                <div className="card"><span className="muted small">P&amp;L</span><b className={`num ${tone(r.pnl)}`}>{sUsd(r.pnl)}</b></div>
                {r.r !== 0 && <div className="card" title="R = profit divided by the risk you planned. Trades imported with no stop have no R."><span className="muted small">R</span><b className={`num ${tone(r.r)}`}>{r.r >= 0 ? '+' : ''}{r.r.toFixed(2)}R</b></div>}
                {r.winRate != null && <div className="card"><span className="muted small">Win rate</span><b className="num">{r.winRate.toFixed(0)}%</b></div>}
                <div className="card" title="Trades closed this day: P&L, R and win rate are about these"><span className="muted small">Closed</span><b className="num">{r.trades}</b></div>
                <div className="card" title="Trades opened this day"><span className="muted small">Opened</span><b className="num">{r.opened ?? 0}</b></div>
              </div>
              {r.trades === 0 && (r.opened ?? 0) > 0 && <p className="small rc-hint">Nothing was closed this day, so there is no realized P&amp;L yet. It will show on the day you exit.</p>}
              <div className="kv rc-kv">
                {r.best && <><span>Best</span><b><button className="link" onClick={() => onReplay(r.best!.id)}>{r.best.sym} {sUsd(r.best.pnl)}{r.best.r != null ? ` · ${r.best.r.toFixed(2)}R` : ''} · replay</button></b></>}
                {r.worst && <><span>Worst</span><b><button className="link" onClick={() => onReplay(r.worst!.id)}>{r.worst.sym} {sUsd(r.worst.pnl)}{r.worst.r != null ? ` · ${r.worst.r.toFixed(2)}R` : ''} · replay</button></b></>}
                {openLine(r) && <><span>Positions</span><b>{openLine(r)}</b></>}
                <span>Rules broken</span><b className={r.violations.n ? 'down' : 'up'}>{rulesLine(r)}</b>
              </div>
              <div className="rc-lesson"><span className="muted small">LESSON</span><p>{r.lesson}</p></div>
              <ul className="rc-reasons">{r.reasons.map((x, k) => <li key={k} className="small muted">{x}</li>)}</ul>
            </div>
          )}
          <div className="fb-row rc-actions">
            {r && <button className="btn primary" onClick={() => run('Recap image', async () => download(`desk-recap-${r.day}.png`, await recapPng(r)))} title="A picture of this card, in the colours you see">Download image</button>}
            {r && <button className="btn" onClick={() => run("That day's CSV", () => download(`desk-journal-${r.day}.csv`, csvFor(r.day)))}>Download that day’s CSV</button>}
            <button className="btn" onClick={() => run('Full journal CSV', () => download(`desk-journal-all-${r?.day ?? 'export'}.csv`, csvFor(null)))}>Full journal CSV</button>
            {importDeps && <>
              <button className="btn" onClick={() => input.current?.click()} disabled={!!busy} title="Trades you did not log at the time: add your broker's export and the cards rebuild">{busy ? 'Reading…' : '+ Add broker CSV'}</button>
              <input ref={input} type="file" accept=".csv,.txt,text/csv" multiple hidden onChange={(e) => { void addCsv(e.target.files); e.target.value = ''; }} />
            </>}
            {onOpenImport && <button className="link small" onClick={onOpenImport}>Import history and undo</button>}
          </div>
          {busy && <p className="small muted rc-msg"><span className="spin" /> {busy}</p>}
          {msg && <p className={`small rc-msg ${msg.bad ? 'down' : 'up'}`} role="status">{msg.text}</p>}
          <p className="muted small rc-msg">Grade is process first: broken rules cost points even on green days. Cards rebuild from your journal, so a CSV added later updates the day it belongs to.</p>
        </div>
      </div>
    </div>
  );
}
