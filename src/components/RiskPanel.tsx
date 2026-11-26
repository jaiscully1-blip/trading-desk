// Risk on / off tab (Credit page): hedging, bank stress, credit spreads and leverage, each read "stressing", "easing" or
// "normal" by a stated rule (hover a row). One list both ways: easing signals are the risk-on side. Facts, not advice.
import { useEffect, useState } from 'react';
import type { Signal } from '../../shared/riskPanel';
import { getDeskJson } from './PatentsSection';
import { Fresh } from './common';

interface Resp { error?: string; signals?: Signal[]; tally?: { stress: number; ease: number; normal: number; line: string }; notes?: string[]; cftcWeeks?: number; errors?: Record<string, string>; source?: string }
const READ = { stress: 'Stressing', ease: 'Easing', normal: 'Normal' } as const;
const GROUPS = ['Hedging', 'Banks', 'Credit', 'Leverage'] as const;
const GROUP_NOTE: Record<(typeof GROUPS)[number], string> = {
  Hedging: 'Who is buying credit protection, and how busy CDS trading is.',
  Banks: "The banks' own credit risk, as priced in CDS.",
  Credit: 'Bond and CDS spreads and Fed stress gauges.',
  Leverage: 'Borrowing to own stocks: rises with risk appetite.',
};

export default function RiskPanel({ live }: { live: boolean }) {
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => { if (live) getDeskJson<Resp>('/api/research?fn=riskpanel').then(setD).catch((e) => setD({ error: (e as Error).message })); }, [live]);
  if (!live) return <p className="hw-pad muted"><Fresh kind="demo" /> This tab reads real data only, so it needs the live desk.</p>;
  if (!d) return <p className="hw-pad muted">Reading spreads, the CDS tape, bank call reports and margin debt… a first look takes a few seconds.</p>;
  if (d.error) return <p className="hw-pad down">{d.error}</p>;
  const sigs = d.signals ?? [];
  return (
    <div className="fi-grid rp hw-pad">
      <div className="fi-box pt-wide">
        <h5>Risk on / off now <Fresh kind="eod" src="FRED, DTCC CDS tape, FDIC, FINRA, CFTC (each row says its own date)" /></h5>
        {d.tally && <p className="rp-line"><b>{d.tally.line}.</b> <span className="small"><span className="rp-r rp-stress">{d.tally.stress} stressing</span> · <span className="rp-r rp-ease">{d.tally.ease} easing</span> · <span className="muted">{d.tally.normal} normal</span></span></p>}
        {!!d.notes?.length && <ul className="small pt-notes">{d.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        <p className="note small">Each row is read by its own stated rule (hover it). Stressing = moving the way it does when markets get nervous; easing = the risk-on direction. This is a list of facts, not a forecast and not a signal to buy or sell.</p>
      </div>
      {GROUPS.map((g) => {
        const rows = sigs.filter((s) => s.group === g);
        if (!rows.length) return null;
        return (
          <div className="fi-box pt-wide" key={g}>
            <h5>{g} <span className="small muted">{GROUP_NOTE[g]}</span></h5>
            <table className="ad-table rp-table"><tbody>
              {rows.map((s) => (
                <tr key={s.id} title={`${s.rule} Source: ${s.src}.`}>
                  <td><span className={`rp-r rp-${s.read}`}>{READ[s.read]}</span></td>
                  <td>{s.label}</td><td className="num small">{s.value}</td><td className="small muted">{s.change}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        );
      })}
      {d.cftcWeeks != null && d.cftcWeeks < 2 && <p className="small muted pt-wide">CFTC weekly credit-swap totals: the CFTC only shows the current week, so the desk saves one snapshot a week; the week-on-week reading appears after the second snapshot.</p>}
      {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted pt-wide">Not loaded this time: {Object.entries(d.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}</p>}
      {d.source && <p className="note small pt-wide">{d.source}</p>}
    </div>
  );
}
