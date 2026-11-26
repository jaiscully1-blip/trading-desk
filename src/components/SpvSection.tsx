// SPVs & off-balance-sheet section on the Company page: the company's variable interest entity (VIE) numbers from its SEC
// data, its 10-K's own sentences on VIEs, special purpose entities, securitizations and off-balance-sheet arrangements
// (quoted, no AI), and subsidiaries that look like financing vehicles. Opens on demand. Facts from filings, not advice.
import { useEffect, useState } from 'react';
import type { VieFact } from '../../shared/spv';
import { getDeskJson } from './PatentsSection';
import { Fresh } from './common';

interface Resp { error?: string; name?: string; filing?: { date: string; url: string; form: string } | null; facts?: VieFact[]; hiddenFacts?: number; groups?: { topic: string; sentences: string[] }[]; vehicles?: string[]; subsidiaries?: number; errors?: Record<string, string>; source?: string }
const money = (v: number, unit: string) => (unit !== 'USD' ? v.toLocaleString('en-US') : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${Math.round(v).toLocaleString('en-US')}`);

export function SpvSection({ sym }: { sym: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => { setD(null); }, [sym]);
  useEffect(() => { if (open && !d) getDeskJson<Resp>(`/api/research?fn=spv&symbol=${sym}`).then(setD).catch((e) => setD({ error: (e as Error).message })); }, [open, d, sym]);
  return (
    <section className="fi">
      <button className="fi-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><h4>SPVs &amp; off-balance-sheet <span className="muted small">· variable interest entities, special purpose vehicles, securitizations</span></h4><span>{open ? '▾' : '▸'}</span></button>
      {open && !d && <p className="small muted">Reading {sym}'s SEC data and annual report…</p>}
      {open && d?.error && <p className="small down">{d.error}</p>}
      {open && d && !d.error && (
        <div className="fi-grid">
          <div className="fi-box pt-wide">
            <h5>VIE numbers the company reports <Fresh kind="eod" src="SEC XBRL company facts (official, as tagged by the company)" /></h5>
            {d.facts?.length ? (
              <table className="ad-table"><thead><tr><th>What (SEC label)</th><th className="r">Latest</th><th>As of</th><th className="r">A year earlier</th></tr></thead><tbody>
                {d.facts.map((f) => (
                  <tr key={f.concept}><td className="small">{f.label}</td><td className="r num">{money(f.value, f.unit)}</td><td className="num small">{f.end} <span className="muted">{f.form}</span></td><td className="r num small">{f.prior != null ? money(f.prior, f.unit) : '—'}</td></tr>
                ))}
              </tbody></table>
            ) : <p className="small muted">No current VIE numbers tagged in its SEC data.{d.hiddenFacts ? ` ${d.hiddenFacts} older figure${d.hiddenFacts === 1 ? '' : 's'} hidden: the company stopped reporting ${d.hiddenFacts === 1 ? 'it' : 'them'} this way (or the SEC retired the tag).` : ' Many companies describe VIEs only in words (below).'}</p>}
            {!!d.facts?.length && !!d.hiddenFacts && <p className="note small">{d.hiddenFacts} older figure{d.hiddenFacts === 1 ? '' : 's'} hidden (no longer reported, or the SEC retired the tag).</p>}
            <p className="note small">Consolidated VIEs are on the balance sheet; unconsolidated ones are not, and "maximum loss exposure" is how much the company could lose through them.</p>
          </div>
          {!!d.groups?.length && (
            <div className="fi-box pt-wide">
              <h5>What the annual report says {d.filing && <a className="small" href={d.filing.url} target="_blank" rel="noreferrer noopener">{d.filing.form} filed {d.filing.date}</a>}</h5>
              {d.groups.map((g) => (
                <div key={g.topic} className="spv-group">
                  <b className="small">{g.topic}</b>
                  <ul className="small spv-quotes">{g.sentences.map((s, i) => <li key={i}>“{s}”</li>)}</ul>
                </div>
              ))}
              <p className="note small">Sentences quoted exactly as written in the filing (no AI); the ones with amounts come first.</p>
            </div>
          )}
          {d.groups && !d.groups.length && <p className="small muted pt-wide">The latest annual report has no sentences about VIEs, special purpose entities, securitizations or off-balance-sheet arrangements.</p>}
          <div className="fi-box pt-wide">
            <h5>Subsidiaries that look like financing vehicles</h5>
            {d.vehicles?.length ? <><p className="small">{d.vehicles.length} of the {d.subsidiaries} subsidiaries listed in the 10-K:</p><div className="pt-mix">{d.vehicles.map((v) => <span key={v} className="chip sm">{v}</span>)}</div></>
              : <p className="small muted">{d.subsidiaries ? `None of the ${d.subsidiaries} listed subsidiaries has a financing-vehicle name (trust, receivables, funding, issuer...).` : 'No subsidiary list (Exhibit 21) found.'}</p>}
            <p className="note small">By name only (receivables, funding, trust, issuer, securitization...): a hint, not proof. Companies list only significant subsidiaries.</p>
          </div>
          {d.errors && Object.keys(d.errors).length > 0 && <p className="small muted pt-wide">Not loaded this time: {Object.entries(d.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}</p>}
          {d.source && <p className="note small pt-wide">{d.source}. Research only, not advice.</p>}
        </div>
      )}
    </section>
  );
}
