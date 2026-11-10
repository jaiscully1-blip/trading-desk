"""Pure helpers for the Kronos experiment (standard library only, so they are unit-tested without torch)."""
import datetime as dt

HORIZON = 5
KEEP_DAYS = 90      # forecast dates kept per ticker in the file, for the desk's scorecard
KEEP_CLOSES = 130   # real daily closes kept per ticker (must cover KEEP_DAYS plus the horizon)


def percentile(values, q):
    """Linear-interpolated percentile, q in 0..1."""
    v = sorted(values)
    if not v:
        raise ValueError("no values")
    if len(v) == 1:
        return v[0]
    pos = q * (len(v) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (pos - lo)


def next_weekdays(as_of, n):
    """The next n Mon-Fri dates after as_of (YYYY-MM-DD). Exchange holidays are not modelled: the desk scores by bar order, not by these dates."""
    d = dt.date.fromisoformat(as_of)
    out = []
    while len(out) < n:
        d += dt.timedelta(days=1)
        if d.weekday() < 5:
            out.append(d.isoformat())
    return out


def drop_unfinished_bar(bars, today_et, after_close):
    """bars = [{'date','open','high','low','close','volume'}]. A bar dated today (exchange time) before the close is still forming: never feed it to the model."""
    if bars and bars[-1]["date"] == today_et and not after_close:
        return bars[:-1]
    return bars


def build_forecast(ticker, as_of, last_close, paths, dates):
    """paths = one list per sample, each a list of {'open','high','low','close'} for the next days. Returns the per-ticker JSON record."""
    if not paths or any(len(p) != len(dates) for p in paths):
        raise ValueError("every sample needs one candle per forecast day")
    steps = []
    for i, date in enumerate(dates):
        col = lambda k: [p[i][k] for p in paths]
        steps.append({
            "n": i + 1, "date": date,
            "open": round(percentile(col("open"), 0.5), 4), "high": round(percentile(col("high"), 0.5), 4),
            "low": round(percentile(col("low"), 0.5), 4), "close": round(percentile(col("close"), 0.5), 4),
            "closeLow": round(percentile(col("close"), 0.1), 4), "closeHigh": round(percentile(col("close"), 0.9), 4),
        })
    finals = [p[-1]["close"] for p in paths]
    move = sum(abs(c / last_close - 1) for c in finals) / len(finals) * 100
    rng = (steps[-1]["closeHigh"] - steps[-1]["closeLow"]) / last_close * 100
    return {"ticker": ticker, "asOf": as_of, "lastClose": round(last_close, 4), "steps": steps,
            "moveAbsPct": round(move, 3), "rangePct": round(rng, 3)}


def merge_history(old, new_forecasts, keep=KEEP_DAYS):
    """old = the previous published file (or None). Returns the history list: every earlier forecast, minus any that the new run re-forecasts, newest `keep` dates per ticker."""
    fresh = {(f["ticker"], f["asOf"]) for f in new_forecasts}
    prev = (old or {}).get("history", []) + (old or {}).get("forecasts", [])
    seen, kept = set(), []
    for f in prev:
        k = (f["ticker"], f["asOf"])
        if k in fresh or k in seen:
            continue
        seen.add(k)
        kept.append(f)
    by_t = {}
    for f in kept:
        by_t.setdefault(f["ticker"], []).append(f)
    out = []
    for t, fs in by_t.items():
        out += sorted(fs, key=lambda f: f["asOf"])[-keep:]
    return sorted(out, key=lambda f: (f["asOf"], f["ticker"]))


def merge_closes(old_closes, ticker, bars, keep=KEEP_CLOSES):
    """Real closes only. Fresh Yahoo bars replace old ones for the same date; older dates are kept so past forecasts stay scoreable."""
    m = {d: c for d, c in (old_closes or {}).get(ticker, [])}
    for b in bars:
        m[b["date"]] = round(b["close"], 4)
    return [[d, m[d]] for d in sorted(m)][-keep:]


def pick_tickers(env_value, base, watchlist_lines, cap=8):
    """SPY and QQQ first, then the desk watchlist (agents/tickers.txt), de-duplicated and capped. env_value (workflow input) replaces the watchlist part."""
    extra = [t.strip().upper() for t in env_value.replace(",", " ").split()] if env_value.strip() else \
        [l.strip().upper() for l in watchlist_lines if l.strip() and not l.strip().startswith("#")]
    out = []
    for t in list(base) + extra:
        if t and t not in out:
            out.append(t)
    return out[:cap]
