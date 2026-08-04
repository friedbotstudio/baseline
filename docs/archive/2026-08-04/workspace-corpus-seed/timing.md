# Phase timing — workspace-corpus-seed

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 496128 | 0 | 62501 | 114 | 37609690 |
| spec-shippability-review | 65188 | 0 | 4284 | 20 | 6952147 |
| tdd | 920996.7443847656 | 8812518.255615234 | 162154 | 444 | 167697747 |
| └ tdd:scenario | 920996.7443847656 | 0 | 162154 | 444 | 167697747 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 155519 | 0 | 9487 | 26 | 11098724 |
| security | 100672 | 0 | 7074 | 22 | 9453464 |
| integrate | 66702 | 0 | 3236 | 18 | 7782804 |
| document | 292646 | 0 | 26548 | 78 | 32358874 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
