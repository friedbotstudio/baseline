# Phase timing — epic-child-pin-and-delta-backticks

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 795307 | 0 | 61750 | 142 | 32731801 |
| └ tdd:scenario | 795307 | 0 | 61750 | 142 | 32731801 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 204629 | 0 | 6578 | 32 | 7930428 |
| security | 262812 | 0 | 21508 | 50 | 12666897 |
| integrate | 282267 | 0 | 3360 | 20 | 5163107 |
| document | 64333 | 0 | 5243 | 28 | 7324294 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
