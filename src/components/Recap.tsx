// End-of-day recap card: on screen, exportable as a PNG, with the day's journal CSV backup.
import { useMemo, useState } from 'react';
import type { Recap } from '../lib/recap';
import { sUsd, tone } from '../lib/format';

const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function download(name: string, data: string | Blob, type = 'text/csv') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Draws the card on a 1200x630 canvas (share-image size). Plain canvas, so it exports the same everywhere. */
export function recapPng(r: Recap): Promise<Blob> {
  const W = 1200, H = 630, c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  const sans = '"IBM Plex Sans", system-ui, sans-serif', mono = '"IBM Plex Mono", ui-monospace, monospace';
  const ink = '#121417', muted = '#5d6570', line = '#e4e7eb', up = '#0b7a3e', down = '#c62f2a';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  g.fillStyle = ink; g.fillRect(0, 0, W, 8);
  g.fillStyle = muted; g.font = `600 18px ${mono}`; g.fillText('DESK · DAILY RECAP', 56, 70);
  g.fillStyle = ink; g.font = `600 40px ${sans}`; g.fillText(dayLabel(r.day), 56, 120);
  // grade
  const gc = { A: up, B: '#1f5fd6', C: '#9a5b00', D: down, F: down }[r.grade];
  g.strokeStyle = gc; g.lineWidth = 6; g.beginPath(); g.arc(1060, 110, 64, 0, Math.PI * 2); g.stroke();
  g.fillStyle = gc; g.font = `700 64px ${sans}`; g.textAlign = 'center'; g.fillText(r.grade, 1060, 133); g.textAlign = 'left';
  g.fillStyle = muted; g.font = `500 14px ${sans}`; g.textAlign = 'center'; g.fillText(`process ${r.score}/100`, 1060, 200); g.textAlign = 'left';
  // metrics
  const cells: [string, string, string?][] = [
    ['P&L', sUsd(r.pnl), r.pnl >= 0 ? up : down], ['R', `${r.r >= 0 ? '+' : ''}${r.r.toFixed(2)}R`, r.r >= 0 ? up : down],
    ['Win rate', r.winRate == null ? '—' : `${r.winRate.toFixed(0)}%`], ['Trades', String(r.trades)],
  ];
  cells.forEach(([l, v, col], i) => {
    const x = 56 + i * 240;
    g.fillStyle = muted; g.font = `500 15px ${sans}`; g.fillText(l.toUpperCase(), x, 250);
    g.fillStyle = col ?? ink; g.font = `600 40px ${mono}`; g.fillText(v, x, 298);
  });
  g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(56, 330); g.lineTo(W - 56, 330); g.stroke();
  const row = (y: number, l: string, v: string, col = ink) => { g.fillStyle = muted; g.font = `500 17px ${sans}`; g.fillText(l, 56, y); g.fillStyle = col; g.font = `500 19px ${mono}`; g.fillText(v, 260, y); };
  row(372, 'Best', r.best ? `${r.best.sym}  ${sUsd(r.best.pnl)}${r.best.r != null ? `  ${r.best.r.toFixed(2)}R` : ''}` : '—', up);
  row(408, 'Worst', r.worst ? `${r.worst.sym}  ${sUsd(r.worst.pnl)}${r.worst.r != null ? `  ${r.worst.r.toFixed(2)}R` : ''}` : '—', r.worst && r.worst.pnl < 0 ? down : ink);
  row(444, 'Rules broken', r.violations.n ? `${r.violations.n} · cost ${r.violations.cost ? sUsd(-r.violations.cost) : '$0'}${r.violations.top ? ` · ${r.violations.top}` : ''}` : 'none', r.violations.n ? down : up);
  // lesson (wrapped)
  g.fillStyle = '#f4f5f7'; g.fillRect(56, 476, W - 112, 110);
  g.fillStyle = muted; g.font = `600 14px ${sans}`; g.fillText('LESSON', 76, 504);
  g.fillStyle = ink; g.font = `500 22px ${sans}`;
  const words = r.lesson.split(' ');
  let ln = '', y = 538;
  for (const w of words) {
    const t = ln ? `${ln} ${w}` : w;
    if (g.measureText(t).width > W - 160) { g.fillText(ln, 76, y); ln = w; y += 30; } else ln = t;
  }
  g.fillText(ln, 76, y);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

export function RecapOverlay({ recaps, initialDay, onClose, onReplay, csvFor }: {
  recaps: Recap[]; initialDay?: string; onClose: () => void; onReplay: (tradeId: string) => void; csvFor: (day: string | null) => string;
}) {
  const sorted = useMemo(() => [...recaps].sort((a, b) => b.day.localeCompare(a.day)), [recaps]);
  const [i, setI] = useState(() => Math.max(0, sorted.findIndex((r) => r.day === initialDay)));
  const r = sorted[i];
  return (
    <div className="overlay" role="dialog" aria-label="Daily recap">
      <div className="overlay-in rc">
        <div className="phead">
          <div className="phead-title">Daily recap</div>
          <div className="phead-ctl">
            <button className="btn" disabled={i >= sorted.length - 1} onClick={() => setI(i + 1)}>◀ Older</button>
            <button className="btn" disabled={i <= 0} onClick={() => setI(i - 1)}>Newer ▶</button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {!r ? <div className="ph-body"><p className="muted">No recaps yet. One is generated automatically at the 4:00 PM ET close on days you trade.</p></div> : (
          <div className="rc-body">
            <div className="rc-card">
              <div className="rc-top">
                <div><div className="muted small">DAILY RECAP</div><div className="rc-day">{dayLabel(r.day)}</div></div>
                <div className={`rc-grade g-${r.grade}`} title={r.reasons.join('\n')}>{r.grade}<span className="small">process {r.score}/100</span></div>
              </div>
              <div className="cards">
                <div className="card"><span className="muted small">P&amp;L</span><b className={`num ${tone(r.pnl)}`}>{sUsd(r.pnl)}</b></div>
                <div className="card"><span className="muted small">R</span><b className={`num ${tone(r.r)}`}>{r.r >= 0 ? '+' : ''}{r.r.toFixed(2)}R</b></div>
                <div className="card"><span className="muted small">Win rate</span><b className="num">{r.winRate == null ? '—' : `${r.winRate.toFixed(0)}%`}</b></div>
                <div className="card"><span className="muted small">Trades</span><b className="num">{r.trades}</b></div>
              </div>
              <div className="kv rc-kv">
                <span>Best</span><b>{r.best ? <button className="link" onClick={() => onReplay(r.best!.id)}>{r.best.sym} {sUsd(r.best.pnl)}{r.best.r != null ? ` · ${r.best.r.toFixed(2)}R` : ''} · replay</button> : '—'}</b>
                <span>Worst</span><b>{r.worst ? <button className="link" onClick={() => onReplay(r.worst!.id)}>{r.worst.sym} {sUsd(r.worst.pnl)}{r.worst.r != null ? ` · ${r.worst.r.toFixed(2)}R` : ''} · replay</button> : '—'}</b>
                <span>Rules broken</span><b className={r.violations.n ? 'down' : 'up'}>{r.violations.n ? `${r.violations.n} · cost ${r.violations.cost ? sUsd(-r.violations.cost) : '$0'}${r.violations.top ? ` · ${r.violations.top}` : ''}` : 'none'}</b>
              </div>
              <div className="rc-lesson"><span className="muted small">LESSON</span><p>{r.lesson}</p></div>
              <ul className="rc-reasons">{r.reasons.map((x, k) => <li key={k} className="small muted">{x}</li>)}</ul>
            </div>
            <div className="fb-row rc-actions">
              <button className="btn primary" onClick={async () => download(`desk-recap-${r.day}.png`, await recapPng(r))}>Download image</button>
              <button className="btn" onClick={() => download(`desk-journal-${r.day}.csv`, csvFor(r.day))}>Download that day’s CSV</button>
              <button className="btn" onClick={() => download(`desk-journal-all-${r.day}.csv`, csvFor(null))}>Full journal CSV</button>
              <span className="muted small">Grade is process first: broken rules cost points even on green days.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
