# Phase timing — sprint-channel-mcp

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2363340 | 0 | 201925 | 13544 | 84936831 |
| └ tdd:scenario | 1901462 | 0 | 164707 | 11941 | 64285682 |
| └ tdd:implement | 427511 | 0 | 34651 | 1589 | 16164109 |
| └ tdd:verify | 34367 | 0 | 2567 | 14 | 4487040 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 57313 | 0 | 7831 | 26 | 9729618 |
| security | 712974 | 0 | 49009 | 1968 | 33736201 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
