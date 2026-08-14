# Phase timing — release-readiness

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 716189 | 0 | 70292 | 174 | 12726985 |
| spec-shippability-review | 80312 | 0 | 4037 | 32 | 3043432 |
| tdd | 30388219 | 0 | 139355 | 468 | 68810930 |
| └ tdd:scenario | 788591 | 0 | 92635 | 238 | 30853060 |
| └ tdd:implement | 28137170 | 0 | 35816 | 166 | 26825930 |
| └ tdd:verify | 140412 | 0 | 2511 | 16 | 2491377 |
| └ tdd:drift-check | 1322046 | 0 | 8393 | 48 | 8640563 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 471914 | 0 | 17473 | 72 | 13435086 |
| security | 133455 | 0 | 15155 | 34 | 6545324 |
| integrate | 208951 | 0 | 4661 | 24 | 4760126 |
| document | 692893 | 0 | 26985 | 84 | 18507004 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
