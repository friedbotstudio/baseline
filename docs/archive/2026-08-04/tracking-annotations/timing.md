# Phase timing — tracking-annotations

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 690257 | 0 | 90396 | 186 | 15093845 |
| spec-shippability-review | 42634 | 0 | 4295 | 24 | 2564972 |
| tdd | 4955033 | 0 | 145612 | 338 | 51942524 |
| └ tdd:scenario | 525970 | 0 | 67841 | 132 | 16791407 |
| └ tdd:implement | 4301355 | 0 | 63731 | 150 | 25043923 |
| └ tdd:verify | 64231 | 0 | 6550 | 24 | 4295084 |
| └ tdd:drift-check | 47002 | 0 | 3504 | 20 | 3625114 |
| └ tdd:finalize | 16475 | 0 | 3986 | 12 | 2186996 |
| simplify | 99016 | 0 | 9211 | 30 | 5517966 |
| security | 162062 | 0 | 17579 | 34 | 6413725 |
| integrate | 130279 | 0 | 9777 | 30 | 5834741 |
| document | 348394 | 0 | 51908 | 122 | 25186380 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
