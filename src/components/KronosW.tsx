// Kronos forecast (experiment): a candlestick foundation model's 5-day forecast from published/kronos.json, shown as a
// range and an expected movement size (not a bullish/bearish call), with a scorecard against what really happened.
// Always labelled MODEL FORECAST. Read-only; nothing here touches orders.
import { KRONOS_LABEL, MIN_SCORED_DAYS, scoreKronos, type KronosFile, type KronosForecast, type Scorecard } from '../../shared/kronos';
import { useApi } from '../data/apis';
import type { HomeData } from './HomeWidgets';
import { Fresh } from './common';

const num = (v: number) => (v >= 100 ? v.toFixed(1) : v.toFixed(2));
const P0 = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

/** Last close, then the median close path with its 10th-90th percentile band. */
function Path({ f }: { f: KronosForecast }) {
  const W = 150, H = 40, n = f.steps.length;
  const lo = Math.min(f.lastClose, ...f.steps.map((s) => s.closeLow)), hi = Math.max(f.lastClose, ...f.steps.map((s) => s.closeHigh));
  const pad = (hi - lo) * 0.12 || 1;
  const x = (i: number) => (i / n) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 6);
  const top = [f.lastClose, ...f.steps.map((s) => s.closeHigh)], bot = [f.lastClose, ...f.steps.map((s) => s.closeLow)], mid = [f.lastClose, ...f.steps.map((s) => s.close)];
  const poly = [...top.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`), ...bot.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).reverse()].join(' ');
  const line = mid.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="kr-path" role="img" aria-label={`${f.ticker} forecast range`}>
      <polygon points={poly} className="kr-band" />
      <line x1={x(0)} x2={x(0)} y1={2} y2={H - 2} className="kr-now" />
      <path d={line} className="kr-line" />
    </svg>
  );
}

export function Score({ s }: { s: Scorecard }) {
  if (!s.enough) {
    return (
      <div className="kr-score small" data-testid="kronos-score">
        <b>Scorecard: too early to judge.</b> {s.days} of {MIN_SCORED_DAYS} forecast days have a real outcome so far
        {s.forecasts ? ` (${s.forecasts} forecasts scored)` : ''}. It fills in as each 5-day forecast comes due.
      </div>
    );
  }
  return (
    <div className="kr-score small" data-testid="kronos-score">
      <b>Scorecard</b> over {s.days} forecast days ({s.forecasts} forecasts, day-5 close):
      <ul>
        <li>Direction right <b>{P0(s.hitRate)}</b> <span className="muted">(a coin flip is ~50%)</span></li>
        <li>Average miss <b>{s.avgErrPct!.toFixed(2)}%</b> vs <b>{s.avgNaiveErrPct!.toFixed(2)}%</b> for "no change" <span className="muted">(model closer {P0(s.beatsNaive)} of the time)</span></li>
        <li>Actual close inside the range <b>{P0(s.coverage)}</b> <span className="muted">(about 80% if the range is honest)</span></li>
        <li>Movement size: model expected {s.moveBias! >= 0 ? 'more' : 'less'} than happened by <b>{Math.abs(s.moveBias!).toFixed(2)} pts</b></li>
      </ul>
    </div>
  );
}

export function KronosView({ file }: { file: KronosFile }) {
  const score = scoreKronos(file);
  const gen = new Date(file.generatedAt);
  return (
    <div className="kr" data-testid="kronos-view">
      <div className="kr-flag" role="note"><b>{KRONOS_LABEL.toUpperCase()}</b> · {file.model.name} · {file.samples} samples · next {file.horizon} trading days · made {Number.isNaN(gen.getTime()) ? file.generatedAt : gen.toISOString().slice(0, 10)}</div>
      {file.forecasts.map((f) => {
        const last = f.steps[f.steps.length - 1];
        return (
          <div key={f.ticker} className="kr-r">
            <b className="wl-sym">{f.ticker}</b>
            <Path f={f} />
            <div className="small">
              <div>Typical {last.n}-day move <b>±{f.moveAbsPct.toFixed(1)}%</b> <span className="muted">· range {num(last.closeLow)}–{num(last.closeHigh)} ({f.rangePct.toFixed(1)}% wide)</span></div>
              <div className="muted">from {num(f.lastClose)} ({f.asOf}) · median {num(last.close)}</div>
            </div>
          </div>
        );
      })}
      {file.errors && <p className="small muted kr-err">No forecast for: {Object.keys(file.errors).join(', ')} (data or model error; nothing filled in).</p>}
      <Score s={score} />
      <p className="note">An open-source model (Kronos, {file.model.name}) forecasting from price and volume only. Shown as a range and a movement size, not a call. Its published gains are the authors' own benchmarks; the scorecard above is your evidence. Bars: {file.source || 'Yahoo Finance daily bars'}. Updated after each weekday close.</p>
    </div>
  );
}

export function KronosW({ d }: { d: HomeData; cfg: Record<string, any>; set: (c: Record<string, any>) => void }) {
  const live = d.mode.kind === 'live';
  const r = useApi<{ file?: KronosFile; error?: string }>(live ? '/api/research?fn=kronos' : null, 30 * 60_000, 15 * 60_000);
  const file = r.data?.file;
  return (
    <div className="hw-col">
      <div className="hw-bar">
        <span className="small muted">Kronos forecast (experiment)</span>
        {file ? <Fresh kind="eod" src="Kronos model run by a GitHub Action after each close; bars from Yahoo Finance" /> : <Fresh kind={live && r.loading ? 'pending' : 'nodata'} />}
      </div>
      {!live && <p className="hw-pad small muted">Needs the live desk: the forecast file is read from GitHub. Nothing is made up in the preview.</p>}
      {live && r.data?.error === 'not-run-yet' && <div className="hw-pad small"><p>No forecast yet. The job runs after every weekday close, or now: GitHub → your repo → <b>Actions</b> → <b>Kronos forecast</b> → <b>Run workflow</b>. It saves <code>published/kronos.json</code>, which this widget reads.</p></div>}
      {live && (r.error || r.data?.error) && r.data?.error !== 'not-run-yet' && <p className="hw-pad small down">{r.data?.error ?? r.error}</p>}
      {file && <KronosView file={file} />}
    </div>
  );
}
