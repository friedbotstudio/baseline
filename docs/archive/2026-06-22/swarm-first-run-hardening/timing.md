# Phase timing — swarm-first-run-hardening

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 589344 | 0 | 123014 | 3264 | 5848458 |
| scout | 149613 | 0 | 22273 | 1705 | 3641861 |
| research | 127812 | 0 | 25352 | 24 | 1945481 |
| spec | 293345 | 0 | 57180 | 1719 | 6070590 |
| spec-shippability-review | 29040 | 0 | 2882 | 1669 | 1650962 |
| tdd | 683967 | 0 | 112198 | 12129 | 32337953 |
| └ tdd:scenario | 213385 | 0 | 48192 | 1724 | 9491390 |
| └ tdd:implement | 321753 | 0 | 36348 | 6245 | 13650323 |
| └ tdd:verify | 43564 | 0 | 7822 | 16 | 2339908 |
| └ tdd:drift-check | 105265 | 0 | 19836 | 4144 | 6856332 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 70552 | 0 | 7949 | 36 | 5507414 |
| security | 84240 | 0 | 16276 | 106 | 4371117 |
| integrate | 277448 | 0 | 13439 | 2698 | 8763377 |
| document | 219049 | 0 | 33803 | 2105 | 10628394 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
