# Phase timing — work-planner-envelope

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 82626 | 0 | 2541 | 14 | 1922031 |
| scout | 143548 | 0 | 17695 | 40 | 6111270 |
| research | 212484 | 0 | 19595 | 42 | 6489940 |
| spec | 187738 | 0 | 21968 | 36 | 6241080 |
| spec-shippability-review | 13263 | 0 | 931 | 8 | 1442731 |
| tdd | 2430777 | 0 | 100583 | 198 | 39756163 |
| └ tdd:scenario | 2430777 | 0 | 100583 | 198 | 39756163 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| └ tdd:attempt-2 | 1478056 | 0 | 35772 | 68 | 15712230 |
| simplify | 1377303 | 0 | 21002 | 46 | 10550186 |
| security | 154297 | 0 | 19776 | 36 | 8502071 |
| integrate | 179645 | 0 | 8521 | 40 | 9780032 |
| document | 211625 | 0 | 25970 | 84 | 21452059 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
