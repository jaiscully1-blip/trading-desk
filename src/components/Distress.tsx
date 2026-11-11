// Distress page (⇧R), Home widget and the world-map layer. Shows the CALCULATED distress / turnaround read: every point is a named
// signal with its source, date and link, so nothing is taken on trust. A screen for where to look, not a rating, not advice.
// Views: Weak names · Turnarounds · Sectors · Big movers (realized volatility, either direction) · US map (HQ dots + state heat).
import { Fragment, useMemo, useState } from 'react';
import { geoAlbersUsa } from 'd3-geo';
import type { DataMode } from '../data/live';
import { useDistress, type CreditPt, type DistressState } from '../data/distress';
import { rollup, type DistressRow, type GroupRoll, type Label } from '../../shared/distress';
import type { StateLayoffs } from '../../shared/labor';
import { US_H, US_MESH, US_STATES, US_W } from '../data/usStates';
import { Fresh, PageTabs } from './common';
import { useDesk } from '../lib/deskctx';

type View = 'weak' | 'turn' | 'sectors' | 'movers' | 'map';
const LABEL: Record<Label, string> = { distressed: 'Distressed', watch: 'Watch', turnaround: 'Turnaround', healthy: 'Healthy' };
const albers = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const pctS = (v: number | null | undefined, d = 0) => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`);
const isOk = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

function Bars({ r }: { r: DistressRow }) {
  return (
    <span className="dx-bars" title={`Weakness ${r.weak} / 100 · Strength ${r.turn} / 100 (calculated from the signals listed)`}>
      <i className="w" style={{ width: `${r.weak}%` }} /><i className="t" style={{ width: `${r.turn}%` }} />
    </span>
  );
}
const Tag = ({ l }: { l: Label }) => <span className={`dx-tag ${l}`}>{LABEL[l]}</span>;

function Row({ r, onPick, on }: { r: DistressRow; onPick: (r: DistressRow) => void; on: boolean }) {
  const top = r.signals.slice(0, 2).map((s) => s.text).join(' · ');
  return (
    <button className={`dx-row ${on ? 'on' : ''}`} onClick={() => onPick(r)}>
      <b className="dx-sym num">{r.sym}</b>
      <span className="dx-nm"><span>{r.name}</span><em className="muted small">{r.industry || r.sector}</em></span>
      <Tag l={r.label} />
      <Bars r={r} />
      <span className="dx-sig small">{top || <span className="muted">no signals</span>}</span>
      <span className={`num small ${r.price && r.price.ddPct <= -30 ? 'down' : 'muted'}`} title="From its 52-week high">{r.price ? pctS(r.price.ddPct) : ''}</span>
    </button>
  );
}

function Detail({ r, onChart, onClose }: { r: DistressRow; onChart: (s: string) => void; onClose: () => void }) {
  const { openArticle } = useDesk();
  const kv: [string, string, string][] = [
    ["Altman Z''", isOk(r.z) ? r.z.toFixed(2) : '', 'Under 1.1 distress, 1.1–2.6 grey, over 2.6 safe. Not used for banks, insurers, REITs, utilities.'],
    ['Cash runway', isOk(r.runwayMo) ? `${r.runwayMo.toFixed(0)} months` : '', 'Cash divided by last year’s operating cash burn. Shown only when the company burns cash.'],
    ['Interest cover', isOk(r.cover) ? `${r.cover.toFixed(1)}x` : '', 'Operating profit (last quarter x 4) over last year’s interest expense.'],
    ['Share count, 1 yr', pctS(r.shareChgPct, 1), 'Up = dilution, down = buybacks.'],
    ['Revenue vs a year ago', pctS(r.revChgPct), 'Latest quarter against the same quarter a year earlier.'],
    ['From 52-week high', r.price ? pctS(r.price.ddPct) : '', ''],
    ['Off the 52-week low', r.price ? pctS(r.price.offLowPct) : '', ''],
    ['3-month change', r.price ? pctS(r.price.r3m) : '', ''],
    ['20-day realized vol', r.price && isOk(r.price.rv20) ? `${r.price.rv20.toFixed(0)}%` : '', 'Annualized, from daily closes. How much it moves, not which way.'],
    ['WARN layoff notices, 90 days', r.warn ? `${r.warn.jobs ? `${r.warn.jobs.toLocaleString('en-US')} jobs · ` : ''}${r.warn.notices} notice${r.warn.notices === 1 ? '' : 's'} · ${r.warn.states.join(', ')}` : '', 'Filed with US states before layoffs of 50+ at one site. Filer names: ' + (r.warn?.names.join('; ') ?? '')],
    ['Open jobs on its job board', r.jobs ? `${r.jobs.count}${r.jobs.d30 != null ? ` (30 days ago ${r.jobs.d30})` : ''}${r.jobs.d90 != null ? ` (90 days ago ${r.jobs.d90})` : ''}` : '', r.jobs ? `Counted daily from its public ${r.jobs.ats} board since ${r.jobs.since}. Adverts, not hires.` : ''],
    ['Short volume, 5 days', isOk(r.shortVol) ? `${(r.shortVol * 100).toFixed(0)}%` : '', 'FINRA daily short sale volume / total volume. Market makers short a lot routinely; above ~55% is unusual.'],
  ];
  return (
    <aside className="dx-detail">
      <div className="dx-dh">
        <div><b className="num">{r.sym}</b> <Tag l={r.label} /><div className="small muted">{r.name}{r.hq ? ` · ${r.hq}` : ''}</div></div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className="dx-scores">
        <div><span className="small muted">Weakness</span><b className="num down">{r.weak}</b></div>
        <div><span className="small muted">Strength</span><b className="num up">{r.turn}</b></div>
        <button className="btn sm" onClick={() => onChart(r.sym)}>Chart</button>
      </div>
      {r.ai && (
        <div className="dx-ai"><span className="dx-ai-tag">AI SUMMARY · {r.ai.model}</span><p>{r.ai.summary}</p><p className="small muted">Watch next: {r.ai.watch}</p><p className="tiny muted">Written from the signals below only. Can be wrong.</p></div>
      )}
      <h4>Signals</h4>
      <ul className="dx-sigs">
        {r.signals.map((s) => (
          <li key={s.id} className={s.side}>
            <span className="num">{s.side === 'weak' ? '−' : '+'}{s.pts}</span>
            <span>{s.text}<em className="small muted"> · {s.src}{s.date ? `, ${s.date}` : ''}{s.url && <> · <a href={s.url} target="_blank" rel="noreferrer noopener">source</a></>}</em></span>
          </li>
        ))}
        {!r.signals.length && <li className="muted small">Nothing flagged.</li>}
      </ul>
      <h4>Numbers</h4>
      <div className="kv">{kv.filter(([, v]) => v).map(([k, v, h]) => <Fragment key={k}><span title={h || undefined}>{k}</span><b className="num">{v}</b></Fragment>)}</div>
      {r.jobs && <p className="small"><a href={r.jobs.url} target="_blank" rel="noreferrer noopener">Open its {r.jobs.ats} job board</a>{r.jobs.d90 == null && <span className="muted"> · job counts started {r.jobs.since}; changes show after a few weeks</span>}</p>}
      {r.news.length > 0 && <>
        <h4>Flagged headlines (30 days)</h4>
        <ul className="news">{r.news.map((n) => <li key={n.url}><span /><span className="news-t"><button className="link-plain news-hl" onClick={() => openArticle({ title: n.title, url: n.url, src: n.src, t: n.t, syms: [r.sym] })}>{n.title}</button><em className="small muted"> · {n.tags.join(', ')}</em></span></li>)}</ul>
      </>}
      {r.missing.length > 0 && <p className="note">Not read for this company: {r.missing.join(', ')}. Missing data counts as nothing, not as good news.</p>}
    </aside>
  );
}

function heat(stress: number) {
  const a = Math.max(0, Math.min(1, stress / 45));
  return `color-mix(in srgb, var(--down) ${Math.round(8 + a * 62)}%, var(--panel-2))`;
}

function layoffHeat(jobs: number, max: number) {
  const a = max > 0 ? Math.log1p(jobs) / Math.log1p(max) : 0;
  return `color-mix(in srgb, var(--warn) ${Math.round(6 + a * 70)}%, var(--panel-2))`;
}

function UsMap({ rows, states, layoffs, shade, onPick, sel }: { rows: DistressRow[]; states: GroupRoll[]; layoffs: Record<string, StateLayoffs>; shade: 'stress' | 'layoffs'; onPick: (r: DistressRow) => void; sel: string | null }) {
  const st = new Map(states.map((s) => [s.key, s]));
  const maxJobs = Math.max(0, ...Object.values(layoffs).map((l) => l.jobs));
  const dots = rows.filter((r) => r.label !== 'healthy' && isOk(r.lat) && isOk(r.lon)).map((r) => ({ r, p: albers([r.lon!, r.lat!]) })).filter((d): d is { r: DistressRow; p: [number, number] } => !!d.p).sort((a, b) => a.r.weak - b.r.weak);
  return (
    <svg viewBox={`0 0 ${US_W} ${US_H}`} className="dx-us" role="img" aria-label="US map of flagged companies by headquarters">
      {Object.entries(US_STATES).map(([k, d]) => {
        const s = st.get(k), l = layoffs[k];
        const fill = shade === 'layoffs' ? (l ? layoffHeat(l.jobs, maxJobs) : 'var(--panel-2)') : s ? heat(s.stress) : 'var(--panel-2)';
        const tip = shade === 'layoffs' ? (l ? `${k}: ${l.notices} WARN notices, ${l.jobs.toLocaleString('en-US')} jobs in 90 days (all employers)` : `${k}: no notices in the data (or the state is not covered)`) : s ? `${k}: ${s.n} companies, ${s.distressed} distressed, ${s.watch} watch, ${s.turnaround} turnaround` : `${k}: none in the list`;
        return <path key={k} d={d} style={{ fill }} className="dx-st"><title>{tip}</title></path>;
      })}
      <path d={US_MESH} className="dx-mesh" />
      {dots.map(({ r, p }) => (
        <circle key={r.sym} cx={p[0]} cy={p[1]} r={3 + r.weak / 9} className={`dx-dot ${r.label} ${sel === r.sym ? 'sel' : ''}`} onClick={() => onPick(r)}>
          <title>{`${r.sym} · ${r.name} · ${LABEL[r.label]} · weakness ${r.weak}, strength ${r.turn}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Credit({ c }: { c: DistressState['credit'] }) {
  if (!c || (!c.hy && !c.ccc)) return null;
  const one = (lbl: string, p: CreditPt | null) => p && <div className="dx-kpi" title={`${c.source}. As of ${p.date}. Wider = lenders demand more to hold risky debt.`}><span className="small muted">{lbl}</span><b className="num">{p.last.toFixed(2)}</b><em className={`small num ${p.chg3m > 0 ? 'down' : 'up'}`}>{p.chg3m > 0 ? '+' : '−'}{Math.abs(p.chg3m).toFixed(2)} in 3 mo</em></div>;
  return <>{one('Junk bond spread', c.hy)}{one('CCC spread', c.ccc)}</>;
}

