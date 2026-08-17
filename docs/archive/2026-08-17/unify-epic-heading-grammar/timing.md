# Phase timing — unify-epic-heading-grammar

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 586695 | 0 | 55231 | 68 | 8761104 |
| spec-shippability-review | 161087 | 0 | 26224 | 44 | 6428520 |
| tdd | 0 | 155167260.67651367 | 127965 | 354 | 68413930 |
| simplify | 235821 | 0 | 13559 | 40 | 7076189 |
| security | 234810 | 0 | 26056 | 50 | 9342632 |
| integrate | 1564485 | 0 | 27977 | 120 | 19125589 |
| document | 657413 | 0 | 7102 | 40 | 6847401 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
