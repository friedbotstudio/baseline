# Phase timing — s3-stale-lock-ttl-recovery

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 31539304570 | 0 | n/a | n/a | n/a |
| └ tdd:scenario | 31539162392 | 0 | n/a | n/a | n/a |
| └ tdd:implement | 72116 | 0 | 10836 | 16 | 1305384 |
| └ tdd:verify | 54495 | 0 | 8496 | 24 | 2037642 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 15567 | 0 | 4104 | 18 | 1567396 |
| security | 105443 | 0 | 13950 | 26 | 2304071 |
| integrate | 152272 | 0 | 14536 | 40 | 3717281 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
