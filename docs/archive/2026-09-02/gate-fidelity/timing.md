# Phase timing — gate-fidelity

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 2254138 | 0 | n/a | n/a | n/a |
| scout | 320046 | 0 | 40483 | 72 | 8910868 |
| research | 505212 | 0 | 23546 | 38 | 5043486 |
| spec | 423196 | 0 | 52226 | 46 | 7734927 |
| spec-shippability-review | 45096 | 0 | 6422 | 22 | 4047455 |
| tdd | 2266230 | 0 | 183837 | 398 | 93591838 |
| └ tdd:scenario | 2091862 | 0 | 182415 | 390 | 91441422 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 495447 | 0 | 23242 | 54 | 14904650 |
| security | 431583 | 0 | 39640 | 58 | 17212167 |
| integrate | 370261 | 0 | 14792 | 56 | 17459427 |
| document | 2480759 | 0 | 56786 | 160 | 26433400 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
