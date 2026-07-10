# Phase timing — governance-amendments-research-retrieval

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 515551 | 0 | 101446 | 2005 | 7087764 |
| spec-shippability-review | 36707 | 0 | 7088 | 26 | 2365667 |
| tdd | 713321 | 0 | 96517 | 11996 | 29980176 |
| └ tdd:scenario | 244925 | 0 | 47996 | 2625 | 9842943 |
| └ tdd:implement | 215867 | 0 | 28215 | 2965 | 10428336 |
| └ tdd:verify | 239070 | 0 | 17742 | 3866 | 8581301 |
| └ tdd:drift-check | 13459 | 0 | 2564 | 2540 | 1127596 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 59797 | 0 | 13633 | 1119 | 5980524 |
| security | 75329 | 0 | 12000 | 26 | 3803000 |
| integrate | 975782 | 0 | 71520 | 7725 | 24307657 |
| document | 78084 | 0 | 14487 | 2572 | 6929437 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
