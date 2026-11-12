// Tear sheet: the one-glance numbers for a company. Price / market cap (Yahoo, delayed), shares, estimated float, short
// interest (FINRA), cash, debt, last fiscal year's revenue, profit and free cash flow (SEC filings), next earnings (Finnhub).
// Empty readings are hidden, not shown as dashes.
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import type { DataMode } from '../data/live';
import type { Tear } from '../../shared/tearsheet';
import { Q } from './common';

interface TearData {
  sym: string; price: number | null; priceAt: number | null; marketCap: number | null; facts: Tear | null; floatShares: number | null; floatClose: number | null;
  shortInterest: { shares: number; daysToCover: number; changePct: number; settlementDate: string; pctFloat: number | null } | null;
  nextEarnings: { date: string; hour: string; epsEst: number | null } | null; errors: Record<string, string>; sources: Record<string, string>;
}

const usd = (v: number) => { const a = Math.abs(v), s = v < 0 ? '−' : ''; return a >= 1e12 ? `${s}$${(a / 1e12).toFixed(2)}T` : a >= 1e9 ? `${s}$${(a / 1e9).toFixed(1)}B` : a >= 1e6 ? `${s}$${(a / 1e6).toFixed(0)}M` : `${s}$${Math.round(a).toLocaleString('en-US')}`; };
const cnt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.round(v).toLocaleString('en-US'));
const mdy = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function TearSheet({ sym, mode }: { sym: string; mode: DataMode }) {
  const [d, setD] = useState<TearData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (mode.kind !== 'live') return;
    let stop = false;
    setD(null); setErr(null);
    fetch(`/api/research?fn=tearsheet&symbol=${encodeURIComponent(sym)}`).then(async (r) => { const j = await r.json(); if (stop) return; if (r.ok) setD(j); else setErr(j.error ?? `HTTP ${r.status}`); }).catch((e) => !stop && setErr(String(e)));
    return () => { stop = true; };
  }, [sym, mode.kind]);
  if (mode.kind !== 'live') return null; // no made-up numbers in demo mode
  if (err) return <p className="small muted">Tear sheet unavailable: {err}</p>;
  if (!d) return <p className="small muted">Loading the tear sheet…</p>;
  const f = d.facts;
  const dil = f?.sharesOut && f.sharesYearAgo ? (f.sharesOut / f.sharesYearAgo - 1) * 100 : null;
  const net = f?.cash != null && f.debt != null ? f.cash - f.debt : null;
  const rows: [string, ReactNode, string][] = [
    ['Price', d.price != null ? `$${d.price.toFixed(2)}` : null, d.sources.prices],
    ['Market cap', d.marketCap != null ? usd(d.marketCap) : null, 'Price × shares outstanding (calculated)'],
    ['Shares out', f?.sharesOut ? <>{cnt(f.sharesOut)}{dil != null && Math.abs(dil) >= 0.5 && <span className={`small ${dil > 0 ? 'down' : 'up'}`}> {dil > 0 ? '+' : ''}{dil.toFixed(1)}% y/y</span>}</> : null, `SEC filing cover page, as of ${f?.sharesAsOf ?? '?'}`],
    ['Float (est.)', d.floatShares ? <>{cnt(d.floatShares)}{f?.sharesOut ? <span className="small muted"> · {Math.min(100, (d.floatShares / f.sharesOut) * 100).toFixed(0)}% of shares</span> : null}</> : null, `${d.sources.float}: ${f?.publicFloatUsd ? usd(f.publicFloatUsd) : '?'} on ${f?.floatAsOf ?? '?'} ÷ $${d.floatClose?.toFixed(2) ?? '?'}`],
    ['Short interest', d.shortInterest ? <>{cnt(d.shortInterest.shares)}{d.shortInterest.pctFloat != null && <span className="small"> · {d.shortInterest.pctFloat.toFixed(1)}% of float</span>}<span className="small muted"> · {d.shortInterest.daysToCover.toFixed(1)} days to cover</span></> : null, `${d.sources.shortInterest}, settled ${d.shortInterest?.settlementDate ?? ''}`],
    ['Cash', f?.cash != null ? usd(f.cash) : null, `SEC filing, as of ${f?.balanceAsOf ?? '?'}`],
    ['Debt', f?.debt != null ? usd(f.debt) : null, `SEC filing (long-term + current debt, short-term borrowings), as of ${f?.balanceAsOf ?? '?'}`],
    ['Net cash', net != null ? <span className={net >= 0 ? 'up' : 'down'}>{usd(net)}</span> : null, 'Cash − debt (calculated)'],
    [`Revenue${f?.fyEnd ? ` FY${f.fyEnd.slice(2, 4)}` : ''}`, f?.revenueFY != null ? usd(f.revenueFY) : null, `Last fiscal year (10-K), ended ${f?.fyEnd ?? '?'}`],
    ['Net income', f?.netIncomeFY != null ? <span className={f.netIncomeFY >= 0 ? '' : 'down'}>{usd(f.netIncomeFY)}</span> : null, 'Last fiscal year (10-K)'],
    ['Free cash flow', f?.fcfFY != null ? <span className={f.fcfFY >= 0 ? '' : 'down'}>{usd(f.fcfFY)}</span> : null, 'Operating cash flow − capital spending, last fiscal year (calculated)'],
    ['Next earnings', d.nextEarnings ? `${mdy(d.nextEarnings.date)}${d.nextEarnings.hour === 'amc' ? ' after close' : d.nextEarnings.hour === 'bmo' ? ' before open' : ''}${d.nextEarnings.epsEst != null ? ` · EPS est $${d.nextEarnings.epsEst.toFixed(2)}` : ''}` : null, d.sources.earnings],
  ];
  const shown = rows.filter(([, v]) => v != null);
  return (
    <div className="ts">
      <h4><Q k="calc" src="SEC filings (official), FINRA short interest, Yahoo prices (unofficial, delayed). Float, market cap and net cash are calculated. Hover a row for its source and date." />Tear sheet</h4>
      <div className="kv co-kv ts-kv">
        {shown.map(([k, v, src]) => <Fragment key={k}><span title={src}>{k}</span><b className="num" title={src}>{v}</b></Fragment>)}
      </div>
      {!shown.length && <p className="small muted">No SEC or price data for {sym}.</p>}
      <p className="note small">Institutional ownership isn't here: it needs 13F totals that no free source keeps current.{Object.keys(d.errors).length ? ` Missing: ${Object.keys(d.errors).join(', ')}.` : ''}</p>
    </div>
  );
}
