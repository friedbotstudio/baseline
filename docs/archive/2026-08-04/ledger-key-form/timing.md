# Phase timing — ledger-key-form

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1239246 | 0 | 138963 | 370 | 43823486 |
| └ tdd:scenario | 842660 | 0 | 99720 | 238 | 22892046 |
| └ tdd:implement | 307652 | 0 | 32267 | 90 | 13828695 |
| └ tdd:verify | 75505 | 0 | 5135 | 34 | 5740331 |
| └ tdd:finalize | 13429 | 0 | 1841 | 8 | 1362414 |
| security | 212027 | 0 | 28913 | 66 | 11492217 |
| integrate | 188391 | 0 | 16938 | 54 | 9869205 |
| document | 403593 | 0 | 19896 | 56 | 9507058 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
