"""Run TradingAgents (github.com/TauricResearch/TradingAgents) on the tickers in agents/tickers.txt
and save one JSON per ticker in agents/out/ for the desk to read. Runs on free GitHub Actions + free Gemini."""
import datetime as dt
import json
import os
import sys
import traceback

from tradingagents.default_config import DEFAULT_CONFIG
from tradingagents.graph.trading_graph import TradingAgentsGraph

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

REPORT_KEYS = [
    ("market_report", "Technical analyst"),
    ("sentiment_report", "Sentiment analyst"),
    ("news_report", "News analyst"),
    ("fundamentals_report", "Fundamentals analyst"),
    ("investment_plan", "Research manager (bull vs bear)"),
    ("trader_investment_plan", "Trader"),
    ("final_trade_decision", "Portfolio manager"),
]


def tickers():
    arg = os.environ.get("TICKERS", "").strip()
    if arg:
        return [t.strip().upper() for t in arg.replace(",", " ").split() if t.strip()]
    with open(os.path.join(HERE, "tickers.txt")) as f:
        return [l.strip().upper() for l in f if l.strip() and not l.startswith("#")]


def text(v):
    if v is None:
        return ""
    if isinstance(v, str):
        return v
    if isinstance(v, dict):
        return "\n\n".join(f"{k}: {text(x)}" for k, x in v.items())
    return str(v)


def main():
    day = os.environ.get("RUN_DATE") or dt.date.today().isoformat()
    cfg = DEFAULT_CONFIG.copy()
    failed = 0
    for t in tickers():
        print(f"== {t} {day}", flush=True)
        rec = {"ticker": t, "date": day, "ranAt": dt.datetime.utcnow().isoformat() + "Z",
               "models": {"provider": cfg.get("llm_provider"), "deep": cfg.get("deep_think_llm"), "quick": cfg.get("quick_think_llm")}}
        try:
            ta = TradingAgentsGraph(debug=False, config=cfg)
            state, decision = ta.propagate(t, day)
            rec["decision"] = text(decision).strip()
            rec["reports"] = [{"id": k, "who": who, "text": text(state.get(k))} for k, who in REPORT_KEYS if state.get(k)]
        except Exception as e:  # keep going with the other tickers
            failed += 1
            rec["error"] = f"{type(e).__name__}: {e}"[:600]
            traceback.print_exc()
        with open(os.path.join(OUT, f"{t}.json"), "w") as f:
            json.dump(rec, f, indent=1)
    # index of what's there, newest first
    idx = []
    for name in sorted(os.listdir(OUT)):
        if name.endswith(".json") and name != "index.json":
            with open(os.path.join(OUT, name)) as f:
                r = json.load(f)
            idx.append({k: r.get(k) for k in ("ticker", "date", "ranAt", "decision", "error")})
    idx.sort(key=lambda r: r.get("ranAt") or "", reverse=True)
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(idx, f, indent=1)
    sys.exit(1 if failed and failed == len(tickers()) else 0)


if __name__ == "__main__":
    main()
