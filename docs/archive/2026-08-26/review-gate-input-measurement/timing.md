# Phase timing — review-gate-input-measurement

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2763762 | 0 | 87304 | 286 | 26891525 |
| └ tdd:scenario | 2268033 | 0 | 60387 | 216 | 18471731 |
| └ tdd:implement | 192391 | 0 | 22923 | 52 | 6040431 |
| └ tdd:verify | 289209 | 0 | 3205 | 14 | 1844650 |
| └ tdd:drift-check | 14129 | 0 | 789 | 4 | 534713 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| └ tdd:attempt-2 | 435754 | 0 | 19805 | 58 | 8031818 |
| └ tdd:attempt-3 | 321462 | 0 | 11778 | 58 | 8692756 |
| security | 113730 | 0 | 11532 | 30 | 4068772 |
| integrate | 1007113 | 0 | 24733 | 114 | 17009390 |
| └ integrate:attempt-2 | 0 | 0 | -16460 | -86 | -13046344 |
| document | 201644 | 0 | 23445 | 68 | 11261178 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
