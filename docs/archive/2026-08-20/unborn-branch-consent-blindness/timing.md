# Phase timing — unborn-branch-consent-blindness

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 424573 | 0 | 49316 | 110 | 7256541 |
| spec-shippability-review | 29960 | 0 | 2321 | 20 | 1678482 |
| tdd | 3589232 | 0 | 45112 | 170 | 32050606 |
| └ tdd:scenario | 1068608 | 0 | 22227 | 50 | 5851010 |
| └ tdd:implement | 2520624 | 0 | 22885 | 120 | 26199596 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 303734 | 0 | 5442 | 26 | 6143163 |
| security | 1295699 | 0 | 10744 | 18 | 4323945 |
| integrate | 283261 | 0 | 3334 | 20 | 4897781 |
| document | 1217957 | 0 | 4379 | 28 | 6168458 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
