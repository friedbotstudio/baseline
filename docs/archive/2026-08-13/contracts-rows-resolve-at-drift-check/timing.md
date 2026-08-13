# Phase timing — contracts-rows-resolve-at-drift-check

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 751982 | 0 | 98347 | 147 | 47207067 |
| spec-shippability-review | 229876 | 0 | 16435 | 50 | 17139605 |
| tdd | 1171727.638671875 | 1099027.361328125 | 108459 | 262 | 93883929 |
| └ tdd:scenario | 0 | 0 | 44223 | 68 | 23559303 |
| └ tdd:implement | 322910 | 0 | 27738 | 58 | 21380093 |
| └ tdd:verify | 1114367 | 0 | 34045 | 118 | 41946000 |
| └ tdd:drift-check | 400859 | 0 | 2453 | 18 | 6998533 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 396113 | 0 | 9970 | 40 | 15693292 |
| security | 571119 | 0 | 28242 | 64 | 24986444 |
| integrate | 1139291 | 0 | 6770 | 32 | 10736038 |
| document | 124231 | 0 | 7389 | 26 | 10730696 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
