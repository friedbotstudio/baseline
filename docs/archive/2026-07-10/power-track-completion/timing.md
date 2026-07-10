# Phase timing — power-track-completion

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 617948 | 0 | 82843 | 3154 | 28135474 |
| spec-shippability-review | 144787 | 0 | 16142 | 908 | 9120695 |
| tdd | 50793.854736328125 | 6275175.145263672 | 356209 | 26916 | 225986951 |
| └ tdd:scenario | 0 | 0 | 171969 | 9516 | 62337298 |
| └ tdd:implement | 1003382 | 0 | 71556 | 8446 | 59304631 |
| └ tdd:verify | 453116 | 0 | 29686 | 1769 | 24926677 |
| └ tdd:drift-check | 1893823 | 0 | 82998 | 7185 | 79418345 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 188764 | 0 | 19358 | 1805 | 17220266 |
| security | 353099 | 0 | 41915 | 1810 | 17128204 |
| integrate | 258630 | 0 | 8273 | 34 | 10558701 |
| document | 27491468 | 0 | 24342 | 3216 | 15212350 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
