# Phase timing — diagram-shard-rewrite-loses-fields

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 657572 | 0 | 86525 | 202 | 82089451 |
| spec-shippability-review | 27679 | 0 | 2273 | 10 | 4236803 |
| tdd | 0 | 45343745.59472656 | 233561 | 12654 | 142823488 |
| └ tdd:scenario | 0 | 0 | 143781 | 12318 | 105299483 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 7596034 | 0 | 89577 | 334 | 37233055 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 643092 | 0 | 18888 | 62 | 9073185 |
| security | 283371 | 0 | 27175 | 42 | 7095045 |
| integrate | 31774104 | 0 | 41244 | 164 | 30416512 |
| document | 831202 | 0 | 39594 | 104 | 22544268 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
