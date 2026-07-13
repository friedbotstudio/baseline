# Phase timing — extractor-noise-and-prereq-drift

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 1890974 | 0 | 68883 | 139 | 26076901 |
| spec-shippability-review | 64858 | 0 | 7233 | 30 | 6198941 |
| tdd | 0 | 10454999.125732422 | 248463 | 519 | 147850579 |
| └ tdd:scenario | 0 | 0 | 169840 | 312 | 78274178 |
| └ tdd:implement | 2229682 | 0 | 73093 | 171 | 56506435 |
| └ tdd:verify | 36132 | 0 | 3086 | 18 | 6527763 |
| └ tdd:drift-check | 37735 | 0 | 2444 | 18 | 6542203 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 494451 | 0 | 40967 | 100 | 29345052 |
| security | 252799 | 0 | 47246 | 46 | 15549685 |
| integrate | 3832133 | 0 | 100114 | 248 | 89012340 |
| document | 85555 | 0 | 9992 | 30 | 13201802 |
| roadmap-sync | 0 | 0 | 0 | 0 | 0 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
