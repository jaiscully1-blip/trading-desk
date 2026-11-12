// Time & sales widget: IEX prints (Alpaca free plan) for one ticker, newest first, with IEX's best bid / ask.
// Clearly labelled: IEX is one exchange (about 2–3% of US volume), so this is a sample of the tape, not the whole tape.
import { useEffect, useMemo, useState } from 'react';
import type { DataMode } from '../data/live';
import { tapeSummary, type Print, type TopOfBook } from '../../shared/tape';

interface TapeData { sym: string; prints: Print[]; quote: TopOfBook | null; asOf: number; source: string }
const time = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' });
const usd = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`);

export function TapeW({ mode, sym: initial, onSym, onChart }: { mode: DataMode; sym: string; onSym: (s: string) => void; onChart: (s: string) => void }) {
  const [sym, setSym] = useState(initial);
  const [typed, setTyped] = useState('');
  const [d, setD] = useState<TapeData | null>(null);
  const [err, setErr] = useState<{ text: string; needsKey?: boolean } | null>(null);
  useEffect(() => setSym(initial), [initial]);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false, t: ReturnType<typeof setTimeout>;
    setD(null); setErr(null);
    const go = async () => {
      if (!document.hidden) {
        try {
          const r = await fetch(`/api/research?fn=tape&symbol=${encodeURIComponent(sym)}`);
          const j = await r.json();
          if (stop) return;
          if (r.ok) { setD(j); setErr(null); } else { setErr({ text: j.error ?? `HTTP ${r.status}`, needsKey: j.needsKey }); if (j.needsKey) return; }
        } catch { /* keep the last tape */ }
      }
      if (!stop) t = setTimeout(go, 3000);
    };
    go();
    return () => { stop = true; clearTimeout(t); };
  }, [sym, mode.kind]);
  const sum = useMemo(() => (d ? tapeSummary(d.prints.filter((p) => d.prints.length && p.t >= d.prints[d.prints.length - 1].t - 15 * 60_000)) : null), [d]);
  const go = () => { const s = typed.trim().toUpperCase().replace(/^\$/, ''); if (/^[A-Z][A-Z0-9.]{0,9}$/.test(s)) { setSym(s); onSym(s); } setTyped(''); };

  if (mode.kind !== 'live') return <p className="hw-pad small muted">The tape needs live data; nothing is shown in demo mode.</p>;
  const q = d?.quote, rows = d ? [...d.prints].reverse().slice(0, 120) : [];
  return (
    <div className="tp">
      <div className="tp-h">
        <button className="hw-sym" onClick={() => onChart(sym)} title="Open on the desk">{sym}</button>
        <input className="tp-in" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder="ticker ↵" aria-label="Show the tape for another ticker" maxLength={10} />
        {q && <span className="tp-q num small"><span className="down">{q.bid.toFixed(2)} × {q.bidSize}</span><span className="muted"> / </span><span className="up">{q.ask.toFixed(2)} × {q.askSize}</span><span className="muted"> · spread {(q.ask - q.bid).toFixed(2)}</span></span>}
        <span className="fresh fresh-live tp-tag" title={d?.source ?? 'Alpaca free plan: IEX exchange only'}>IEX ONLY</span>
      </div>
      {err && <p className="small hw-pad">{err.needsKey ? <>Add a free Alpaca account's keys in Vercel → Settings → Environment Variables: <code>ALPACA_KEY_ID</code> and <code>ALPACA_SECRET_KEY</code> (paper-trading keys work for data), then redeploy.</> : <span className="down">Tape unavailable: {err.text}</span>}</p>}
      {!d && !err && <p className="small muted hw-pad">Loading {sym} prints…</p>}
      {sum && sum.n > 0 && (
        <div className="tp-sum small">
          {sum.upShare != null && <span title="Shares traded on an uptick vs a downtick, last 15 minutes of IEX prints"><span className="tp-bar"><span style={{ width: `${sum.upShare * 100}%` }} /></span> upticks <b className="num">{(sum.upShare * 100).toFixed(0)}%</b></span>}
          {sum.vwap != null && <span>VWAP <b className="num">{sum.vwap.toFixed(2)}</b></span>}
          {sum.biggest && <span>biggest <b className="num">{sum.biggest.s.toLocaleString('en-US')} @ {sum.biggest.p.toFixed(2)}</b> <span className="muted">{time(sum.biggest.t)}</span></span>}
          <span className="muted">last 15 min · {sum.vol.toLocaleString('en-US')} sh on IEX</span>
        </div>
      )}
      {d && !rows.length && <p className="small muted hw-pad">No IEX prints for {sym} in the last 4 days.</p>}
      <div className="tp-list">
        {rows.map((p, i) => (
          <div key={`${p.t}:${i}`} className={`tp-row ${p.side} ${p.big ? 'big' : ''}`}>
            <span className="num muted">{time(p.t)}</span>
            <span className="num tp-p">{p.p.toFixed(p.p < 1 ? 4 : 2)}</span>
            <span className="num">{p.s.toLocaleString('en-US')}</span>
            <span className="num muted">{p.big ? usd(p.s * p.p) : ''}</span>
          </div>
        ))}
      </div>
      <p className="note small">IEX is one exchange, about 2–3% of US stock volume, so this is a live sample of the tape, not all of it. Green = uptick, red = downtick (tick rule); highlighted rows are 10,000+ shares or $250K+. Real-time from Alpaca's free plan.</p>
    </div>
  );
}
