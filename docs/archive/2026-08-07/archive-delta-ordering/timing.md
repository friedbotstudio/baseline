# Phase timing — archive-delta-ordering

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1158534 | 0 | 99721 | 346 | 63087340 |
| └ tdd:scenario | 489214 | 0 | 54743 | 230 | 32801743 |
| └ tdd:implement | 639515 | 0 | 43016 | 102 | 26553150 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 37088 | 0 | 2155 | 16 | 4266628 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 73522 | 0 | 4071 | 65 | 6972394 |
| security | 106729 | 0 | 7213 | 24 | 6515949 |
| integrate | 194475 | 0 | 3677 | 24 | 6608155 |
| document | 63289 | 0 | 5396 | 26 | 7196380 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
