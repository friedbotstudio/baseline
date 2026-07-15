# Phase timing — spec-quality-floor

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 705616 | 0 | 116674 | 161 | 9458527 |
| spec-shippability-review | 64020 | 0 | 8199 | 24 | 2125115 |
| tdd | 1431862 | 0 | 155329 | 250 | 32507804 |
| └ tdd:scenario | 371945 | 0 | 67048 | 81 | 9060056 |
| └ tdd:implement | 803392 | 0 | 63078 | 107 | 14513329 |
| └ tdd:verify | 213258 | 0 | 23589 | 50 | 7177761 |
| └ tdd:drift-check | 43267 | 0 | 1614 | 12 | 1756658 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 93160 | 0 | 13908 | 42 | 6240436 |
| security | 112417 | 0 | 16130 | 34 | 5226842 |
| integrate | 110289 | 0 | 5148 | 32 | 5059451 |
| document | 553349 | 0 | 41878 | 108 | 18074938 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
