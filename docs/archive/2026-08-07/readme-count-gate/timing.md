# Phase timing — readme-count-gate

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 879382 | 0 | 91820 | 224 | 21211383 |
| └ tdd:scenario | 879382 | 0 | 91820 | 224 | 21211383 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 310030 | 0 | 27555 | 86 | 9785962 |
| security | 129006 | 0 | 12826 | 44 | 5349036 |
| integrate | 310794 | 0 | 7843 | 42 | 5314606 |
| document | 301007 | 0 | 42584 | 106 | 14523836 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
