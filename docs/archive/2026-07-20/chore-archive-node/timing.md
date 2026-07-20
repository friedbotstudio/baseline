# Phase timing — chore-archive-node

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 85256436 | 0 | 65421 | 204 | 53222418 |
| └ tdd:scenario | 267850 | 0 | 39993 | 108 | 28931595 |
| └ tdd:implement | 84988586 | 0 | 25428 | 96 | 24290823 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 36997 | 0 | 3128 | 16 | 4684692 |
| security | 41376 | 0 | 2036 | 12 | 3522108 |
| integrate | 169986 | 0 | 1510 | 14 | 4124927 |
| document | 32646 | 0 | 2533 | 12 | 3543537 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
