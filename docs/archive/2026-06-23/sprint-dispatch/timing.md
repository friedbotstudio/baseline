# Phase timing — sprint-dispatch

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2202277 | 0 | 223523 | 19240 | 170188960 |
| └ tdd:scenario | 383274 | 0 | 88759 | 9662 | 50489424 |
| └ tdd:implement | 1819003 | 0 | 134764 | 9578 | 119699536 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 93349 | 0 | 6582 | 28 | 12865954 |
| security | 156674 | 0 | 19519 | 32 | 14814483 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
