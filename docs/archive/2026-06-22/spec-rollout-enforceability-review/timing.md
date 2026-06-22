# Phase timing — spec-rollout-enforceability-review

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 765380 | 0 | 106130 | 4799 | 6449519 |
| scout | 152147 | 0 | 28371 | 2923 | 4824736 |
| research | 183381 | 0 | 30712 | 26 | 2392770 |
| spec | 358190 | 0 | 65644 | 4668 | 8860962 |
| spec-shippability-review | 62860 | 0 | 7030 | 32 | 3769778 |
| tdd | 1856594 | 0 | 257155 | 24722 | 95519522 |
| └ tdd:scenario | 384060 | 0 | 90717 | 2253 | 14859041 |
| └ tdd:implement | 1169644 | 0 | 136133 | 18810 | 63567232 |
| └ tdd:verify | 153207 | 0 | 7837 | 32 | 6442705 |
| └ tdd:drift-check | 131438 | 0 | 20206 | 3617 | 8575934 |
| └ tdd:finalize | 18245 | 0 | 2262 | 10 | 2074610 |
| simplify | 105461 | 0 | 13911 | 36 | 7533158 |
| security | 113240 | 0 | 16640 | 30 | 6405622 |
| integrate | 162667 | 0 | 6068 | 1452 | 5670413 |
| document | 112183 | 0 | 14962 | 2177 | 8409510 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
