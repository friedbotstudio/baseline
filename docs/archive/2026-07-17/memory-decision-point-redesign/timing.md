# Phase timing — memory-decision-point-redesign

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 474619 | 0 | 43306 | 49 | 3528674 |
| approve-direction | 59315 | 0 | 6830 | 22 | 1825593 |
| scout | 270447 | 0 | 25087 | 45 | 4120642 |
| research | 152361 | 0 | 23987 | 30 | 2889001 |
| spec | 357156 | 0 | 60576 | 50 | 5318922 |
| spec-shippability-review | 56160 | 0 | 4715 | 22 | 2629252 |
| tdd | 23277125 | 0 | 152970 | 203 | 28419634 |
| └ tdd:scenario | 460347 | 0 | 81119 | 103 | 13783593 |
| └ tdd:implement | 22598115 | 0 | 52881 | 48 | 6369229 |
| └ tdd:verify | 164060 | 0 | 15053 | 34 | 5379945 |
| └ tdd:drift-check | 54603 | 0 | 3917 | 18 | 2886867 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 119525 | 0 | 24028 | 48 | 7838681 |
| security | 108774 | 0 | 13828 | 28 | 4713688 |
| integrate | 109472 | 0 | 6413 | 30 | 5172964 |
| document | 137431 | 0 | 21793 | 34 | 5997334 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
