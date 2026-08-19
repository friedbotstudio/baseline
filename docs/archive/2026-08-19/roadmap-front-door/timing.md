# Phase timing — roadmap-front-door

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 593074 | 0 | 60622 | 170 | 13326227 |
| spec-shippability-review | 104860 | 0 | 11455 | 52 | 5331332 |
| tdd | 3252221 | 0 | 144584 | 360 | 57839639 |
| └ tdd:scenario | 3044552 | 0 | 140941 | 346 | 55223479 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 207669 | 0 | 3643 | 14 | 2616160 |
| simplify | 59030 | 0 | 8056 | 26 | 4931796 |
| security | 81323 | 0 | 8543 | 30 | 5794684 |
| integrate | 713501 | 0 | 13588 | 50 | 9965398 |
| document | 432798 | 0 | 21272 | 74 | 15518203 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
