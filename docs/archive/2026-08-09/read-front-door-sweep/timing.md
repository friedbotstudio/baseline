# Phase timing — read-front-door-sweep

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 934059 | 0 | 97162 | 224 | 18781664 |
| spec-shippability-review | 61363 | 0 | 4859 | 26 | 2818089 |
| swarm-plan | 0 | 7660972.831542969 | 41900 | 74 | 8683160 |
| swarm-dispatch | 4458296 | 0 | 306192 | 776 | 143511864 |
| tdd | 0 | 0 | 0 | 0 | 0 |
| simplify | 1019000 | 0 | 60404 | 136 | 34593658 |
| security | 277202 | 0 | 32667 | 66 | 18542387 |
| integrate | 1744837 | 0 | 47773 | 176 | 50661226 |
| document | 177733 | 0 | 7303 | 30 | 7628944 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
