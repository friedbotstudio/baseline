# Phase timing — system-spec-delta-slice-e

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2517901 | 0 | 123353 | 442 | 27567634 |
| └ tdd:scenario | 737055 | 0 | 92372 | 344 | 16356042 |
| └ tdd:implement | 1739836 | 0 | 29077 | 82 | 9300981 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 41010 | 0 | 1904 | 16 | 1910611 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 121456 | 0 | 10327 | 44 | 5441278 |
| integrate | 123966 | 0 | 4145 | 22 | 2845707 |
| document | 75277 | 0 | 9188 | 38 | 5059889 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
