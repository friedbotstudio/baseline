# Phase timing — erp-portables-slice-a

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 3171516 | 0 | 150005 | 3724 | 24021837 |
| └ tdd:scenario | 2777172 | 0 | 81355 | 149 | 9216239 |
| └ tdd:implement | 312876 | 0 | 51476 | 3529 | 9970467 |
| └ tdd:verify | 59919 | 0 | 11444 | 34 | 3555967 |
| └ tdd:drift-check | 21549 | 0 | 5730 | 12 | 1279164 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 61351 | 0 | 10343 | 36 | 3887541 |
| integrate | 275831 | 0 | 11524 | 514 | 6332198 |
| document | 78607 | 0 | 11319 | 34 | 4006606 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
