# Phase timing — sprint-pool-broker-transport

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 257249 | 0 | 115312 | 1181 | 8424035 |
| scout | 138773 | 0 | 35435 | 3402 | 5993671 |
| research | 118765 | 0 | 19531 | 59 | 2663518 |
| spec | 319684 | 0 | 47933 | 1844 | 7066810 |
| spec-shippability-review | 21893 | 0 | 2902 | 16 | 2413119 |
| tdd | 675353 | 0 | 142841 | 7533 | 32345544 |
| └ tdd:scenario | 282975 | 0 | 71133 | 1867 | 13722547 |
| └ tdd:implement | 334885 | 0 | 63070 | 3548 | 12726076 |
| └ tdd:verify | 33651 | 0 | 5145 | 2108 | 3923674 |
| └ tdd:drift-check | 23842 | 0 | 3493 | 10 | 1973247 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 93751 | 0 | 15988 | 46 | 9192010 |
| security | 197981 | 0 | 30956 | 1506 | 8227309 |
| integrate | 105217 | 0 | 4369 | 1490 | 5077255 |
| document | 120468 | 0 | 14344 | 157 | 8613032 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
