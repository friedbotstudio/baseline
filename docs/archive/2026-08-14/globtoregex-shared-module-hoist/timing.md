# Phase timing — globtoregex-shared-module-hoist

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 3328880 | 0 | 49576 | 134 | 9964926 |
| spec-shippability-review | 48385 | 0 | 3775 | 30 | 2921666 |
| tdd | 373478.4792480469 | 6151901.520751953 | -47062 | -146 | -11883444 |
| └ tdd:scenario | 0 | 0 | 211539 | 310 | 77383157 |
| └ tdd:implement | 2563265 | 0 | 97668 | 212 | 66021786 |
| └ tdd:verify | 1238416 | 0 | -358764 | -688 | -156638783 |
| └ tdd:drift-check | 27100 | 0 | 1718 | 14 | 943373 |
| └ tdd:finalize | 12613 | 0 | 777 | 6 | 407023 |
| simplify | 666564 | 0 | 10598 | 68 | 5251112 |
| security | 722335 | 0 | 9689 | 36 | 2995351 |
| integrate | 205210 | 0 | 5517 | 26 | 2704116 |
| document | 566550 | 0 | 24191 | 118 | 13543745 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
