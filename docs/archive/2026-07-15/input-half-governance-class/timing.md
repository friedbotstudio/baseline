# Phase timing — input-half-governance-class

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 601737 | 0 | 148157 | 10679 | 10243202 |
| spec-shippability-review | 91485 | 0 | 8681 | 30 | 3181699 |
| tdd | 1280825 | 0 | 207443 | 304 | 42197688 |
| simplify | 92908 | 0 | 16398 | 35 | 6158403 |
| security | 108147 | 0 | 15320 | 28 | 4711613 |
| integrate | 118792 | 0 | 10314 | 42 | 7285810 |
| document | 87019 | 0 | 15606 | 32 | 5670910 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
