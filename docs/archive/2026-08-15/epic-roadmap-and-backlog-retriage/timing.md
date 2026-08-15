# Phase timing — epic-roadmap-and-backlog-retriage

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 609234 | 0 | 69142 | 116 | 7686259 |
| spec-shippability-review | 19848 | 0 | 3789 | 14 | 1273041 |
| tdd | 18315.1787109375 | 2980808.8212890625 | 138932 | 262 | 74013960 |
| └ tdd:scenario | 0 | 0 | 67093 | 62 | 6894897 |
| └ tdd:implement | 1121598 | 0 | 69449 | 186 | 62201367 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 1151117 | 0 | 2390 | 14 | 4917696 |
| simplify | 240027 | 0 | 16467 | 38 | 13509081 |
| security | 195217 | 0 | 30053 | 32 | 11603675 |
| integrate | 2550251 | 0 | 27645 | 80 | 35812998 |
| document | 926119 | 0 | 64133 | 138 | 66663489 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
