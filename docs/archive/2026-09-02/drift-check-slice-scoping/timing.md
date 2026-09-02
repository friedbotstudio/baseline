# Phase timing — drift-check-slice-scoping

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 3543790 | 0 | n/a | n/a | n/a |
| └ tdd:scenario | 2623822 | 0 | n/a | n/a | n/a |
| └ tdd:implement | 593618 | 0 | 26225 | 98 | 9485914 |
| └ tdd:verify | 315494 | 0 | 14212 | 68 | 7546085 |
| └ tdd:drift-check | 10856 | 0 | 1511 | 8 | 925762 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| └ tdd:attempt-2 | 677200 | 0 | 33542 | 90 | 11068450 |
| security | 173586 | 0 | 17538 | 44 | 5220957 |
| integrate | 907890 | 0 | 37255 | 132 | 17694369 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