export default function DistressPage({ mode, mySyms, onChart }: { mode: DataMode; mySyms: string[]; onChart: (s: string) => void }) {
  const { d, rows, error, loading } = useDistress(mode, mySyms);
  const [view, setView] = useState<View>('weak');
  const [sel, setSel] = useState<DistressRow | null>(null);
  const [sector, setSector] = useState('');
  const [mine, setMine] = useState(false);
  const [openSector, setOpenSector] = useState<string | null>(null);
  const [shade, setShade] = useState<'stress' | 'layoffs'>('layoffs');
  const mineSet = useMemo(() => new Set(mySyms), [mySyms]);
  const shown = rows.filter((r) => (!sector || r.sector === sector) && (!mine || mineSet.has(r.sym)));
  const weak = shown.filter((r) => r.label === 'distressed' || r.label === 'watch').sort((a, b) => b.weak - a.weak);
  const turn = shown.filter((r) => r.label === 'turnaround').sort((a, b) => b.turn - a.turn);
  const movers = shown.filter((r) => r.label !== 'healthy' && r.price && isOk(r.price.rv20) && r.price.rv20 >= 40).sort((a, b) => b.price!.rv20! - a.price!.rv20!);
  const sectors = d?.file?.sectors ?? [];
  const sectorList = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean))].sort(), [rows]);

  if (mode.kind !== 'live') return <section className="panel"><div className="ph-body muted">Needs live data. The distress list is never filled with sample companies.</div></section>;
  if (loading) return <section className="panel"><div className="ph-body muted">Loading the distress read…</div></section>;
  if (!d || (!d.file && !d.extras.length)) return (
    <section className="panel"><div className="ph-body">
      {error === 'not-run-yet' || d?.errors.file === 'not-run-yet'
        ? <p>The nightly read hasn’t run yet. In GitHub, add the repo secret <code>SEC_USER_AGENT</code> (an app name and a contact email), then run the <b>Distress read</b> workflow once from the Actions tab.</p>
        : <p className="down">{error || 'Distress read unavailable.'}</p>}
    </div></section>
  );
  const f = d.file;
  const list = view === 'weak' ? weak : view === 'turn' ? turn : movers;

  return (
    <section className="panel dx">
      <div className="phead">
        <div className="phead-title">Distress and turnarounds</div>
        <PageTabs<View> value={view} onChange={setView} options={[
          { id: 'weak', label: 'Weak names', count: weak.length || undefined, hint: 'Distressed and watch' },
          { id: 'turn', label: 'Turnarounds', count: turn.length || undefined, hint: 'Beaten down, with signs of strength' },
          { id: 'sectors', label: 'Sectors' },
          { id: 'movers', label: 'Big movers', count: movers.length || undefined, hint: 'Flagged names with high realized volatility, either direction' },
          { id: 'map', label: 'US map' },
        ]} />
        <div className="phead-ctl">
          <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector"><option value="">All sectors</option>{sectorList.map((s) => <option key={s}>{s}</option>)}</select>
          <button className={`chip sm ${mine ? 'on' : ''}`} onClick={() => setMine((m) => !m)} title="Only your watchlist and starred tickers">Mine</button>
          {f && <Fresh kind="eod" at={f.asOf} src={`CALCULATED nightly from public data. ${Object.values(f.sources).join(' · ')}`} />}
        </div>
      </div>
      <div className="dx-kpis">
        <div className="dx-kpi"><span className="small muted">Read</span><b className="num">{rows.length}</b><em className="small muted">companies</em></div>
        <div className="dx-kpi"><span className="small muted">Distressed</span><b className="num down">{rows.filter((r) => r.label === 'distressed').length}</b><em className="small muted">weakness 40+</em></div>
        <div className="dx-kpi"><span className="small muted">Watch</span><b className="num warn-txt">{rows.filter((r) => r.label === 'watch').length}</b><em className="small muted">20 to 39</em></div>
        <div className="dx-kpi"><span className="small muted">Turnarounds</span><b className="num up">{rows.filter((r) => r.label === 'turnaround').length}</b><em className="small muted">down 25%+, strength wins</em></div>
        {f?.layoffStates && Object.keys(f.layoffStates).length > 0 && <div className="dx-kpi" title="WARN notices from every employer in the states covered, last 90 days"><span className="small muted">Layoff notices, 90 days</span><b className="num">{Object.values(f.layoffStates).reduce((a, l) => a + l.jobs, 0).toLocaleString('en-US')}</b><em className="small muted">jobs, {Object.values(f.layoffStates).reduce((a, l) => a + l.notices, 0)} notices</em></div>}
        {sectors[0] && <div className="dx-kpi"><span className="small muted">Most stressed sector</span><b>{sectors[0].key}</b><em className="small muted">{sectors[0].distressed + sectors[0].watch} of {sectors[0].n} flagged</em></div>}
        <Credit c={d.credit} />
      </div>
      <div className={`dx-body ${sel ? 'has-detail' : ''}`}>
        <div className="dx-main">
          {(view === 'weak' || view === 'turn' || view === 'movers') && (
            <div className="dx-list">
              {view === 'movers' && <p className="small muted dx-pad">Flagged names whose 20-day realized volatility is 40%+ a year: big moves either way. Realized, not implied: check the options chain for IV and expected move.</p>}
              {list.map((r) => <Row key={r.sym} r={r} onPick={setSel} on={sel?.sym === r.sym} />)}
              {!list.length && <p className="muted small dx-pad">{view === 'turn' ? 'No turnarounds with these filters.' : 'Nothing flagged with these filters.'}</p>}
            </div>
          )}
          {view === 'sectors' && (
            <table className="dx-tab">
              <thead><tr><th>Sector</th><th title="Average weakness + 40 x share flagged">Stress</th><th>Names</th><th>Distressed</th><th>Watch</th><th>Turnaround</th><th title="Median distance from 52-week high">Median drop</th><th>Most flagged</th></tr></thead>
              <tbody>
                {sectors.map((s) => (
                  <Fragment key={s.key}>
                    <tr className="dx-sec" onClick={() => setOpenSector((o) => (o === s.key ? null : s.key))}>
                      <td>{openSector === s.key ? '▾' : '▸'} {s.key}</td>
                      <td><span className="dx-stress"><i style={{ width: `${Math.min(100, s.stress * 1.6)}%` }} /></span><span className="num small">{s.stress.toFixed(0)}</span></td>
                      <td className="num">{s.n}</td><td className="num down">{s.distressed || ''}</td><td className="num">{s.watch || ''}</td><td className="num up">{s.turnaround || ''}</td>
                      <td className="num">{s.medDd != null ? pctS(s.medDd) : ''}</td>
                      <td>{s.top.map((t) => <button key={t} className="wl-sym" onClick={(e) => { e.stopPropagation(); const r = rows.find((x) => x.sym === t); if (r) setSel(r); }}>{t}</button>)}</td>
                    </tr>
                    {openSector === s.key && rollup(rows.filter((r) => r.sector === s.key), (r) => r.industry).map((g) => (
                      <tr key={`${s.key}:${g.key}`} className="dx-ind">
                        <td>{g.key}</td><td><span className="num small">{g.stress.toFixed(0)}</span></td><td className="num">{g.n}</td><td className="num down">{g.distressed || ''}</td><td className="num">{g.watch || ''}</td><td className="num up">{g.turnaround || ''}</td>
                        <td className="num">{g.medDd != null ? pctS(g.medDd) : ''}</td>
                        <td>{g.top.map((t) => <button key={t} className="wl-sym" onClick={() => { const r = rows.find((x) => x.sym === t); if (r) setSel(r); }}>{t}</button>)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {view === 'map' && (
            <div className="dx-mapwrap">
              <div className="chips dx-pad"><span className="small muted">Shade states by</span>
                <button className={`chip sm ${shade === 'layoffs' ? 'on' : ''}`} onClick={() => setShade('layoffs')} title="WARN notices filed in each state, every employer, last 90 days">Layoff notices</button>
                <button className={`chip sm ${shade === 'stress' ? 'on' : ''}`} onClick={() => setShade('stress')} title="Average stress of listed companies based in each state">Company stress</button></div>
              <UsMap rows={shown} states={f?.states ?? []} layoffs={f?.layoffStates ?? {}} shade={shade} onPick={setSel} sel={sel?.sym ?? null} />
              <p className="small muted dx-pad">Dots = flagged companies at their headquarters (red distressed, amber watch, green turnaround; size = weakness). {shade === 'layoffs' ? 'States are shaded by jobs in WARN layoff notices from every employer in the last 90 days (log scale), from the state filings Big Local News consolidates. A few states publish nothing usable and stay blank.' : 'States are shaded by the stress of the listed companies based there.'}</p>
              {(() => { const abroad = shown.filter((r) => r.label !== 'healthy' && isOk(r.lat) && !albers([r.lon!, r.lat!])); return abroad.length ? <p className="small dx-pad">Outside the US: {abroad.map((r) => <button key={r.sym} className="wl-sym" onClick={() => setSel(r)}>{r.sym}</button>)}</p> : null; })()}
            </div>
          )}
        </div>
        {sel && <Detail r={sel} onChart={onChart} onClose={() => setSel(null)} />}
      </div>
      <p className="note">CALCULATED from SEC filings, SEC XBRL financials, insider filings, prices, FINRA short volume, state WARN layoff notices, public job-board counts and headline keyword rules. A screen for where to look, not a rating and not advice. {f ? `Nightly read of ${f.universe} companies, ${f.today}.` : ''} {d.extras.length ? `${d.extras.length} of your tickers read live.` : ''}
        {f && Object.keys(f.errors).length > 0 && <span className="muted"> Partly missing: {Object.entries(f.errors).map(([k, v]) => `${k} (${v})`).join(' · ')}.</span>}</p>
    </section>
  );
}

/** Home widget: the top weak names, turnarounds or sectors. Click a name to chart it. */
export function DistressW({ mode, mySyms, onChart, openPage }: { mode: DataMode; mySyms: string[]; onChart: (s: string) => void; openPage?: () => void }) {
  const { d, rows, error, loading } = useDistress(mode, mySyms);
  const [tab, setTab] = useState<'weak' | 'turn' | 'sectors'>('weak');
  if (mode.kind !== 'live') return <p className="hw-pad small muted">Needs live data. Never filled with sample companies.</p>;
  if (loading) return <p className="hw-pad small muted">Loading…</p>;
  if (!rows.length) return <p className="hw-pad small muted">{error === 'not-run-yet' ? 'The nightly read hasn’t run yet (Actions → Distress read).' : error || 'Unavailable.'}</p>;
  const weak = rows.filter((r) => r.label === 'distressed' || r.label === 'watch').sort((a, b) => b.weak - a.weak).slice(0, 12);
  const turn = rows.filter((r) => r.label === 'turnaround').sort((a, b) => b.turn - a.turn).slice(0, 12);
  return (
    <div className="dx-w">
      <div className="hw-bar">
        <PageTabs<'weak' | 'turn' | 'sectors'> value={tab} onChange={setTab} options={[{ id: 'weak', label: 'Weak' }, { id: 'turn', label: 'Turnarounds' }, { id: 'sectors', label: 'Sectors' }]} />
        {d?.file && <Fresh kind="eod" at={d.file.asOf} src="CALCULATED nightly from SEC filings, financials, insiders, prices and headlines" />}
      </div>
      <div className="dx-wl">
        {tab !== 'sectors' && (tab === 'weak' ? weak : turn).map((r) => (
          <button key={r.sym} className="dx-wrow" onClick={() => onChart(r.sym)} title={r.signals.slice(0, 4).map((s) => s.text).join('\n')}>
            <b className="num">{r.sym}</b><Bars r={r} /><span className="small dx-sig">{r.signals[0]?.text ?? ''}</span>
          </button>
        ))}
        {tab === 'sectors' && (d?.file?.sectors ?? []).slice(0, 11).map((s) => (
          <div key={s.key} className="dx-wrow"><span className="small">{s.key}</span><span className="dx-stress"><i style={{ width: `${Math.min(100, s.stress * 1.6)}%` }} /></span><span className="small muted num">{s.distressed + s.watch}/{s.n}</span></div>
        ))}
      </div>
      {openPage && <button className="link small hw-pad" onClick={openPage}>Open the Distress page (⇧R) →</button>}
    </div>
  );
}

/** World map layer: flagged companies at their headquarters, anywhere in the world (dots inside the map's SVG). */
export function DistressDots({ mode, project, sel, onPick }: { mode: DataMode; project: (lon: number, lat: number) => [number, number]; sel: string | null; onPick: (r: DistressRow) => void }) {
  const { rows } = useDistress(mode, []);
  const spots = rows.filter((r) => r.label !== 'healthy' && isOk(r.lat) && isOk(r.lon)).sort((a, b) => a.weak - b.weak);
  return <>{spots.map((r) => { const [x, y] = project(r.lon!, r.lat!); return (
    <circle key={r.sym} cx={x} cy={y} r={2.5 + r.weak / 14} className={`dx-dot ${r.label} ${sel === r.sym ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); onPick(r); }}>
      <title>{`${r.sym} · ${r.name} · ${r.hq} · ${LABEL[r.label]} (weakness ${r.weak}, strength ${r.turn})`}</title>
    </circle>); })}</>;
}
/** World map side panel for the distress layer. */
export function DistressSide({ mode, sel, onPick, onChart }: { mode: DataMode; sel: DistressRow | null; onPick: (r: DistressRow | null) => void; onChart: (s: string) => void }) {
  const { d, rows, error, loading } = useDistress(mode, []);
  if (sel) return <><button className="link small" onClick={() => onPick(null)}>← All flagged companies</button><Detail r={sel} onChart={onChart} onClose={() => onPick(null)} /></>;
  const top = rows.filter((r) => r.label !== 'healthy').sort((a, b) => b.weak - a.weak).slice(0, 14);
  return (
    <>
      <h4>Distressed companies {d?.file && <Fresh kind="eod" at={d.file.asOf} src="CALCULATED nightly from public data" />}</h4>
      {mode.kind !== 'live' && <p className="muted small">Needs live data.</p>}
      {loading && <p className="muted small">Loading…</p>}
      {!loading && !rows.length && <p className="muted small">{error === 'not-run-yet' ? 'The nightly read hasn’t run yet.' : error || 'Unavailable.'}</p>}
      <ol className="wm-rank">{top.map((r) => <li key={r.sym}><button className="wm-row" onClick={() => onPick(r)}><span className="wm-nm">{r.sym} · {r.name}</span><Tag l={r.label} /><span className="num small">{r.weak}</span></button></li>)}</ol>
      <p className="small muted">Dots at each flagged company’s headquarters: red distressed, amber watch, green turnaround; size = weakness. S&amp;P 500 and Nasdaq-100. Full view on the Distress page (⇧R).</p>
    </>
  );
}
