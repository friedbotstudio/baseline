# Phase timing — companion-channel-pool

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 672959 | 0 | 116245 | 1707 | 6610502 |
| scout | 154439 | 0 | 21413 | 1598 | 3625077 |
| research | 163833 | 0 | 25976 | 32 | 2788010 |
| spec | 201857 | 0 | 42017 | 1072 | 3654317 |
| spec-shippability-review | 41284 | 0 | 5100 | 1060 | 2673114 |
| tdd | 751387 | 0 | 113204 | 7494 | 32231951 |
| └ tdd:scenario | 261721 | 0 | 54761 | 3548 | 12764959 |
| └ tdd:implement | 232308 | 0 | 31678 | 1953 | 6938100 |
| └ tdd:verify | 47978 | 0 | 6533 | 30 | 4507709 |
| └ tdd:drift-check | 209380 | 0 | 20232 | 1963 | 8021183 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 75865 | 0 | 10367 | 1941 | 5679749 |
| security | 74655 | 0 | 13457 | 22 | 3541131 |
| integrate | 148722 | 0 | 10739 | 32 | 5260980 |
| document | 69929 | 0 | 8600 | 22 | 3688409 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
