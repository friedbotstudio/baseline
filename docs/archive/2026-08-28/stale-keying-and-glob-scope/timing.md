# Phase timing — stale-keying-and-glob-scope

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 43389108 | 0 | 302129 | 552 | 62967791 |
| scout | 481419 | 0 | 45250 | 64 | 11772299 |
| spec | 318089 | 0 | 40058 | 50 | 11365658 |
| spec-shippability-review | 85846 | 0 | 5616 | 16 | 3787201 |
| tdd | 4287687 | 0 | 154362 | 280 | 76592191 |
| └ tdd:scenario | 0 | 0 | -225103 | -388 | -66063111 |
| └ tdd:implement | 28866039 | 0 | 70592 | 140 | 19503191 |
| └ tdd:verify | 17740206 | 0 | 301555 | 504 | 115807163 |
| └ tdd:drift-check | 267157 | 0 | 7318 | 24 | 7344948 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 2848092 | 0 | 17759 | 48 | 14999173 |
| security | 145460 | 0 | 18925 | 30 | 9591992 |
| integrate | 1080749 | 0 | 37331 | 114 | 19961838 |
| document | 22651059 | 0 | 47769 | 142 | 10371445 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
