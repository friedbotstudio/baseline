# Phase timing — unsanitised-path-pair

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1875710 | 0 | 109427 | 236 | 39165378 |
| └ tdd:scenario | 1875710 | 0 | 109427 | 236 | 39165378 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 11756037 | 0 | 574075 | 1244 | 267237873 |
| security | 378971 | 0 | 36333 | 80 | 6121352 |
| integrate | 659473 | 0 | 26410 | 70 | 5279915 |
| document | 36858945 | 0 | 77120 | 198 | 19870404 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
