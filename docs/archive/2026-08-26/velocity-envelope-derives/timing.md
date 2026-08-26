# Phase timing — velocity-envelope-derives

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 524070 | 0 | 31530 | 70 | 14992853 |
| └ tdd:attempt-2 | 1902152 | 0 | 62937 | 120 | 27830886 |
| simplify | 322544 | 0 | 6056 | 8 | 1759880 |
| security | 46465 | 0 | 2176 | 10 | 2220031 |
| integrate | 319768 | 0 | 3981 | 8 | 1790804 |
| document | 432719 | 0 | 22648 | 46 | 10562895 |
| archive | 11908 | 0 | 514 | 4 | 948786 |
| roadmap-sync | 415731 | 0 | 9507 | 26 | 6202092 |
| memory-sync | 0 | 0 | 0 | 0 | 0 |
| cli-copy-review | 0 | 0 | 0 | 0 | 0 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
