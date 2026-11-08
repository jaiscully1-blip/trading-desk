// Movement watch badge (top strip) and its detail card: is the tape moving enough to pay for option time decay?
// Neutral on direction: big movement either way is good for long options, a quiet tape lets theta burn them.
import { useEffect, useRef, useState } from 'react';
import type { MovementRead } from '../../shared/movement';
import type { VolRead } from '../../shared/volatility';
import type { MoveStats, DayStat } from '../../shared/movementStats';

const usd = (n: number, d = 2) => `$${n.toFixed(d)}`;

export function MovementBadge({ m, vol, stats }: { m: MovementRead; vol?: VolRead | null; stats?: MoveStats | null }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const Cell = ({ l, v, sub, cls }: { l: string; v: string; sub: string; cls?: string }) => <div className="mv-cell"><span className="muted small">{l}</span><b className={`num mv-big ${cls ?? ''}`}>{v}</b><span className="muted small">{sub}</span></div>;
  const Row = ({ t, rows }: { t: string; rows: MovementRead['decay0'] }) => (
    <div className="mv-decay"><span className="muted small">{t}</span>{rows.slice(0, 3).map((r) => <span key={r.label} className="num small" title={`${usd(r.goneUsd, 0)} of premium per contract`}>by {r.label}: <b className="mv-theta">-{r.gonePct.toFixed(0)}%</b></span>)}</div>
  );
  return (
    <span className="mv-wrap" ref={box}>
      <button className={`regime mv ${m.tone}`} onClick={() => setOpen(!open)} aria-expanded={open} title="Movement vs theta. Click for the numbers."><i />{m.label}</button>
      {open && (
        <div className="mv-pop" role="dialog" aria-label="Movement watch">
          <div className="mv-h"><b>Movement watch</b><span className="muted small">big moves either way help long options; quiet days let theta burn them</span></div>
          <div className="mv-grid">
            <Cell l="Priced-in move" v={`±${usd(m.priced.usd)}`} sub={`${m.priced.pct.toFixed(2)}% from VIX`} />
            <Cell l="Last 10 days avg" v={`${m.recent.avgPct.toFixed(2)}%`} sub={`${m.recent.ratio.toFixed(2)}x priced in`} cls={m.tone === 'theta' ? 'mv-theta' : m.tone === 'move' ? 'mv-move' : ''} />
            <Cell l={`Chop days, last ${m.chop.of}`} v={String(m.chop.n)} sub={`normal is about ${m.chop.normal} · under half the priced-in move`} cls="mv-theta" />
            <Cell l={`Big days, last ${m.big.of}`} v={String(m.big.n)} sub={`normal is about ${m.big.normal} · 1.5x or more`} cls="mv-move" />
            {m.latest && <Cell l="Latest session" v={`${m.latest.pct.toFixed(2)}%`} sub={`${m.latest.x.toFixed(1)}x priced in · ${m.latest.kind === 'quiet' ? 'quiet day' : m.latest.kind === 'big' ? 'big day' : 'normal day'}`} cls={m.latest.kind === 'quiet' ? 'mv-theta' : m.latest.kind === 'big' ? 'mv-move' : ''} />}
            <Cell l={m.breakEven.forNext ? 'Break-even, next session' : 'Break-even, bought now'} v={`±${usd(m.breakEven.usd)}`} sub={`${m.breakEven.pct.toFixed(2)}% move for an ATM contract held to the close · recent avg ${usd(m.recent.avgUsd)}`} />
          </div>
          <div className="mv-sec">ATM option premium burned (0DTE opens at {usd(m.atm0, 0)} per contract)</div>
          <Row t="0DTE" rows={m.decay0} /><Row t="1DTE" rows={m.decay1} />
          {vol && (
            <>
              <div className="mv-sec">Volatility <span className="tag">CALCULATED</span></div>
              <div className="mv-grid">
                <Cell l="VIX, one-year rank" v={vol.vixRank ? `${vol.vixRank.rank.toFixed(0)}` : '-'} sub={vol.vixRank ? `percentile ${vol.vixRank.percentile.toFixed(0)} · range ${vol.vixRank.lo.toFixed(1)} to ${vol.vixRank.hi.toFixed(1)}` : ''} />
                <Cell l="SPY realized, 20 days" v={vol.realized.yangZhang != null ? `${(vol.realized.yangZhang * 100).toFixed(1)}%` : '-'} sub={`Yang-Zhang (counts gaps) · range-based ${vol.realized.parkinson != null ? (vol.realized.parkinson * 100).toFixed(1) : '-'}% · close-close ${vol.realized.cc != null ? (vol.realized.cc * 100).toFixed(1) : '-'}%`} />
                <Cell l="VIX minus realized" v={vol.premium != null ? `${vol.premium >= 0 ? '+' : '−'}${Math.abs(vol.premium).toFixed(1)} pts` : '-'} sub="what options charge over what the tape did" cls={vol.premium != null && vol.premium > 3 ? 'mv-theta' : ''} />
                <Cell l="Vol of vol, 20 days" v={vol.vixOfVol != null ? `${(vol.vixOfVol * 100).toFixed(1)}%` : '-'} sub="typical daily % swing in VIX" />
              </div>
            </>
          )}
          {stats && <DayTable s={stats} />}
          <p className="note mv-note">{m.parts.join(' · ')}. Decay is Black-Scholes at the money with no rates or skew, so it is an estimate: real 0DTE pricing differs. Chop and big days are measured against today's priced-in move. Not a forecast, not advice.</p>
        </div>
      )}
    </span>
  );
}

function DayTable({ s }: { s: MoveStats }) {
  const row = (d: DayStat, base = false) => (
    <div key={d.key} className={`mv-tr ${base ? 'mv-base' : ''} ${d.n < 8 ? 'mv-few' : ''}`} title={d.n < 8 ? `Only ${d.n} days: too few to trust` : `${d.n} days`}>
      <span>{d.label}{d.n < 8 && <span className="muted small"> (few days)</span>}</span><span className="num">{d.avgMovePct.toFixed(2)}%</span><span className="num mv-theta">{d.chopPct.toFixed(0)}%</span><span className="num mv-move">{d.bigPct.toFixed(0)}%</span><span className="num muted small">{d.n}</span>
    </div>
  );
  const g = s.gaps;
  return (
    <>
      <div className="mv-sec">Which days move <span className="tag">CALCULATED</span> <span className="muted">last {s.days} sessions, SPY</span></div>
      <div className="mv-tr mv-th"><span>Day type</span><span>Avg move</span><span>Chop</span><span>Big</span><span>Days</span></div>
      {row(s.all, true)}{s.weekday.map((d) => row(d))}{s.events.map((d) => row(d))}
      <p className="note mv-note">Chop = moved under half of the prior 20-day average move. Big = 1.5x or more. Compare each row with "All days".
        Gaps of {g.minPct}% or more: up gaps {g.up.n} (filled the same day {g.up.fillPct.toFixed(0)}%, kept going {g.up.continuePct.toFixed(0)}%), down gaps {g.down.n} (filled {g.down.fillPct.toFixed(0)}%, kept going {g.down.continuePct.toFixed(0)}%).
        About {s.overnightVarShare.toFixed(0)}% of day-to-day variance happens overnight (average {s.overnightAvgPct.toFixed(2)}% overnight vs {s.sessionAvgPct.toFixed(2)}% in the session): long options held overnight carry that gap risk.</p>
    </>
  );
}
