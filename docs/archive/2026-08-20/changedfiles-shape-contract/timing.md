# Phase timing — changedfiles-shape-contract

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 394152 | 0 | 40885 | 94 | 6356060 |
| spec-shippability-review | 59342 | 0 | 4304 | 28 | 2404074 |
| tdd | 0 | 7442907.291259766 | 51628 | 134 | 28611892 |
| └ tdd:scenario | 0 | 0 | 29829 | 58 | 6005766 |
| └ tdd:implement | 1511795 | 0 | 20408 | 68 | 20006357 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 20361 | 0 | 1391 | 8 | 2599769 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 60769 | 0 | 7034 | 30 | 9808853 |
| security | 458155 | 0 | 15563 | 30 | 9938888 |
| integrate | 5238899 | 0 | 124042 | 310 | 22622673 |
| document | 55639 | 0 | 5461 | 30 | 3033181 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
