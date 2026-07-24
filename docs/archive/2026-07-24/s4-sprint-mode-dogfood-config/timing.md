# Phase timing — s4-sprint-mode-dogfood-config

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| verify | 41064073 | 0 | 135865 | 173 | 22363147 |
| simplify | 33992 | 0 | 9323 | 12 | 1792862 |
| integrate | 82568 | 0 | 5501 | 16 | 2462748 |
| document | 116909 | 0 | 19510 | 40 | 6344498 |
| chore | 14936 | 0 | 5859 | 12 | 1947516 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
