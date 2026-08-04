# Phase timing — living-system-model-ef

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 572436 | 0 | 78594 | 125 | 11245575 |
| spec-shippability-review | 62259 | 0 | 7348 | 32 | 3600164 |
| tdd | 2181759 | 0 | 169016 | 430 | 72141036 |
| └ tdd:scenario | 770625 | 0 | 76448 | 172 | 24439762 |
| └ tdd:implement | 901110 | 0 | 49390 | 124 | 21215695 |
| └ tdd:verify | 322714 | 0 | 20089 | 72 | 13945228 |
| └ tdd:drift-check | 187310 | 0 | 23089 | 62 | 12540351 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 636999 | 0 | 22499 | 58 | 11089814 |
| security | 1308933 | 0 | 81102 | 138 | 30034523 |
| integrate | 162779 | 0 | 13236 | 52 | 12578380 |
| document | 483358 | 0 | 56673 | 150 | 38701827 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
