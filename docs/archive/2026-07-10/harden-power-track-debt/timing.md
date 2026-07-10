# Phase timing — harden-power-track-debt

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 865882 | 0 | 61429 | 1318 | 45746016 |
| spec-shippability-review | 44833 | 0 | 1955 | 5262 | 4817513 |
| tdd | 61900.693359375 | 4392336.306640625 | 171940 | 14505 | 168854186 |
| └ tdd:scenario | 0 | 0 | 100874 | 8588 | 90843989 |
| └ tdd:implement | 194828 | 0 | 12820 | 1632 | 21390957 |
| └ tdd:verify | 41820 | 0 | 3702 | 612 | 8085866 |
| └ tdd:drift-check | 3126422 | 0 | 54544 | 3673 | 48533374 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 77372 | 0 | 4646 | 24 | 11166544 |
| security | 162935 | 0 | 22915 | 30 | 14042703 |
| integrate | 326741 | 0 | 6109 | 1208 | 11362713 |
| document | 90677 | 0 | 7589 | 20 | 9506970 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
