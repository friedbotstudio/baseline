# Phase timing — rightsize-gate-fix

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 832582 | 0 | 84716 | 80 | 5088905 |
| spec-shippability-review | 49218 | 0 | 6998 | 20 | 1661938 |
| tdd | 931001 | 0 | 115432 | 207 | 22864402 |
| └ tdd:scenario | 241383 | 0 | 43072 | 55 | 5442657 |
| └ tdd:implement | 253432 | 0 | 35443 | 76 | 8350551 |
| └ tdd:verify | 308858 | 0 | 18629 | 44 | 5173327 |
| └ tdd:drift-check | 127328 | 0 | 18288 | 32 | 3897867 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 639800 | 0 | 52507 | 110 | 14620529 |
| security | 89640 | 0 | 15025 | 22 | 3103594 |
| integrate | 69647 | 0 | 8293 | 30 | 4369936 |
| document | 85839 | 0 | 12300 | 30 | 4477736 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
