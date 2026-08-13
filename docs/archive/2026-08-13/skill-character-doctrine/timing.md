# Phase timing — skill-character-doctrine

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 632777 | 0 | 66204 | 154 | 8210021 |
| scout | 219596 | 0 | 33136 | 84 | 7893509 |
| research | 575065 | 0 | 59750 | 94 | 10140683 |
| spec | 475658 | 0 | 76410 | 104 | 15007829 |
| spec-shippability-review | 39689 | 0 | 3215 | 18 | 2839441 |
| tdd | 2308721 | 0 | 140294 | 366 | 70118026 |
| └ tdd:scenario | 656460 | 0 | 64778 | 140 | 22983685 |
| └ tdd:implement | 363286 | 0 | 42076 | 122 | 25150920 |
| └ tdd:verify | 1007001 | 0 | 8799 | 46 | 10061074 |
| └ tdd:drift-check | 145395 | 0 | 18524 | 36 | 8102589 |
| └ tdd:finalize | 136579 | 0 | 6117 | 22 | 3819758 |
| simplify | 118564 | 0 | 7691 | 50 | 11883564 |
| security | 600085 | 0 | 53096 | 128 | 30869255 |
| integrate | 617178 | 0 | 49178 | 124 | 33849698 |
| document | 502945 | 0 | 65460 | 162 | 49044307 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
