# Phase timing — erp-portables-slice-j

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2087625 | 0 | 234428 | 22391 | 37490859 |
| └ tdd:scenario | 748250 | 0 | 140407 | 14414 | 15598964 |
| └ tdd:implement | 1323868 | 0 | 93271 | 7895 | 21349283 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 17030 | 0 | 6270 | 94 | 2174426 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 146607 | 0 | 16900 | 44 | 6043646 |
| security | 122291 | 0 | 19305 | 63 | 3391056 |
| integrate | 95699 | 0 | 6832 | 63 | 3484232 |
| document | 274321 | 0 | 35631 | 3508 | 13605021 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
