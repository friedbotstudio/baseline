# Phase timing — epic-11-heading

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| verify | 218539 | 0 | 6130 | 42 | 2024621 |
| chore | 41051 | 0 | 3440 | 20 | 1054768 |
| archive | 0 | 0 | 0 | 0 | 0 |
| roadmap-sync | 22828 | 0 | 1664 | 12 | 659176 |
| memory-sync | 39843 | 0 | 1858 | 14 | 826951 |
| tdd | 12530392 | 0 | 58720 | 180 | 13905035 |
| └ tdd:scenario | 12530392 | 0 | 58720 | 180 | 13905035 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 227540 | 0 | 2615 | 16 | 1538749 |
| security | 69878 | 0 | 8408 | 16 | 1571120 |
| integrate | 291889 | 0 | 4289 | 20 | 2061799 |
| document | 198943 | 0 | 18694 | 64 | 7293078 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
