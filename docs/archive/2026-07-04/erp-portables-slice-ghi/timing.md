# Phase timing — erp-portables-slice-ghi

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1097845 | 0 | 94440 | 9358 | 40117348 |
| └ tdd:scenario | 0 | 0 | 0 | 0 | 0 |
| └ tdd:implement | 2462192 | 0 | 80110 | 9302 | 32627750 |
| └ tdd:verify | 121936 | 0 | 9759 | 40 | 5330140 |
| └ tdd:drift-check | 41899 | 0 | 4571 | 16 | 2159458 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| security | 98006 | 0 | 11224 | 36 | 4913047 |
| integrate | 136769 | 0 | 6302 | 30 | 4193308 |
| document | 184293 | 0 | 18084 | 536 | 8194069 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
