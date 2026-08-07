# Phase timing — ship-baseline-output-style

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 414502 | 0 | 60067 | 294 | 9680442 |
| spec-shippability-review | 51931 | 0 | 5426 | 24 | 2373047 |
| tdd | 1293908 | 0 | 108600 | 343 | 37477307 |
| └ tdd:scenario | 491815 | 0 | 60389 | 163 | 13130679 |
| └ tdd:implement | 510838 | 0 | 29043 | 88 | 11215428 |
| └ tdd:verify | 43495 | 0 | 3452 | 20 | 2793602 |
| └ tdd:drift-check | 212246 | 0 | 13035 | 56 | 8000296 |
| └ tdd:finalize | 40636 | 0 | 2870 | 18 | 2630086 |
| simplify | 109007 | 0 | 8176 | 32 | 4734141 |
| security | 95324 | 0 | 6208 | 26 | 3958447 |
| integrate | 159640 | 0 | 8561 | 32 | 5016099 |
| document | 281982 | 0 | 39350 | 92 | 15293082 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
