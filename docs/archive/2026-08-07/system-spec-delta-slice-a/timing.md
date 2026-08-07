# Phase timing — system-spec-delta-slice-a

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1676962 | 0 | 154422 | 418 | 42212819 |
| └ tdd:scenario | 614482 | 0 | 98569 | 218 | 17650141 |
| └ tdd:implement | 849248 | 0 | 38019 | 126 | 14612641 |
| └ tdd:verify | 90692 | 0 | 5621 | 28 | 3697054 |
| └ tdd:drift-check | 108429 | 0 | 10653 | 36 | 4871384 |
| └ tdd:finalize | 14111 | 0 | 1560 | 10 | 1381599 |
| simplify | 116073 | 0 | 13325 | 44 | 6205077 |
| integrate | 177652 | 0 | 5585 | 30 | 4448044 |
| document | 234810 | 0 | 24883 | 56 | 8083236 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
