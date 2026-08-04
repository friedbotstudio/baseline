# Phase timing — living-system-model-abcd

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 746039 | 0 | 129291 | 215 | 18098897 |
| spec-shippability-review | 139908 | 0 | 11103 | 36 | 4229166 |
| tdd | 0 | 40315544.05175781 | 218892 | 551 | 89613030 |
| └ tdd:scenario | 0 | 0 | 102995 | 223 | 25739347 |
| └ tdd:implement | 1476254 | 0 | 102362 | 252 | 47445929 |
| └ tdd:verify | 155821 | 0 | 9146 | 52 | 11178968 |
| └ tdd:drift-check | 51660 | 0 | 4389 | 24 | 5248786 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 1136637 | 0 | 16850 | 76 | 16957791 |
| security | 33252430 | 0 | 52917 | 66 | 14345768 |
| integrate | 406646 | 0 | 27508 | 80 | 20155924 |
| document | 332646 | 0 | 35065 | 76 | 20131783 |
| archive | 76358 | 0 | 6989 | 30 | 8329960 |
| roadmap-sync | 35262 | 0 | 3291 | 16 | 4483141 |
| memory-flush | 160517 | 0 | 13806 | 42 | 11896687 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
