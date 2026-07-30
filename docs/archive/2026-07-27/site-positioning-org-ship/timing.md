# Phase timing — site-positioning-org-ship

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 27078191 | 0 | n/a | n/a | n/a |
| spec-shippability-review | 1553882 | 0 | 71224 | 534 | 34410707 |
| tdd | 4219310.4267578125 | 2844159.5732421875 | 485047 | 1128 | 327416900 |
| └ tdd:scenario | 0 | 0 | 144502 | 242 | 52553786 |
| └ tdd:implement | 3233436 | 0 | 200457 | 560 | 160690731 |
| └ tdd:verify | 1029490 | 0 | 9758 | 28 | 7546104 |
| └ tdd:design-ui | 1187258 | 0 | 113221 | 248 | 86939492 |
| └ tdd:drift-check | 581286 | 0 | 17109 | 50 | 19686787 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 209876 | 0 | 12429 | 42 | 13791709 |
| security | 137298 | 0 | 23683 | 24 | 9844401 |
| integrate | 5158683 | 0 | 65087 | 222 | 92652537 |
| document | 1153711 | 0 | -895363 | -43449 | -528109535 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
