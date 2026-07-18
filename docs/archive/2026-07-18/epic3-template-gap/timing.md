# Phase timing — epic3-template-gap

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 31564548348 | 0 | n/a | n/a | n/a |
| └ tdd:scenario | 31564118356 | 0 | n/a | n/a | n/a |
| └ tdd:implement | 414279 | 0 | 26620 | 106 | 11977733 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 15713 | 0 | 1733 | 10 | 1174531 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 97009 | 0 | 5731 | 32 | 3797001 |
| security | 59413 | 0 | 6558 | 22 | 2671050 |
| integrate | 3100566 | 0 | 235657 | 302 | 46537751 |
| document | 148945 | 0 | 15791 | 42 | 8158032 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
