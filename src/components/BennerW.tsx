// Benner cycle widget: where this year sits on the 1875 card, and what the card marks next. Folklore, not a signal: a visual curiosity.
import { useMemo, useState } from 'react';
import { KIND_TEXT, MARKS, status, type Kind } from '../../shared/benner';

const FROM = 1920, TO = 2060;
const COLOR: Record<Kind, string> = { A: 'var(--down)', B: 'var(--up)', C: 'var(--accent)' };
const SHORT: Record<Kind, string> = { A: 'Panic', B: 'Sell', C: 'Buy' };

export default function BennerW({ now }: { now: number }) {
  const year = new Date(now).getFullYear();
  const frac = year + (now - Date.UTC(year, 0, 1)) / (365.25 * 86400_000);
  const s = useMemo(() => status(year), [year]);
  const [hover, setHover] = useState<{ year: number; kinds: Kind[] } | null>(null);
  const x = (y: number) => ((y - FROM) / (TO - FROM)) * 100;
  const shown = hover ?? { year, kinds: s.kinds };
  return (
    <div className="hw-pad bn">
      <div className="bn-now">
        <b className="bn-year num">{year}</b>
        <span>{s.kinds.length ? s.kinds.map((k) => <span key={k} className="bn-pill" style={{ borderColor: COLOR[k], color: COLOR[k] }}>{KIND_TEXT[k].name}</span>) : <span className="muted small">not a marked year</span>}</span>
      </div>
      {s.phaseText && <p className="small bn-phase">{s.phaseText}</p>}
      <div className="bn-line" role="img" aria-label={`Benner cycle timeline from ${FROM} to ${TO}, now ${year}`}>
        <div className="bn-axis" />
        {MARKS.map((m) => (
          <span key={`${m.year}${m.kind}`} className={`bn-dot k-${m.kind} ${m.year < year ? 'past' : ''}`} style={{ left: `${x(m.year)}%`, color: COLOR[m.kind] }}
            onMouseEnter={() => setHover({ year: m.year, kinds: MARKS.filter((q) => q.year === m.year).map((q) => q.kind) })} onMouseLeave={() => setHover(null)} title={`${m.year}: ${KIND_TEXT[m.kind].name}`} />
        ))}
        <span className="bn-me" style={{ left: `${x(frac)}%` }} title={`Now: ${year}`}><i />You are here</span>
        {[1920, 1950, 1980, 2010, 2040].map((y) => <span key={y} className="bn-tick small muted" style={{ left: `${x(y)}%` }}>{y}</span>)}
      </div>
      <div className="bn-leg small"><span style={{ color: COLOR.C }}>● Buy (hard times)</span><span style={{ color: COLOR.B }}>● Sell (good times)</span><span style={{ color: COLOR.A }}>● Panic</span></div>
      <p className="small bn-says">{shown.kinds.length ? <><b>{shown.year}:</b> {shown.kinds.map((k) => KIND_TEXT[k].says).join(' ')}</> : <><b>{shown.year}:</b> between marked years.</>}</p>
      <div className="bn-next small"><b>Next on the card</b>{s.next.map((m) => <span key={`${m.year}${m.kind}`} style={{ color: COLOR[m.kind] }}>{m.year} {SHORT[m.kind]} <span className="muted">in {m.year - year} yr</span></span>)}</div>
      <p className="note">Folklore, not a signal. Published in 1875, and the card going around today was fitted to history after the fact. Real panics like 1987, 2008 and 2020 are not on it, and it says nothing about timing within a year. Shown for fun and context only.</p>
    </div>
  );
}
