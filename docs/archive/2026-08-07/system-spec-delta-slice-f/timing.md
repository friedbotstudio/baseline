# Phase timing — system-spec-delta-slice-f

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1038351 | 0 | 70705 | 327 | 37534243 |
| └ tdd:scenario | 561290 | 0 | 37066 | 229 | 17940413 |
| └ tdd:implement | 460054 | 0 | 31639 | 90 | 17954903 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 17007 | 0 | 2000 | 8 | 1638927 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| integrate | 175268 | 0 | 4588 | 22 | 4534111 |
| document | 55118 | 0 | 5668 | 30 | 6292899 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
