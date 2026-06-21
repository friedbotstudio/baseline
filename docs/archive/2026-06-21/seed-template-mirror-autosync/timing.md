# Phase timing — seed-template-mirror-autosync

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 851713 | 0 | 127790 | 3334 | 8242651 |
| spec-shippability-review | 37669 | 0 | 2653 | 22 | 1770293 |
| tdd | 836936 | 0 | 174123 | 17527 | 35612280 |
| └ tdd:scenario | 299352 | 0 | 62331 | 2034 | 9783712 |
| └ tdd:implement | 215530 | 0 | 37130 | 2415 | 7802783 |
| └ tdd:verify | 91748 | 0 | 16155 | 630 | 5309609 |
| └ tdd:drift-check | 219553 | 0 | 55755 | 12440 | 11593016 |
| └ tdd:finalize | 10753 | 0 | 2752 | 8 | 1123160 |
| simplify | 88513 | 0 | 11523 | 37 | 5703947 |
| security | 74286 | 0 | 8345 | 612 | 3843939 |
| integrate | 134586 | 0 | 8316 | 32 | 4814333 |
| document | 65324 | 0 | 8888 | 2374 | 4607678 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
