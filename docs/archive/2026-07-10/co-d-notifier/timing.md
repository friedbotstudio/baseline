# Phase timing — co-d-notifier

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 16495188 | 0 | 272639 | 148756 | 29848794 |
| spec-shippability-review | 56239 | 0 | 5728 | 28 | 4246169 |
| tdd | 0 | 1998391.880859375 | 87318 | 5233 | 38533706 |
| └ tdd:scenario | 0 | 0 | 43539 | 77 | 14911236 |
| └ tdd:implement | 315156 | 0 | 40054 | 5138 | 19800651 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 40392 | 0 | 3725 | 18 | 3821819 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 183865 | 0 | 26713 | 48 | 10337916 |
| security | 239638 | 0 | 38054 | 1148 | 11206783 |
| integrate | 1666712 | 0 | 109550 | 4403 | 53994126 |
| document | 103614 | 0 | 12435 | 577 | 7345350 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
