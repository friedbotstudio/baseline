# Phase timing — residual-epic-approval-cd-bypass

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 510928 | 0 | 96990 | 3536 | 6101796 |
| spec-shippability-review | 42452 | 0 | 2171 | 988 | 1647287 |
| tdd | 740490 | 0 | 89163 | 3389 | 21103441 |
| simplify | 103092 | 0 | 6850 | 38 | 4112394 |
| security | 98933 | 0 | 12359 | 659 | 3115985 |
| integrate | 73981 | 0 | 2948 | 28 | 3215153 |
| document | 215175 | 0 | 32663 | 1951 | 7023640 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
