# Phase timing — release-safety-2026-08-25

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 0 | 0 | 0 | 0 | 0 |
| spec-shippability-review | 1041566 | 0 | 73153 | 160 | 28920822 |
| tdd | 372208.7751464844 | 35150283.224853516 | 307549 | 906 | 222862869 |
| └ tdd:scenario | 0 | 0 | 125493 | 210 | 52216824 |
| └ tdd:implement | 3939986 | 0 | 141550 | 526 | 129438477 |
| └ tdd:verify | 9899168 | 0 | 5388 | 32 | 7495510 |
| └ tdd:drift-check | 20794660 | 0 | 32664 | 132 | 32035940 |
| └ tdd:finalize | 6132 | 0 | 2454 | 6 | 1676118 |
| └ tdd:attempt-2 | 0 | 0 | -7504 | -20 | -5571436 |
| └ tdd:attempt-3 | 553357 | 0 | 32648 | 102 | 28941037 |
| simplify | 85922 | 0 | 9854 | 40 | 11259530 |
| security | 110373 | 0 | 8551 | 32 | 9195082 |
| integrate | 1460528 | 0 | 42163 | 160 | 47921429 |
| document | 924419 | 0 | 76474 | 208 | 31481512 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
