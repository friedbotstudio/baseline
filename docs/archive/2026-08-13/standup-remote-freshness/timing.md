# Phase timing — standup-remote-freshness

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 9199546 | 0 | 53447 | 172 | 11474709 |
| spec-shippability-review | 36270 | 0 | 929 | 14 | 1310694 |
| tdd | 0 | 5762800.613769531 | 170097 | 454 | 69845882 |
| └ tdd:scenario | 0 | 0 | 80799 | 154 | 18674657 |
| └ tdd:implement | 1304019 | 0 | 67009 | 214 | 34976684 |
| └ tdd:verify | 42276 | 0 | 4074 | 18 | 3332230 |
| └ tdd:drift-check | 1368363 | 0 | 14642 | 58 | 10933184 |
| └ tdd:finalize | 13425 | 0 | 3573 | 10 | 1929127 |
| simplify | 159191 | 0 | 12110 | 52 | 10255563 |
| security | 239685 | 0 | 32375 | 48 | 9847892 |
| integrate | 260296 | 0 | 11174 | 48 | 10334542 |
| document | 4132171 | 0 | 207945 | 612 | 167678215 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
