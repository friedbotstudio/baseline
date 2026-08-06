# Phase timing — central-system-spec

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 1034816 | 0 | 151156 | 132 | 11266108 |
| spec-shippability-review | 99272 | 0 | 17528 | 40 | 5342658 |
| tdd | 10676250 | 0 | 735763 | 1462 | 396797251 |
| └ tdd:scenario | 723205 | 0 | 177234 | 192 | 27365991 |
| └ tdd:implement | 1373600 | 0 | 107413 | 230 | 48825248 |
| └ tdd:drift-check | 8565439 | 0 | 448452 | 1032 | 317398676 |
| └ tdd:finalize | 14006 | 0 | 2664 | 8 | 3207336 |
| simplify | 432715 | 0 | 23898 | 82 | 33606587 |
| security | 2240773 | 0 | 39455 | 60 | 22745407 |
| integrate | 389927 | 0 | 19101 | 46 | 19730859 |
| document | 1801652 | 0 | 78987 | 178 | 77682323 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
