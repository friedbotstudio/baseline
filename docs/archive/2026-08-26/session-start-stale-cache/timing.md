# Phase timing — session-start-stale-cache

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 98969 | 0 | 12409 | 26 | 2708952 |
| scout | 112362 | 0 | 9956 | 30 | 3521955 |
| spec | 382997 | 0 | 49497 | 92 | 12123467 |
| spec-shippability-review | 28728 | 0 | 4194 | 14 | 2000453 |
| tdd | 1953666 | 0 | 93784 | 248 | 41286505 |
| └ tdd:scenario | 257998 | 0 | 31172 | 72 | 11060407 |
| └ tdd:implement | 369401 | 0 | 23187 | 56 | 9435008 |
| └ tdd:verify | 114219 | 0 | 3771 | 20 | 2543794 |
| └ tdd:drift-check | 1212048 | 0 | 35654 | 100 | 18247296 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 281965 | 0 | 9665 | 44 | 8961121 |
| security | 93043 | 0 | 7340 | 22 | 4626627 |
| integrate | 412051 | 0 | 15312 | 64 | 13885732 |
| document | 104635 | 0 | 7606 | 26 | 5820214 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
