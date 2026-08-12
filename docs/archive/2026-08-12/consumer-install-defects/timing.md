# Phase timing — consumer-install-defects

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 810900 | 0 | 108088 | 226 | 15540288 |
| spec-shippability-review | 113312 | 0 | 11873 | 34 | 3362208 |
| tdd | 1585287.2673339844 | 5075250.732666016 | 477490 | 1157 | 234152486 |
| └ tdd:scenario | 0 | 0 | 230920 | 478 | 70192531 |
| └ tdd:implement | 1620980 | 0 | 173993 | 441 | 99833890 |
| └ tdd:scenario-correction | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 467182 | 0 | 33167 | 100 | 25683556 |
| └ tdd:drift-check | 660072 | 0 | 39658 | 140 | 39017950 |
| └ tdd:scenario-d9-coverage | 0 | 0 | 0 | 0 | 0 |
| └ tdd:reverify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 262735 | 0 | 14228 | 70 | 20510048 |
| security | 196041 | 0 | 32198 | 50 | 15092093 |
| integrate | 1259131 | 0 | 32304 | 110 | 34701104 |
| document | 351170 | 0 | 37983 | 102 | 33735817 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
