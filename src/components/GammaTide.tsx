// Options tide (Gamma page): call vs put premium traded through the day with price on top and call-minus-put volume
// below. Built from the Cboe delayed chain snapshots the desk takes while it's open, so it only covers those times.
// Gross premium (volume × mid): free data has no buy / sell side, so this is not "net premium" like paid flow feeds.
import { useMemo, useState } from 'react';
import { useTide, type TidePt } from '../lib/tide';
import { usePersisted } from '../lib/store';
import { Q, Seg } from './common';

const W = 720, H = 260, VH = 70, PADL = 46, PADR = 56;
const m$ = (x: number) => { const a = Math.abs(x); return `${x < 0 ? '-' : ''}$${a >= 1e9 ? (a / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(0) + 'M' : (a / 1e3).toFixed(0) + 'K'}`; };
const tm = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export default function GammaTide({ sym }: { sym: string }) {
  const byDay = useTide(sym);
  const [span, setSpan] = usePersisted<'1' | '2' | '5'>('tideSpan', '1');
  const [otm, setOtm] = usePersisted<'all' | 'otm'>('tideOtm', 'all');
  const [hover, setHover] = useState<number | null>(null);
  const pts: TidePt[] = useMemo(() => { const days = Object.keys(byDay ?? {}).sort().slice(-Number(span)); return days.flatMap((d) => byDay![d]); }, [byDay, span]);
  const cp = (p: TidePt) => (otm === 'otm' ? p.otmCallPrem : p.callPrem), pp = (p: TidePt) => (otm === 'otm' ? p.otmPutPrem : p.putPrem);
  const head = (
    <div className="gx-h"><Q k="calc" src="Cboe delayed option chain (~15 min), snapshots taken while the desk is open; gross premium = volume × mid, no buy/sell side" /><b>Options tide</b>
      <span className="small muted">call vs put premium traded today · gross, not net (needs a paid flow feed)</span>
      <Seg value={span} onChange={setSpan} options={[{ id: '1', label: '1D' }, { id: '2', label: '2D' }, { id: '5', label: '5D' }]} />
      <Seg value={otm} onChange={setOtm} options={[{ id: 'all', label: 'All' }, { id: 'otm', label: 'OTM only' }]} />
    </div>
  );
  if (pts.length < 2) return <div className="gt">{head}<p className="small muted gx-pad">Building: the desk saves a {sym} snapshot each time the chain refreshes (about every 10–15 minutes while this page or a {sym} chart is open). {pts.length === 1 ? 'One point so far.' : 'No points yet today.'}</p></div>;
  const n = pts.length, x = (i: number) => PADL + (i / (n - 1)) * (W - PADL - PADR);
  const pMax = Math.max(1, ...pts.map((p) => Math.max(cp(p), pp(p))));
  const sLo = Math.min(...pts.map((p) => p.spot)), sHi = Math.max(...pts.map((p) => p.spot)), sPad = (sHi - sLo) * 0.1 || sHi * 0.002;
  const yP = (v: number) => H - 14 - (v / pMax) * (H - 28), yS = (v: number) => H - 14 - ((v - sLo + sPad) / (sHi - sLo + 2 * sPad)) * (H - 28);
  const nv = pts.map((p) => p.callVol - p.putVol), vMax = Math.max(1, ...nv.map(Math.abs));
  const line = (f: (p: TidePt) => number, y: (v: number) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join('');
  const h = hover != null ? pts[hover] : pts[n - 1];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PADL) / (W - PADL - PADR)) * (n - 1))))); };
  return (
    <div className="gt">
      {head}
      <p className="small gx-pad gt-read"><b>{new Date(h.t).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'America/New_York' })} {tm(h.t)}</b> · {sym} {h.spot.toFixed(2)} · <span className="up">calls {m$(cp(h))}</span> · <span className="down">puts {m$(pp(h))}</span> · calls − puts {m$(cp(h) - pp(h))} · volume C {Math.round(h.callVol / 1000)}K / P {Math.round(h.putVol / 1000)}K</p>
      <svg className="gt-svg" viewBox={`0 0 ${W} ${H + VH}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${sym} call and put premium through the day`}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={PADL} x2={W - PADR} y1={yP(pMax * f)} y2={yP(pMax * f)} className="gt-grid" /><text x={W - PADR + 4} y={yP(pMax * f) + 4} className="gt-ax">{m$(pMax * f)}</text></g>)}
        {[sLo, (sLo + sHi) / 2, sHi].map((v, i) => <text key={i} x={4} y={yS(v) + 4} className="gt-ax">{v.toFixed(1)}</text>)}
        <path d={line(cp, yP)} className="gt-call" /><path d={line(pp, yP)} className="gt-put" /><path d={line((p) => p.spot, yS)} className="gt-spot" />
        {nv.map((v, i) => <rect key={i} x={x(i) - Math.max(1, (W - PADL - PADR) / n / 2.5)} width={Math.max(2, (W - PADL - PADR) / n / 1.25)} y={H + VH / 2 - Math.max(0, v) / vMax * (VH / 2 - 4)} height={Math.abs(v) / vMax * (VH / 2 - 4)} className={v >= 0 ? 'gt-vu' : 'gt-vd'} />)}
        <text x={PADL} y={H + 10} className="gt-ax">volume, calls − puts</text>
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={8} y2={H + VH} className="gt-cross" />}
        <text x={PADL} y={H + VH - 2} className="gt-ax">{tm(pts[0].t)}</text><text x={W - PADR} y={H + VH - 2} textAnchor="end" className="gt-ax">{tm(pts[n - 1].t)}</text>
      </svg>
      <p className="small muted gx-pad">Green = call premium, red = put premium, yellow = {sym} price (left axis). Calls far above puts means more money went into calls than puts, but not whether it was bought or sold. With a paid flow feed this can show true net premium.</p>
    </div>
  );
}
