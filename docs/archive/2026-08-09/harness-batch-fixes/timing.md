# Phase timing — harness-batch-fixes

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 657055 | 0 | 100555 | 182 | 12565792 |
| spec-shippability-review | 72501 | 0 | 6783 | 36 | 3563515 |
| tdd | 72027.80908203125 | 4013727.1909179688 | 292603 | 784 | 151390687 |
| └ tdd:scenario | 0 | 0 | 109441 | 212 | 29484088 |
| └ tdd:implement | 2273537 | 0 | 148311 | 434 | 89321692 |
| └ tdd:verify | 204164 | 0 | 7146 | 36 | 7286386 |
| └ tdd:drift-check | 62789 | 0 | 6424 | 22 | 5327461 |
| └ tdd:finalize | 463980 | 0 | 21281 | 80 | 19971060 |
| simplify | 324596 | 0 | 13252 | 76 | 19838636 |
| security | 225951 | 0 | 23339 | 52 | 14078727 |
| integrate | 784475 | 0 | 17452 | 86 | 23094706 |
| document | 31276974 | 0 | 124197 | 306 | 92909637 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
