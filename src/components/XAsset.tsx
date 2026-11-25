// Cross-asset sections that sit on existing pages (one fetch, shared):
//   CarryGlobal (Global page): carry trades incl. the yen carry trade, bond carry and European yields, global debt.
//   LeverageW (Credit & Swaps): margin debt (FINRA) and private-credit lenders (BDCs).
//   VolIncome (Gamma page): options income (buy-write, put-write, income ETFs), short vol, dispersion.
import type { CarryRow } from '../../shared/xasset';
import { useApi } from '../data/apis';
import { Fresh, Q } from './common';
import { goPage } from '../lib/deskctx';

interface X {
  carry: { rows: CarryRow[]; rates: { cur: string; label: string; rate: number | null; at: string }[]; jpy: { date: string; levNet: number; assetNet: number; levChg: number } | null } | null;
  bonds: { tens: { id: string; label: string; last: number | null; at: string; y1: number | null }[]; euro: { aaa10: [string, number] | null; all10: [string, number] | null; aaa2: [string, number] | null; periphery: number | null; periphery1y: number | null }; usCarry: [string, number] | null } | null;
  debt: { cty: string; gov?: number; priv?: number; gov1y?: number; priv1y?: number; at?: string }[] | null;
  margin: { month: string; debit: number; credit: number }[] | null;
  lenders: { sym: string; name: string; last: number | null; m1: number | null; m3: number | null; y1: number | null }[] | null;
  vol: { rows: { sym: string; last: number | null; m1: number | null; y1: number | null; hv: number | null }[]; term: { ratio: number | null; state: string | null }; spxHv21: number | null } | null;
  errors: Record<string, string>; asOf: number; source: string;
}
const useX = (on: boolean) => useApi<X>(on ? '/api/research?fn=xasset' : null, 30 * 60_000, 15 * 60_000);
const pc = (x: number | null | undefined) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)}%`);
const f2 = (x: number | null | undefined, s = '') => (x == null ? '—' : `${x.toFixed(2)}${s}`);
const CTY: Record<string, string> = { US: 'United States', JP: 'Japan', CN: 'China', DE: 'Germany', FR: 'France', IT: 'Italy', GB: 'UK', CA: 'Canada' };
const Err = ({ x, k }: { x: X | null; k: string }) => (x?.errors?.[k] ? <p className="small muted gx-pad">Not loaded: {x.errors[k]}</p> : null);

export function CarryGlobal({ live }: { live: boolean }) {
  const r = useX(live), x = r.data;
  if (!live) return null;
  const yen = x?.carry?.rows.filter((c) => c.fund === 'JPY') ?? [];
  const unwinding = x?.carry?.rows.filter((c) => c.unwind) ?? [];
  return (
    <section className="panel">
      <div className="gx-h"><Q k="delayed" src={x?.source ?? 'loading'} /><b>Carry trades, bond yields and global debt</b>{x && <Fresh kind="eod" at={x.asOf} src={x.source} />}</div>
      {!x && <p className="small muted gx-pad">{r.error ?? 'Loading…'}</p>}
      {x && <div className="xa-grid">
        <div>
          <h4>FX carry (borrow cheap, hold higher-yielding)</h4>
          <Err x={x} k="carry" />
          {x.carry && <table className="cs-t"><thead><tr><th>Pair</th><th>Carry</th><th>Vol</th><th>Carry/vol</th><th>1 mo</th><th>3 mo</th></tr></thead><tbody>
            {x.carry.rows.map((c) => <tr key={c.pair} className={c.unwind ? 'cliff' : ''}><td><b>{c.pair}</b></td><td className="num">{f2(c.carry, '%')}</td><td className="num">{f2(c.vol, '%')}</td><td className="num">{f2(c.ratio)}</td><td className={`num ${(c.m1 ?? 0) < 0 ? 'down' : 'up'}`}>{pc(c.m1)}</td><td className="num">{pc(c.m3)}</td></tr>)}
          </tbody></table>}
          {x.carry && <p className="small gx-pad">{unwinding.length ? <b className="down">Unwind warning: {unwinding.map((c) => c.pair).join(', ')} fell 5%+ in a month. </b> : 'No pair has dropped 5% in a month (no sharp unwind). '}
            Yen carry: borrow at Japan's {f2(x.carry.rates.find((q) => q.cur === 'JPY')?.rate, '%')}{yen.length ? `, ${yen.length} yen-funded pairs tracked` : ''}. When the yen jumps, these trades get sold fast, and in August 2024 that spilled into US stocks.
            {x.carry.jpy && <> Hedge funds' net yen futures: <b>{x.carry.jpy.levNet.toLocaleString('en-US')}</b> contracts ({x.carry.jpy.levChg >= 0 ? '+' : ''}{x.carry.jpy.levChg.toLocaleString('en-US')} this week, {x.carry.jpy.date}; negative = short yen, i.e. carry is on).</>}</p>}
          {x.carry && <p className="small muted gx-pad">Rates are OECD 3-month interbank, monthly: {x.carry.rates.map((q) => `${q.label} ${f2(q.rate, '%')} (${q.at.slice(0, 7)})`).join(' · ')}.</p>}
        </div>
        <div>
          <h4>Bond yields and bond carry</h4>
          <Err x={x} k="bonds" />
          {x.bonds && <table className="cs-t"><thead><tr><th>10-year</th><th>Yield</th><th>A year ago</th><th>As of</th></tr></thead><tbody>
            {x.bonds.tens.map((t) => <tr key={t.id}><td>{t.label}</td><td className="num">{f2(t.last, '%')}</td><td className="num muted">{f2(t.y1, '%')}</td><td className="small muted">{t.at}</td></tr>)}
            {x.bonds.euro.aaa10 && <tr><td>Euro area AAA (daily)</td><td className="num">{f2(x.bonds.euro.aaa10[1], '%')}</td><td></td><td className="small muted">{x.bonds.euro.aaa10[0]}</td></tr>}
          </tbody></table>}
          {x.bonds && <p className="small gx-pad">Euro periphery premium (all euro government bonds minus AAA, 10y): <b>{x.bonds.euro.periphery ?? '—'}bp</b> vs {x.bonds.euro.periphery1y ?? '—'}bp a year ago. Rising = investors want more to hold Italy, France, Spain. US bond carry (10y minus 3-month): {x.bonds.usCarry ? f2(x.bonds.usCarry[1], ' pts') : '—'}; negative means holding long bonds earns less than cash.</p>}
          <h4>Global debt (BIS, % of GDP)</h4>
          <Err x={x} k="debt" />
          {x.debt && <table className="cs-t"><thead><tr><th>Country</th><th>Government</th><th>Households + companies</th><th>Quarter</th></tr></thead><tbody>
            {x.debt.map((d) => <tr key={d.cty}><td>{CTY[d.cty] ?? d.cty}</td><td className="num">{d.gov != null ? `${d.gov.toFixed(0)}%` : '—'}{d.gov != null && d.gov1y != null ? <span className="muted small"> ({d.gov - d.gov1y >= 0 ? '+' : ''}{(d.gov - d.gov1y).toFixed(0)})</span> : null}</td><td className="num">{d.priv != null ? `${d.priv.toFixed(0)}%` : '—'}</td><td className="small muted">{d.at}</td></tr>)}
          </tbody></table>}
          <p className="small muted gx-pad">Change in brackets is versus about a year earlier. Government debt here is at market value, so it can fall when yields rise.</p>
        </div>
      </div>}
    </section>
  );
}

export function LeverageW({ live }: { live: boolean }) {
  const r = useX(live), x = r.data;
  if (!live) return null;
  const m = x?.margin ?? [], last = m[0], yago = m[12];
  return (
    <div className="cs-grid">
      <section className="panel">
        <div className="gx-h"><Q k="eod" src="FINRA margin statistics (monthly)" /><b>Margin debt</b><span className="small muted">money borrowed against stocks at brokers</span></div>
        <Err x={x} k="margin" />
        {last && <p className="small gx-pad"><b>${(last.debit / 1e6).toFixed(2)}T</b> in {last.month}{yago ? <>, {pc((last.debit / yago.debit - 1) * 100)} vs a year earlier</> : null}. Free cash in accounts ${(last.credit / 1e6).toFixed(2)}T, so borrowed money is {(last.debit / last.credit).toFixed(1)}× the spare cash. Fast-rising margin debt has often come near market tops, and forced selling (margin calls) makes drops sharper.</p>}
        {m.length > 1 && <div className="xa-bars">{m.slice(0, 24).reverse().map((r) => <i key={r.month} title={`${r.month}: $${(r.debit / 1e6).toFixed(2)}T`} style={{ height: `${(r.debit / Math.max(...m.slice(0, 24).map((q) => q.debit))) * 100}%` }} />)}</div>}
        <p className="small muted gx-pad">Securities-backed lines of credit at banks and wealth managers are not published as one free number; these broker margin figures are the closest public measure.</p>
      </section>
      <section className="panel">
        <div className="gx-h"><Q k="delayed" src="Yahoo Finance prices (unofficial)" /><b>Private credit lenders (BDCs)</b><span className="small muted">listed private-credit funds</span></div>
        <Err x={x} k="lenders" />
        {x?.lenders && <table className="cs-t"><thead><tr><th>Lender</th><th>1 mo</th><th>3 mo</th><th>1 yr</th></tr></thead><tbody>{x.lenders.map((b) => <tr key={b.sym}><td><b>{b.sym}</b> <span className="small muted">{b.name}</span></td><td className={`num ${(b.m1 ?? 0) < 0 ? 'down' : 'up'}`}>{pc(b.m1)}</td><td className="num">{pc(b.m3)}</td><td className="num">{pc(b.y1)}</td></tr>)}</tbody></table>}
        <p className="small muted gx-pad">BDC shares falling together is an early sign of private-credit stress. Use the lookup above to see which BDCs lend to a company and how they value the loan.</p>
      </section>
    </div>
  );
}

const VOL_NAME: Record<string, string> = { '^VIX': 'VIX (30-day S&P implied vol)', '^VIX9D': 'VIX 9-day', '^VIX3M': 'VIX 3-month', '^VVIX': 'VVIX (vol of VIX)', '^COR1M': 'Implied correlation, 1 month', '^DSPX': 'Dispersion index (DSPX)', '^BXM': 'Cboe BuyWrite (covered call) index', '^PUT': 'Cboe PutWrite index', '^GSPC': 'S&P 500', SPY: 'SPY', QQQ: 'QQQ', JEPI: 'JEPI (S&P income ETF)', JEPQ: 'JEPQ (Nasdaq income ETF)', QYLD: 'QYLD (Nasdaq covered calls)', XYLD: 'XYLD (S&P covered calls)', SVXY: 'SVXY (short VIX futures)' };
export function VolIncome({ live }: { live: boolean }) {
  const r = useX(live), x = r.data, v = x?.vol;
  if (!live) return null;
  const g = (s: string) => v?.rows.find((q) => q.sym === s);
  const cor = g('^COR1M')?.last, dspx = g('^DSPX')?.last, vix = g('^VIX')?.last;
  return (
    <section className="panel">
      <div className="gx-h"><Q k="delayed" src="Cboe indices and ETF prices via Yahoo Finance (unofficial)" /><b>Options income, short vol and dispersion</b>{x && <Fresh kind="delayed" at={x.asOf} src={x.source} />}</div>
      <Err x={x} k="vol" />
      {v && <div className="xa-grid">
        <div>
          <p className="small gx-pad"><b>VIX term structure: {v.term.state ?? '—'}</b> (VIX ÷ VIX 3-month = {f2(v.term.ratio)}). {v.term.state === 'backwardation' ? 'Near-term fear is above longer-term: short-vol positions are under pressure and dealers may have to buy back protection.' : v.term.state === 'contango' ? 'Normal shape: selling options (covered calls, short vol) is being paid, and that steady selling tends to dampen moves.' : 'Roughly flat.'}
            {vix != null && v.spxHv21 != null && <> VIX {vix.toFixed(1)} vs the S&P's actual 1-month volatility {(v.spxHv21 * 100).toFixed(1)}%: {vix > v.spxHv21 * 100 ? 'options are priced above what the market is doing (sellers earn a premium)' : 'options are cheap versus actual moves (risky for option sellers)'}.</>}</p>
          <p className="small gx-pad"><b>Dispersion:</b> implied correlation {f2(cor)} and dispersion index {f2(dspx)}. Low correlation with high dispersion means single stocks are moving apart while the index stays calm, the setup dispersion traders sell index vol and buy single-stock vol against. If correlation jumps, everything moves together and that trade loses.</p>
          <p className="small muted gx-pad">Squeeze risk (short interest, borrow): <button className="link" onClick={() => goPage('plumbing')}>Shorts &amp; Supply →</button></p>
        </div>
        <table className="cs-t"><thead><tr><th>Gauge / product</th><th>Last</th><th>1 mo</th><th>1 yr</th></tr></thead><tbody>
          {v.rows.filter((q) => q.sym !== '^GSPC').map((q) => <tr key={q.sym}><td>{VOL_NAME[q.sym] ?? q.sym}</td><td className="num">{f2(q.last)}</td><td className="num">{pc(q.m1)}</td><td className="num">{pc(q.y1)}</td></tr>)}
        </tbody></table>
      </div>}
      <p className="small muted gx-pad">Covered-call and income ETFs sell calls every month; the steady supply of options can calm the index. Their 1-year return next to SPY / QQQ shows what giving up the upside cost. Not advice.</p>
    </section>
  );
}
