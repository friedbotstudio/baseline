# Phase timing — checker-graduation-fanout

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 200347 | 0 | 156272 | 124 | 7310170 |
| scout | 254341 | 0 | 33836 | 36 | 3450283 |
| research | 418060 | 0 | 43966 | 571 | 5272957 |
| spec | 1606402 | 0 | 231780 | 6454 | 25007262 |
| spec-shippability-review | 172812 | 0 | 20105 | 1110 | 10874175 |
| tdd | 1630930 | 0 | 374202 | 9536 | 74293943 |
| └ tdd:scenario | 240813 | 0 | 103177 | 2036 | 17197773 |
| └ tdd:implement | 140933 | 0 | 71245 | 1418 | 7799170 |
| └ tdd:verify | 83897 | 0 | 8521 | 30 | 6070183 |
| └ tdd:drift-check | 1165287 | 0 | 191259 | 6052 | 43226817 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 83392 | 0 | 16748 | 38 | 9133612 |
| security | 33985 | 0 | 10279 | 16 | 3898019 |
| integrate | 85109 | 0 | 8019 | 28 | 6868869 |
| document | 102180 | 0 | 25290 | 40 | 9957009 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
