"""Kronos forecast experiment: run the open-source Kronos candlestick model (github.com/shiyu-coder/Kronos, MIT) on a few tickers
and write published/kronos.json for the desk's "Kronos forecast (experiment)" widget.

MODEL FORECAST, not data, not advice. Free: Yahoo's public chart endpoint (no key), Hugging Face public weights, CPU only.
Real bars only: if a ticker's data can't be fetched it is listed under "errors", never filled in.

Env: KRONOS_DIR (clone of the Kronos repo, required), TICKERS (override the watchlist part), SAMPLES (default 12),
     KRONOS_REV (the Kronos commit, recorded in the file), OUT (default published/kronos.json)."""
import datetime as dt
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from summarize import HORIZON, build_forecast, drop_unfinished_bar, merge_closes, merge_history, next_weekdays, pick_tickers  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.environ.get("OUT") or os.path.join(ROOT, "published", "kronos.json")
LABEL = "MODEL FORECAST, not data, not advice"
# Kronos-mini: 4.1M parameters, 2048-token context, MIT. Hugging Face revisions pinned so a silent upstream change
# can't alter the experiment (revisions read from the Hugging Face API on 2026-11-10).
CFG = dict(name="NeoQuasar/Kronos-mini", rev="f4e68697d9d5aed55cef5c96aabc3376bcad9f81",
           tok="NeoQuasar/Kronos-Tokenizer-2k", tok_rev="26966d0035065a0cae0ebad7af8ece35bc1fb51c", ctx=2048)
LOOKBACK = 250  # about a year of daily bars
UA = {"user-agent": "Mozilla/5.0 (trading-desk; personal use)"}


def yahoo_daily(sym):
    """About a year of daily bars from Yahoo's public chart endpoint, exchange-local dates. Same source as api/_lib/yahoo.ts."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym.replace('.', '-'))}?range=2y&interval=1d"
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                j = json.load(r)
            res = j["chart"]["result"][0]
            q = res["indicators"]["quote"][0]
            off = int(res.get("meta", {}).get("gmtoffset", 0))
            bars = []
            for i, t in enumerate(res.get("timestamp") or []):
                o, h, l, c = (q[k][i] for k in ("open", "high", "low", "close"))
                if None in (o, h, l, c):
                    continue
                bars.append({"date": dt.datetime.fromtimestamp(t + off, dt.timezone.utc).date().isoformat(),
                             "open": o, "high": h, "low": l, "close": c, "volume": q["volume"][i] or 0})
            return bars
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"Yahoo fetch failed: {type(last).__name__}: {last}"[:300])


def main():
    kdir = os.environ.get("KRONOS_DIR")
    if not kdir or not os.path.isdir(os.path.join(kdir, "model")):
        sys.exit("KRONOS_DIR must point at a clone of github.com/shiyu-coder/Kronos")
    sys.path.insert(0, kdir)
    import pandas as pd
    import torch
    from model import Kronos, KronosPredictor, KronosTokenizer  # noqa: E402

    samples = int(os.environ.get("SAMPLES", "12"))
    with open(os.path.join(HERE, "..", "tickers.txt")) as f:
        watch = f.readlines()
    tickers = pick_tickers(os.environ.get("TICKERS", ""), ["SPY", "QQQ"], watch)
    print("tickers:", tickers, flush=True)

    tok = KronosTokenizer.from_pretrained(CFG["tok"], revision=CFG["tok_rev"])
    mdl = Kronos.from_pretrained(CFG["name"], revision=CFG["rev"])
    pred = KronosPredictor(mdl, tok, device="cpu", max_context=CFG["ctx"])

    now_et = dt.datetime.now(ZoneInfo("America/New_York"))
    after_close = now_et.hour * 60 + now_et.minute >= 16 * 60 + 10
    old = None
    if os.path.exists(OUT):
        try:
            with open(OUT) as f:
                old = json.load(f)
        except Exception:  # noqa: BLE001
            old = None

    forecasts, errors, closes = [], {}, dict((old or {}).get("closes", {}))
    for t in tickers:
        try:
            bars = drop_unfinished_bar(yahoo_daily(t), now_et.date().isoformat(), after_close)
            if len(bars) < 60:
                raise RuntimeError(f"only {len(bars)} daily bars")
            closes[t] = merge_closes(closes, t, bars)
            ctx = bars[-LOOKBACK:]
            df = pd.DataFrame(ctx)
            x_ts = pd.Series(pd.to_datetime(df["date"]))
            dates = next_weekdays(ctx[-1]["date"], HORIZON)
            y_ts = pd.Series(pd.to_datetime(dates))
            torch.manual_seed(int(ctx[-1]["date"].replace("-", "")))  # same bars, same forecast
            x = df[["open", "high", "low", "close", "volume"]]
            # predict_batch averages the samples *inside* each series, so to keep the spread we send the same series
            # `samples` times with sample_count=1 and get independent sampled paths back.
            outs = pred.predict_batch(df_list=[x] * samples, x_timestamp_list=[x_ts] * samples, y_timestamp_list=[y_ts] * samples,
                                      pred_len=HORIZON, T=1.0, top_p=0.9, sample_count=1, verbose=False)
            paths = [[{k: float(r[k]) for k in ("open", "high", "low", "close")} for _, r in o.iterrows()] for o in outs]
            rec = build_forecast(t, ctx[-1]["date"], ctx[-1]["close"], paths, dates)
            forecasts.append(rec)
            s = rec["steps"][-1]
            print(f"{t}: {rec['asOf']} close {rec['lastClose']} -> day{HORIZON} median {s['close']} ({s['closeLow']}..{s['closeHigh']}), move ~{rec['moveAbsPct']}%", flush=True)
        except Exception as e:  # noqa: BLE001  keep going with the other tickers
            errors[t] = f"{type(e).__name__}: {e}"[:300]
            print(f"{t}: FAILED {errors[t]}", flush=True)

    if not forecasts:
        sys.exit("no ticker produced a forecast; not writing a file")
    code_rev = os.environ.get("KRONOS_REV", "")
    out = {
        "schema": 1, "label": LABEL,
        "model": {"name": CFG["name"], "tokenizer": CFG["tok"], "revision": CFG["rev"], "code": f"shiyu-coder/Kronos@{code_rev}" if code_rev else "shiyu-coder/Kronos"},
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "horizon": HORIZON, "samples": samples, "lookback": LOOKBACK, "source": "Yahoo Finance daily bars",
        "forecasts": forecasts, "history": merge_history(old, forecasts), "closes": closes,
    }
    if errors:
        out["errors"] = errors
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
