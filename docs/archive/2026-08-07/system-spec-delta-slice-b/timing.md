# Phase timing — system-spec-delta-slice-b

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1635340 | 0 | 179422 | 400 | 38557521 |
| └ tdd:scenario | 636720 | 0 | 100804 | 216 | 16100022 |
| └ tdd:implement | 912668 | 0 | 63061 | 142 | 16773807 |
| └ tdd:verify | 33602 | 0 | 6637 | 20 | 2683767 |
| └ tdd:drift-check | 44967 | 0 | 1566 | 10 | 1360183 |
| └ tdd:finalize | 7383 | 0 | 7354 | 12 | 1639742 |
| simplify | 131176 | 0 | 10482 | 38 | 5327372 |
| security | 156582 | 0 | 23623 | 28 | 4083879 |
| integrate | 1842821 | 0 | 31441 | 96 | 14878953 |
| document | 269607 | 0 | 29203 | 70 | 11766655 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
