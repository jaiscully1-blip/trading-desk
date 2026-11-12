# Discord bots: day cases, not trade calls

The four Claude routines (Jerry, Spike, Tom, Tyke) post bull / stagnant / bear **cases** for SPY, QQQ and IWM, weighted by
historical base rates, plus the special days coming up. They never post calls, puts, entries, stops, targets or a "trade of the day".

| Bot | When (ET) | Posts |
|---|---|---|
| Jerry | 8:40 weekdays | The day's three cases per index with the levels that would confirm each, special days, what could tip it |
| Spike | 9:15 weekdays | Fear & Greed, news consensus, flows, political trades, a lean per index (SPY, QQQ, IWM) with the level that confirms it, mindset questions; saves the read to spike/<date> |
| Tom | hourly 10:07-3:07 | Only when a case is confirmed or ruled out, a big move, or a reversal |
| Tyke | 4:23 weekdays | Which case played out; scores Spike's read (win / loss / didn't trigger) and rebuilds Spike's memory (config/spikeMemory: record, splits by index, lean and context, evidence-based rules Spike reads next morning); reviews Jai's trades; lessons incl. what his calls and puts show plus options basics |

Data: `published/daycases.json`, written by `.github/workflows/daycases.yml` (`scripts/daycases-build.ts`). Until that file is on
`main` and dated today, Jerry builds the cases from public data with levels only and no percentages.

To change a bot: edit its file here, then paste it into the routine in Claude, keeping the routine's own delivery step (the
webhook address is never stored in this repo).

## Spike's memory (each day is a new scored sample)

Spike saves `spike/<date>` at 9:15 with its lean and trigger level per index. Tyke scores it after the close
(triggered = the confirming level traded; win = the leaned case played out; loss = another case did; didn't trigger = the
level never traded) and rebuilds `config/spikeMemory` from every scored day. Spike reads that memory the next morning and
weighs the patterns it shows (sample of 5 or more only). Both live in the journal artifact's database, so they persist
between runs. SPY, QQQ and IWM only; no picks.
