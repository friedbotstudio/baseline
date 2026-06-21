# Phase timing — phase-token-instrumentation

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1214434 | 0 | 0 | 0 | 0 |
| simplify | 559187 | 0 | 62430 | 1401 | 8499290 |
| security | 91676 | 0 | 12961 | 26 | 3250634 |
| integrate | 287670 | 0 | 11863 | 904 | 4383339 |
| document | 183286 | 0 | 21350 | 966 | 7269735 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
