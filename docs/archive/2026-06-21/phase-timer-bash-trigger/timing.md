# Phase timing — phase-timer-bash-trigger

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 878437 | 0 | 95391 | 2823 | 18398138 |
| simplify | 123257 | 0 | 7596 | 36 | 3257706 |
| security | 133532 | 0 | 14531 | 28 | 2629448 |
| integrate | 97835 | 0 | 4502 | 32 | 3158314 |
| document | 244092 | 0 | 27592 | 1619 | 9138200 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
