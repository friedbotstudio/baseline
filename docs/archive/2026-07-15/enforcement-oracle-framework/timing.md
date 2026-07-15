# Phase timing — enforcement-oracle-framework

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 284321 | 0 | 129526 | 145 | 16554381 |
| scout | 312442 | 0 | 48529 | 56 | 12754828 |
| research | 277279 | 0 | 35716 | 42 | 10296503 |
| spec | 250249 | 0 | 41418 | 42 | 10839220 |
| spec-shippability-review | 0 | 0 | 0 | 0 | 0 |
| tdd | 1832134 | 0 | 212248 | 302 | 97728844 |
| └ tdd:scenario | 543526 | 0 | 93028 | 103 | 30887442 |
| └ tdd:implement | 878682 | 0 | 102902 | 143 | 47691801 |
| └ tdd:verify | 376752 | 0 | 12800 | 42 | 14333367 |
| └ tdd:drift-check | 33174 | 0 | 3518 | 14 | 4816234 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 112723 | 0 | 10467 | 40 | 13842992 |
| security | 254782 | 0 | 43438 | 46 | 16183839 |
| integrate | 175493 | 0 | 2510 | 14 | 5021517 |
| document | 95039 | 0 | 9475 | 26 | 9365106 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
