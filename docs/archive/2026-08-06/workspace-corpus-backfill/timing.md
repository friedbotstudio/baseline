# Phase timing — workspace-corpus-backfill

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 581917 | 0 | 136784 | 140 | 11227717 |
| spec-shippability-review | 84616 | 0 | 9061 | 28 | 2925706 |
| tdd | 1503840.1879882812 | 2234835.8120117188 | 306715 | 546 | 92897780 |
| └ tdd:scenario | 0 | 0 | 204970 | 260 | 36857674 |
| └ tdd:implement | 1365086 | 0 | 74968 | 208 | 40200396 |
| └ tdd:verify | 41518 | 0 | 2905 | 18 | 3880622 |
| └ tdd:drift-check | 298717 | 0 | 22260 | 50 | 9711245 |
| └ tdd:finalize | 24310 | 0 | 1612 | 10 | 2247843 |
| simplify | 29718402 | 0 | 16955 | 64 | 13904501 |
| security | 1155558 | 0 | 13207 | 32 | 7579754 |
| integrate | 665014 | 0 | 39165 | 94 | 23279522 |
| document | 601220 | 0 | 50017 | 122 | 32658584 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
