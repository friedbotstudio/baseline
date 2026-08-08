# Phase timing — skill-helper-cli-dispatchers

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 1475662 | 0 | 98387 | 182 | 15275699 |
| spec-shippability-review | 55201 | 0 | 2107 | 20 | 2265765 |
| tdd | 152988.00122070312 | 4419625.998779297 | 361462 | 714 | 146561025 |
| └ tdd:scenario | 0 | 0 | 116504 | 184 | 27118886 |
| └ tdd:implement | 3513618 | 0 | 231794 | 462 | 101212820 |
| └ tdd:verify | 159601 | 0 | 7862 | 46 | 12289007 |
| └ tdd:drift-check | 63024 | 0 | 5302 | 22 | 5940312 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 461044 | 0 | 29909 | 56 | 15430484 |
| security | 368373 | 0 | 23380 | 64 | 18336881 |
| integrate | 315469 | 0 | 7243 | 30 | 8835784 |
| document | 283999 | 0 | 34639 | 72 | 21848479 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
