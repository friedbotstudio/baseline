# Phase timing — simplify-reverify-guard

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 596648 | 0 | 148407 | 4452 | 25306543 |
| └ tdd:scenario | 426636 | 0 | 117040 | 2934 | 17101131 |
| └ tdd:implement | 148624 | 0 | 29227 | 1508 | 6803952 |
| └ tdd:verify | 21388 | 0 | 2140 | 10 | 1401460 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 75506 | 0 | 10221 | 2465 | 4527743 |
| security | 53934 | 0 | 7738 | 19 | 3186648 |
| integrate | 108875 | 0 | 8907 | 33 | 5328465 |
| document | 81921 | 0 | 12239 | 642 | 4229682 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
