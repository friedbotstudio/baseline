# Phase timing — notifier-on-stop

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 3434715 | 0 | 141233 | 7553 | 23918028 |
| └ tdd:scenario | 2964948 | 0 | 119837 | 5741 | 10978751 |
| └ tdd:implement | 412641 | 0 | 16349 | 1774 | 8651998 |
| └ tdd:verify | 47992 | 0 | 4223 | 30 | 3378473 |
| └ tdd:finalize | 9134 | 0 | 824 | 8 | 908806 |
| simplify | 62908 | 0 | 7567 | 34 | 3914583 |
| security | 85238 | 0 | 12462 | 28 | 3308705 |
| integrate | 321688 | 0 | 6362 | 1472 | 4418300 |
| document | 132492 | 0 | 15734 | 538 | 6632380 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
