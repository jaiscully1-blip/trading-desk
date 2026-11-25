// Earnings scoreboard sectors you can open: every company that has reported, EPS and revenue expected vs actual,
// and a company panel with the price around the report and the earnings call.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { MoveChart } from './MoveChart';
import { TranscriptView } from './Transcript';
import { useDesk } from '../lib/deskctx';
import type { EarnRow, SectorScore } from '../../shared/macroextra';

const pc = (v: number | null | undefined, dp = 0) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}%`);
const eps = (v: number | null) => (v == null ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`);
const rev = (v: number | null) => (v == null ? '—' : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : `$${(v / 1e6).toFixed(0)}M`);
const surprise = (a: number | null, e: number | null) => (a == null || e == null || Math.abs(e) < 0.01 ? null : ((a - e) / Math.abs(e)) * 100);
const WHEN: Record<string, string> = { bmo: 'before open', amc: 'after close', dmh: 'during hours' };

function Beat({ a, e, fmt }: { a: number | null; e: number | null; fmt: (v: number | null) => string }) {
  const s = surprise(a, e), beat = a != null && e != null ? a > e : null;
  return <span className="eb-cell"><span className="muted">{fmt(e)}</span> → <b className={beat == null ? '' : beat ? 'up' : 'down'}>{fmt(a)}</b>{s != null && <span className={`small ${s >= 0 ? 'up' : 'down'}`}> {s >= 0 ? '+' : ''}{s.toFixed(1)}%</span>}</span>;
}

