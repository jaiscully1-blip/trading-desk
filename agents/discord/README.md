# Discord bots: day cases, not trade calls

The four Claude routines (Jerry, Spike, Tom, Tyke) post bull / stagnant / bear **cases** for SPY, QQQ and IWM, weighted by
historical base rates, plus the special days coming up. They never post calls, puts, entries, stops, targets or a "trade of the day".

| Bot | When (ET) | Posts |
|---|---|---|
| Jerry | 8:40 weekdays | The day's three cases per index with the levels that would confirm each, special days, what could tip it |
| Spike | 9:15 weekdays | Fear & Greed, news consensus, flows, political trades, which case the news leans toward, mindset questions |
| Tom | hourly 10:07-3:07 | Only when a case is confirmed or ruled out, a big move, or a reversal |
| Tyke | 4:23 weekdays | Which case played out, the running track record, reviews of Jai's own trades, lessons |

Data: `published/daycases.json`, written by `.github/workflows/daycases.yml` (`scripts/daycases-build.ts`). Until that file is on
`main` and dated today, Jerry builds the cases from public data with levels only and no percentages.

To change a bot: edit its file here, then paste it into the routine in Claude, keeping the routine's own delivery step (the
webhook address is never stored in this repo).
