# Phase timing — staleness-witness

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 928511 | 0 | 31432 | 72 | 16015803 |
| └ tdd:scenario | 928511 | 0 | 31432 | 72 | 16015803 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| └ tdd:attempt-2 | 2735570 | 0 | 30296 | 92 | 25758633 |
| └ tdd:attempt-3 | 557216 | 0 | 22752 | 56 | 16406512 |
| simplify | 1693908 | 0 | 12967 | 52 | 14391116 |
| security | 1471737 | 0 | 30423 | 70 | 20104591 |
| integrate | 645644 | 0 | 24781 | 72 | 21439486 |
| document | 80233 | 0 | 8742 | 20 | 6083443 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
