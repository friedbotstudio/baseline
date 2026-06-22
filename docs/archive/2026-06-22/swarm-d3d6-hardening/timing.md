# Phase timing — swarm-d3d6-hardening

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 637298 | 0 | 116736 | 6749 | 54380623 |
| simplify | 57835 | 0 | 9096 | 1273 | 6946629 |
| security | 58284 | 0 | 10652 | 16 | 5076101 |
| integrate | 908243 | 0 | 9672 | 539 | 12778545 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
