# Phase timing — durable-plan-slug-guard

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1277645 | 0 | 89479 | 252 | 47344401 |
| └ tdd:scenario | 833964 | 0 | 74370 | 179 | 34031111 |
| └ tdd:implement | 443681 | 0 | 15109 | 73 | 13313290 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 101727 | 0 | 9279 | 42 | 8892560 |
| security | 200283 | 0 | 31115 | 46 | 9677479 |
| integrate | 307322 | 0 | 2362 | 16 | 3975824 |
| document | 111068 | 0 | 13271 | 30 | 7022927 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
