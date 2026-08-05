# Phase timing — architecture-map

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 552595 | 0 | 89416 | 131 | 18910184 |
| spec-shippability-review | 40286 | 0 | 4265 | 24 | 3974126 |
| tdd | 1789147.3522949219 | 6692431.647705078 | 345778 | 744 | 191419139 |
| └ tdd:scenario | 0 | 0 | 118448 | 194 | 39502729 |
| └ tdd:implement | 3024864 | 0 | 140010 | 310 | 81004185 |
| └ tdd:verify | 356431 | 0 | 14050 | 64 | 18726914 |
| └ tdd:drift-check | 1495570 | 0 | 70721 | 162 | 47761295 |
| └ tdd:finalize | 66601 | 0 | 2549 | 14 | 4424016 |
| simplify | 3803903 | 0 | 48373 | 151 | 33803463 |
| security | 242401 | 0 | 42600 | 60 | 20205697 |
| integrate | 34255268 | 0 | 24577 | 58 | 18141396 |
| document | 921150 | 0 | 91769 | 188 | 66630518 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