interface Bar { time: number; close: number }
/** Price around the report: ~6 weeks before to today, the report day marked, and the reaction (close before → close after). */
function Peek({ r, onClose }: { r: EarnRow; onClose: () => void }) {
  const { names, openCompany } = useDesk();
  const [bars, setBars] = useState<Bar[] | string | null>(null), [call, setCall] = useState(false);
  useEffect(() => {
    let stop = false; setBars(null);
    fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(r.sym)}&tf=1d`).then(async (x) => { const j = await x.json(); if (!stop) setBars(x.ok && Array.isArray(j.bars) ? j.bars.map((b: any) => ({ time: b.time < 1e11 ? b.time * 1000 : b.time, close: b.close })) : j.error ?? `HTTP ${x.status}`); }).catch((e) => !stop && setBars(String(e)));
    return () => { stop = true; };
  }, [r.sym]);
  const rep = Date.parse(`${r.date}T12:00:00Z`);
  const view = typeof bars === 'object' && bars ? bars.filter((b) => b.time >= rep - 45 * 86400_000) : [];
  const react = useMemo(() => {
    if (!view.length) return null;
    const day = (t: number) => new Date(t).toISOString().slice(0, 10);
    const i = view.findIndex((b) => day(b.time) >= r.date); if (i < 0) return null;
    // before the open: the reaction is report-day close vs the prior close; after the close: next day vs report day
    const [a, b] = r.hour === 'amc' ? [i, i + 1] : [i - 1, i];
    if (a < 0 || b >= view.length) return null;
    return { from: view[a].close, to: view[b].close, pct: (view[b].close / view[a].close - 1) * 100, since: (view[view.length - 1].close / view[a].close - 1) * 100 };
  }, [view, r.date, r.hour]);
  return (
    <div className="eb-peek">
      <div className="eb-peek-h">
        <b>{r.sym}</b> <span className="muted">{names[r.sym] ?? ''}</span> <span className="small muted">reported {r.date}{r.hour && WHEN[r.hour] ? `, ${WHEN[r.hour]}` : ''}</span>
        <span className="eb-acts"><button className="btn" onClick={() => setCall(true)}>🎙 Earnings call</button><button className="btn" onClick={() => openCompany(r.sym)}>Company page</button><button className="icon-btn" onClick={onClose} aria-label="Close">×</button></span>
      </div>
      <div className="eb-peek-b">
        <div className="eb-nums small">
          <div><span>EPS expected → actual</span><Beat a={r.epsAct} e={r.epsEst} fmt={eps} /></div>
          <div><span>Revenue expected → actual</span><Beat a={r.revAct} e={r.revEst} fmt={rev} /></div>
          {react && <div><span>Stock reaction</span><b className={react.pct >= 0 ? 'up' : 'down'}>{react.pct >= 0 ? '+' : ''}{react.pct.toFixed(1)}%</b> <span className="muted">first day · {react.since >= 0 ? '+' : ''}{react.since.toFixed(1)}% since</span></div>}
        </div>
        {bars === null && <p className="small muted">Loading the chart…</p>}
        {typeof bars === 'string' && <p className="small muted">No chart: {bars}</p>}
        {view.length > 2 && <MoveChart series={[{ pts: view.map((b) => ({ t: b.time, v: b.close })), label: r.sym, fmt: (v) => `$${v.toFixed(2)}` }]} marks={[{ t: rep, label: 'earnings' }]} ranges={false} height={170} />}
      </div>
      {call && <TranscriptView sym={r.sym} onClose={() => setCall(false)} />}
    </div>
  );
}

export function EarnBoard({ b }: { b: { sectors: SectorScore[]; companies?: Record<string, EarnRow[]> } }) {
  const [open, setOpen] = useState<string | null>(null), [pick, setPick] = useState<EarnRow | null>(null);
  const { names } = useDesk();
  return (
    <>
      <table className="ad-table eb-t"><thead><tr><th>Sector</th><th className="r">Reported</th><th className="r">EPS beat</th><th className="r">Revenue beat</th><th className="r">Median surprise</th></tr></thead><tbody>
        {b.sectors.map((s) => (
          <Fragment key={s.sector}>
            <tr className={`eb-sec ${open === s.sector ? 'on' : ''}`} onClick={() => { setOpen(open === s.sector ? null : s.sector); setPick(null); }} aria-expanded={open === s.sector}>
              <td><span className="eb-car">{open === s.sector ? '▾' : '▸'}</span>{s.sector}</td><td className="r num">{s.reported}</td><td className={`r num ${(s.epsBeatPct ?? 0) >= 70 ? 'up' : (s.epsBeatPct ?? 100) < 60 ? 'down' : ''}`}>{pc(s.epsBeatPct)}</td><td className="r num">{pc(s.revBeatPct)}</td><td className="r num">{pc(s.avgSurprise, 1)}</td>
            </tr>
            {open === s.sector && (
              <tr className="eb-open"><td colSpan={5}>
                {!b.companies?.[s.sector]?.length ? <p className="small muted">No company list yet (refreshes within a few hours).</p> : (
                  <table className="eb-co"><thead><tr><th>Company</th><th>Reported</th><th>EPS expected → actual</th><th>Revenue expected → actual</th></tr></thead><tbody>
                    {b.companies[s.sector].map((r) => (
                      <tr key={r.sym + r.date} className={pick?.sym === r.sym ? 'on' : ''} onClick={() => setPick(pick?.sym === r.sym ? null : r)}>
                        <td><button className="link"><b>{r.sym}</b></button> <span className="small muted">{(names[r.sym] ?? '').slice(0, 26)}</span></td>
                        <td className="small">{r.date.slice(5)}{r.hour && WHEN[r.hour] ? <span className="muted"> {WHEN[r.hour]}</span> : null}</td>
                        <td><Beat a={r.epsAct} e={r.epsEst} fmt={eps} /></td><td><Beat a={r.revAct} e={r.revEst} fmt={rev} /></td>
                      </tr>
                    ))}
                  </tbody></table>
                )}
                {pick && <Peek r={pick} onClose={() => setPick(null)} />}
              </td></tr>
            )}
          </Fragment>
        ))}
      </tbody></table>
      <p className="note small">Click a sector to see every company that has reported; click a company for its chart around the report and the earnings call.</p>
    </>
  );
}
