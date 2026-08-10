# Phase timing — warm-context-diet

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 713422 | 0 | 70771 | 176 | 15520411 |
| spec-shippability-review | 109081 | 0 | 9527 | 30 | 3365120 |
| tdd | 28005365 | 0 | 301404 | 962 | 185053104 |
| └ tdd:scenario | 1189789 | 0 | 76613 | 162 | 20911711 |
| └ tdd:implement | 25861809 | 0 | 178336 | 610 | 116649976 |
| └ tdd:verify | 875843 | 0 | 41322 | 166 | 41211651 |
| └ tdd:drift-check | 49719 | 0 | 2685 | 14 | 3658659 |
| └ tdd:finalize | 28205 | 0 | 2448 | 10 | 2621107 |
| simplify | 157821 | 0 | 13860 | 40 | 10591752 |
| security | 332198 | 0 | 38110 | 76 | 20818377 |
| integrate | 1203572 | 0 | 51031 | 180 | 51824205 |
| document | 1411148 | 0 | 73164 | 198 | 60884391 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
