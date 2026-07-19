# Phase timing — timing-instrument-repair

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 69029354 | 0 | 158789 | 318 | 50344574 |
| └ tdd:scenario | 2098793 | 0 | 112945 | 194 | 28565220 |
| └ tdd:implement | 66887985 | 0 | 43494 | 104 | 17779782 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 42576 | 0 | 2350 | 20 | 3999572 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 59798 | 0 | 4380 | 24 | 4844756 |
| security | 102627 | 0 | 9361 | 26 | 5347439 |
| integrate | 182540 | 0 | 10026 | 48 | 10165111 |
| document | 126494 | 0 | 16200 | 42 | 9130113 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
