# Phase timing — rightsize-triage-drift-skip

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 844869 | 0 | 123579 | 2929 | 8368032 |
| spec-shippability-review | 28447 | 0 | 1460 | 477 | 1275307 |
| tdd | 1852929 | 0 | 175182 | 14036 | 48317864 |
| └ tdd:scenario | 307417 | 0 | 50986 | 1285 | 8886618 |
| └ tdd:implement | 222754 | 0 | 32860 | 1280 | 9291387 |
| └ tdd:verify | 1077024 | 0 | 73980 | 6436 | 22869462 |
| └ tdd:drift-check | 231547 | 0 | 16913 | 5031 | 6626576 |
| └ tdd:finalize | 14187 | 0 | 443 | 4 | 643821 |
| simplify | 389167 | 0 | 23301 | 1863 | 9808969 |
| security | 80257 | 0 | 9542 | 24 | 4033646 |
| integrate | 118318 | 0 | 3394 | 28 | 4803507 |
| document | 266611 | 0 | 21783 | 1252 | 8804730 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
