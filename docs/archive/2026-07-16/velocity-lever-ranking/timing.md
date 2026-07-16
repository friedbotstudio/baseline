# Phase timing — velocity-lever-ranking

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 461333 | 0 | 114785 | 124 | 29214450 |
| approve-direction | 169104 | 0 | 6538 | 30 | 10677765 |
| scout | 135379 | 0 | 19211 | 32 | 10775260 |
| research | 127783 | 0 | 18772 | 22 | 7505156 |
| spec | 391869 | 0 | 60820 | 48 | 16670326 |
| spec-shippability-review | 63127 | 0 | 7273 | 18 | 6456394 |
| tdd | 589226 | 0 | 81345 | 172 | 63800961 |
| └ tdd:scenario | 181681 | 0 | 39297 | 60 | 21835687 |
| └ tdd:implement | 273668 | 0 | 29761 | 84 | 31377979 |
| └ tdd:verify | 82907 | 0 | 10392 | 18 | 6800769 |
| └ tdd:drift-check | 50970 | 0 | 1895 | 10 | 3786526 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 51577 | 0 | 9468 | 26 | 9871574 |
| security | 72668 | 0 | 11430 | 24 | 9149658 |
| integrate | 92767 | 0 | 5562 | 22 | 8428239 |
| document | 50559 | 0 | 2596 | 12 | 4611402 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
