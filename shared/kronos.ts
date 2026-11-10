// Kronos forecast experiment (github.com/shiyu-coder/Kronos, MIT): types for published/kronos.json, a shape check, and the scorecard.
// The file is written by the daily GitHub Action (agents/kronos/run.py). Everything here is a MODEL FORECAST, not data, not advice.
// Pure functions only, so the scorecard math is unit-tested.

export const KRONOS_LABEL = 'MODEL FORECAST, not data, not advice';
/** Fewer scored forecast days than this and the desk says "too early to judge". */
export const MIN_SCORED_DAYS = 20;

export interface KronosStep { n: number; date: string; open: number; high: number; low: number; close: number; closeLow: number; closeHigh: number }
export interface KronosForecast {
  ticker: string;
  /** Date of the last real daily bar the model saw (YYYY-MM-DD). */
  asOf: string;
  lastClose: number;
  /** Next trading days, median candle per day; closeLow/closeHigh = 10th and 90th percentile of the sampled closes. `date` is the expected calendar day (holidays not modelled). */
  steps: KronosStep[];
  /** Typical size of the 5-day move: mean of |close(5)/lastClose - 1| across the samples, in %. Direction-free, the number a long-options holder cares about. */
  moveAbsPct: number;
  /** (10th-90th percentile spread of the final close) / lastClose, in %. */
  rangePct: number;
}
export interface KronosFile {
  schema: 1;
  label: string;
  model: { name: string; tokenizer: string; revision?: string; code?: string };
  generatedAt: string;
  horizon: number;
  samples: number;
  lookback: number;
  source: string;
  forecasts: KronosForecast[];
  /** Earlier forecasts, kept so the desk can score them against what happened. */
  history: KronosForecast[];
  /** Recent real daily closes per ticker as [YYYY-MM-DD, close], oldest first. */
  closes: Record<string, [string, number][]>;
  errors?: Record<string, string>;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function okForecast(f: any): f is KronosForecast {
  return !!f && typeof f.ticker === 'string' && isDate(f.asOf) && isNum(f.lastClose) && isNum(f.moveAbsPct) && isNum(f.rangePct)
    && Array.isArray(f.steps) && f.steps.length > 0
    && f.steps.every((s: any) => s && isNum(s.n) && isDate(s.date) && ['open', 'high', 'low', 'close', 'closeLow', 'closeHigh'].every((k) => isNum(s[k])));
}

/** Shape check for what the desk reads from GitHub. Returns the file, or an error string that says what is wrong. Never invents values. */
export function parseKronos(j: unknown): { ok: true; file: KronosFile } | { ok: false; error: string } {
  const f = j as any;
  if (!f || typeof f !== 'object') return { ok: false, error: 'not an object' };
  if (f.schema !== 1) return { ok: false, error: 'unknown schema' };
  if (typeof f.generatedAt !== 'string' || Number.isNaN(Date.parse(f.generatedAt))) return { ok: false, error: 'missing generatedAt' };
  if (!f.model || typeof f.model.name !== 'string' || !f.model.name) return { ok: false, error: 'missing model name' };
  if (!Array.isArray(f.forecasts) || !f.forecasts.every(okForecast)) return { ok: false, error: 'bad forecasts' };
  const history = f.history ?? [];
  if (!Array.isArray(history) || !history.every(okForecast)) return { ok: false, error: 'bad history' };
  const closes = f.closes ?? {};
  if (typeof closes !== 'object' || Object.values(closes).some((a) => !Array.isArray(a) || !(a as any[]).every((p) => Array.isArray(p) && isDate(p[0]) && isNum(p[1])))) return { ok: false, error: 'bad closes' };
  return { ok: true, file: { ...f, label: KRONOS_LABEL, history, closes, horizon: f.horizon ?? f.forecasts[0]?.steps.length ?? 0, samples: f.samples ?? 0, lookback: f.lookback ?? 0, source: f.source ?? '' } as KronosFile };
}

export interface ScoredForecast {
  ticker: string; asOf: string; horizon: number;
  forecastClose: number; actualClose: number; lastClose: number;
  /** Forecast and realised 5-day direction agree (a flat forecast counts as a miss, a flat actual as a miss). */
  hit: boolean;
  errPct: number;
  /** The "tomorrow looks like today" guess for the same day: |lastClose - actual| / actual, %. */
  naiveErrPct: number;
  inRange: boolean;
  forecastMovePct: number; actualMovePct: number;
}
export interface Scorecard {
  /** Distinct forecast dates that are fully resolved (all steps have a real close). */
  days: number;
  forecasts: number;
  enough: boolean;
  hitRate: number | null;
  avgErrPct: number | null;
  avgNaiveErrPct: number | null;
  /** Share of resolved forecasts where the model's error was smaller than the naive guess. */
  beatsNaive: number | null;
  /** Share of actual final closes that landed inside the 10th-90th percentile band (about 80% if the band is honest). */
  coverage: number | null;
  /** Mean of (typical move the model expected - move that happened), in % points: positive = the model over-estimates movement. */
  moveBias: number | null;
  rows: ScoredForecast[];
}

/** Score every past forecast whose full horizon has real closes. Step n is matched to the n-th real bar after asOf (so holidays don't shift it). */
export function scoreKronos(file: Pick<KronosFile, 'forecasts' | 'history' | 'closes'>): Scorecard {
  const seen = new Set<string>();
  const rows: ScoredForecast[] = [];
  for (const f of [...file.history, ...file.forecasts]) {
    const key = `${f.ticker}|${f.asOf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bars = file.closes[f.ticker];
    if (!bars) continue;
    const i = bars.findIndex((b) => b[0] === f.asOf);
    const last = f.steps[f.steps.length - 1];
    if (i < 0 || !last || i + last.n > bars.length - 1) continue;
    const actual = bars[i + last.n][1];
    if (!(actual > 0) || !(f.lastClose > 0)) continue;
    const fMove = last.close - f.lastClose, aMove = actual - f.lastClose;
    rows.push({
      ticker: f.ticker, asOf: f.asOf, horizon: last.n,
      forecastClose: last.close, actualClose: actual, lastClose: f.lastClose,
      hit: fMove !== 0 && aMove !== 0 && Math.sign(fMove) === Math.sign(aMove),
      errPct: (Math.abs(last.close - actual) / actual) * 100,
      naiveErrPct: (Math.abs(f.lastClose - actual) / actual) * 100,
      inRange: actual >= last.closeLow && actual <= last.closeHigh,
      forecastMovePct: f.moveAbsPct,
      actualMovePct: (Math.abs(aMove) / f.lastClose) * 100,
    });
  }
  const n = rows.length;
  const avg = (g: (r: ScoredForecast) => number) => (n ? rows.reduce((s, r) => s + g(r), 0) / n : null);
  const days = new Set(rows.map((r) => r.asOf)).size;
  return {
    days, forecasts: n, enough: days >= MIN_SCORED_DAYS, rows,
    hitRate: n ? rows.filter((r) => r.hit).length / n : null,
    avgErrPct: avg((r) => r.errPct),
    avgNaiveErrPct: avg((r) => r.naiveErrPct),
    beatsNaive: n ? rows.filter((r) => r.errPct < r.naiveErrPct).length / n : null,
    coverage: n ? rows.filter((r) => r.inRange).length / n : null,
    moveBias: avg((r) => r.forecastMovePct - r.actualMovePct),
  };
}
