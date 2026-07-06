# Phase timing — site-epic-currency

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1300755 | 0 | 159139 | 5946 | 108899823 |
| └ tdd:scenario | 354721 | 0 | 70567 | 923 | 36307439 |
| └ tdd:implement | 154836 | 0 | 20083 | 572 | 12476509 |
| └ tdd:design-ui | 792736 | 0 | 71789 | 4461 | 63176005 |
| └ tdd:design-ui | 0 | 0 | 0 | 0 | 0 |
| └ tdd:design-ui | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 1993210 | 0 | 8122 | 946 | 10433267 |
| security | 47846 | 0 | 9467 | 18 | 5570085 |
| integrate | 204821 | 0 | 5492 | 24 | 7481036 |
| document | 19848 | 0 | 6582 | 12 | 3765234 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
