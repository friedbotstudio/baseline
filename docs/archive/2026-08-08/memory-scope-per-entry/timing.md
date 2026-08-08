# Phase timing — memory-scope-per-entry

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 615789 | 0 | 75903 | 144 | 9374292 |
| spec-shippability-review | 92558 | 0 | 7391 | 34 | 3085778 |
| tdd | 3190906 | 0 | 215767 | 462 | 71379726 |
| └ tdd:scenario | 683273 | 0 | 79876 | 168 | 20917065 |
| └ tdd:implement | 2436664 | 0 | 128910 | 260 | 44752957 |
| └ tdd:verify | 36336 | 0 | 5074 | 20 | 2882924 |
| └ tdd:drift-check | 34633 | 0 | 1907 | 14 | 2826780 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 180327 | 0 | 12190 | 52 | 10717548 |
| security | 191053 | 0 | 21117 | 46 | 9796278 |
| integrate | 248222 | 0 | 6502 | 34 | 7493299 |
| document | 293560 | 0 | 37775 | 102 | 23680431 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
