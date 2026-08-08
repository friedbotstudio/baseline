# Phase timing — dispatcher-sweep

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 836070 | 0 | 104581 | 188 | 14150033 |
| spec-shippability-review | 135614 | 0 | 12595 | 40 | 4369778 |
| tdd | 18958231 | 0 | -116515 | -216 | -20214797 |
| └ tdd:scenario | 919699 | 0 | 84085 | 158 | 20248334 |
| └ tdd:implement | 13651637 | 0 | -221042 | -456 | -44902156 |
| └ tdd:verify | 29072 | 0 | 4026 | 20 | 1088252 |
| └ tdd:drift-check | 4361633 | 0 | 16609 | 64 | 3476658 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 301694 | 0 | 14548 | 80 | 5663304 |
| security | 161648 | 0 | 18740 | 54 | 4533717 |
| integrate | 9102695 | 0 | -26940 | -103 | -7815612 |
| document | 116419 | 0 | 10293 | 43 | 3467967 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
