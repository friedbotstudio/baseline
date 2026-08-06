# Phase timing — hook-decision-path-drift

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1717474 | 0 | 53799 | 202 | 54109803 |
| └ tdd:scenario | 465447 | 0 | 28272 | 108 | 28604966 |
| └ tdd:implement | 1252027 | 0 | 25527 | 94 | 25504837 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 75858 | 0 | 3221 | 30 | 8738308 |
| security | 75060 | 0 | 2524 | 16 | 4734383 |
| integrate | 158151 | 0 | 2982 | 24 | 7174431 |
| document | 100507 | 0 | 8886 | 34 | 10293279 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
