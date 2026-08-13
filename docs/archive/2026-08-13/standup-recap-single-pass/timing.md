# Phase timing — standup-recap-single-pass

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 0 | 0 | 51529 | 168 | 21747540 |
| └ tdd:scenario | 0 | 0 | 0 | 0 | 0 |
| └ tdd:implement | 664809 | 0 | 45837 | 142 | 18051948 |
| └ tdd:verify | 51555 | 0 | 5331 | 20 | 2836560 |
| └ tdd:finalize | 24220 | 0 | 1846 | 20 | 2867381 |
| simplify | 135443 | 0 | 13539 | 60 | 8796158 |
| security | 615822 | 0 | 57314 | 118 | 18882520 |
| integrate | 393498 | 0 | 36755 | 114 | 19909419 |
| document | 499513 | 0 | 83454 | 158 | 31520428 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
