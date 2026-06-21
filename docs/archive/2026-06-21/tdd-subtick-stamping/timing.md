# Phase timing — tdd-subtick-stamping

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 748069 | 0 | 118267 | 3308 | 37880923 |
| simplify | 107340 | 0 | 6351 | 32 | 6005327 |
| security | 106226 | 0 | 11787 | 26 | 4954689 |
| integrate | 76171 | 0 | 1595 | 18 | 3489151 |
| document | 183338 | 0 | 17615 | 1540 | 9069695 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
