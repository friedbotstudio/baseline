# Phase timing — epic6-t11-landmark-scope-rehome

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 803037 | 0 | 112655 | 190 | 10725939 |
| spec-shippability-review | 97554 | 0 | 6673 | 38 | 3504140 |
| tdd | 0 | 1960488.8371582031 | 66625 | 206 | 38913111 |
| └ tdd:scenario | 0 | 0 | 37113 | 78 | 8854191 |
| └ tdd:implement | 708096 | 0 | 26501 | 110 | 25575723 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 36479 | 0 | 3011 | 18 | 4483197 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 76626 | 0 | 5249 | 30 | 7528859 |
| security | 259842 | 0 | 14223 | 40 | 10230300 |
| integrate | 1609646 | 0 | 72613 | 200 | 70923565 |
| document | 387815 | 0 | 24539 | 80 | 37600461 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
