# Phase timing — sweep-staleness-parity

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1415464 | 0 | 102499 | 248 | 63063735 |
| └ tdd:scenario | 1415464 | 0 | 102499 | 248 | 63063735 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| security | 747012 | 0 | 26350 | 42 | 17975420 |
| integrate | 187553 | 0 | 6369 | 36 | 15649694 |
| document | 2003599 | 0 | 69646 | 174 | 36736480 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
