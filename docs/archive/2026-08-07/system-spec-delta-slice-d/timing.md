# Phase timing — system-spec-delta-slice-d

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 7399317 | 0 | n/a | n/a | n/a |
| └ tdd:scenario | 3774489 | 0 | n/a | n/a | n/a |
| └ tdd:implement | 3527050 | 0 | 22944 | 86 | 9154260 |
| └ tdd:verify | 61195 | 0 | 3174 | 28 | 3163955 |
| └ tdd:drift-check | 36583 | 0 | 1933 | 20 | 2293911 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 92096 | 0 | 5624 | 40 | 4723193 |
| integrate | 128485 | 0 | 4237 | 26 | 3172154 |
| document | 207204 | 0 | 27972 | 76 | 9959988 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
