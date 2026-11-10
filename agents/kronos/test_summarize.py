import unittest
from summarize import build_forecast, drop_unfinished_bar, merge_closes, merge_history, next_weekdays, percentile, pick_tickers


def path(c0):  # one flat sample path of 5 candles
    return [{"open": c0 + i, "high": c0 + i + 1, "low": c0 + i - 1, "close": c0 + i} for i in range(5)]


class Pure(unittest.TestCase):
    def test_percentile(self):
        self.assertEqual(percentile([1, 2, 3, 4, 5], 0.5), 3)
        self.assertAlmostEqual(percentile([0, 10], 0.1), 1.0)
        self.assertEqual(percentile([7], 0.9), 7)

    def test_weekdays_skip_weekend(self):
        self.assertEqual(next_weekdays("2026-11-06", 3), ["2026-11-09", "2026-11-10", "2026-11-11"])  # 2026-11-06 is a Friday

    def test_forecast_record(self):
        paths = [path(100), path(102), path(104)]
        f = build_forecast("SPY", "2026-11-06", 100.0, paths, next_weekdays("2026-11-06", 5))
        self.assertEqual(len(f["steps"]), 5)
        self.assertEqual(f["steps"][4]["close"], 106)       # median of 104, 106, 108
        self.assertLess(f["steps"][4]["closeLow"], f["steps"][4]["closeHigh"])
        self.assertAlmostEqual(f["moveAbsPct"], 6.0)        # mean |close5/100-1| over 104, 106, 108 = 6%
        with self.assertRaises(ValueError):
            build_forecast("SPY", "2026-11-06", 100.0, [path(100)[:3]], ["a", "b", "c", "d", "e"])

    def test_unfinished_bar_dropped_only_before_close(self):
        bars = [{"date": "2026-11-05"}, {"date": "2026-11-06"}]
        self.assertEqual(len(drop_unfinished_bar(bars, "2026-11-06", False)), 1)
        self.assertEqual(len(drop_unfinished_bar(bars, "2026-11-06", True)), 2)
        self.assertEqual(len(drop_unfinished_bar(bars, "2026-11-09", False)), 2)

    def test_history_keeps_old_and_replaces_rerun(self):
        a = {"ticker": "SPY", "asOf": "2026-11-05", "steps": []}
        b = {"ticker": "SPY", "asOf": "2026-11-06", "steps": [1]}
        old = {"history": [a], "forecasts": [b]}
        new = [{"ticker": "SPY", "asOf": "2026-11-06", "steps": [2]}, {"ticker": "SPY", "asOf": "2026-11-09", "steps": []}]
        h = merge_history(old, new)
        self.assertEqual([x["asOf"] for x in h], ["2026-11-05"])   # the re-run of 11-06 lives in `forecasts`, not twice
        self.assertEqual(merge_history(None, new), [])
        many = {"history": [{"ticker": "SPY", "asOf": f"2026-01-{d:02d}"} for d in range(1, 29)], "forecasts": []}
        self.assertEqual(len(merge_history(many, [], keep=10)), 10)

    def test_closes_merge(self):
        old = {"SPY": [["2026-11-04", 1.0], ["2026-11-05", 2.0]]}
        m = merge_closes(old, "SPY", [{"date": "2026-11-05", "close": 2.5}, {"date": "2026-11-06", "close": 3.0}])
        self.assertEqual(m, [["2026-11-04", 1.0], ["2026-11-05", 2.5], ["2026-11-06", 3.0]])

    def test_tickers(self):
        self.assertEqual(pick_tickers("", ["SPY", "QQQ"], ["# c", "NVDA", "spy"]), ["SPY", "QQQ", "NVDA"])
        self.assertEqual(pick_tickers("aapl, msft", ["SPY", "QQQ"], ["NVDA"]), ["SPY", "QQQ", "AAPL", "MSFT"])
        self.assertEqual(len(pick_tickers("", ["SPY"], [f"T{i}" for i in range(20)])), 8)


if __name__ == "__main__":
    unittest.main()
