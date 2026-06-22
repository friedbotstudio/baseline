# Phase timing — sprint-completeness-oracle

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1951197 | 0 | 282414 | 37229 | 98650104 |
| └ tdd:scenario | 790450 | 0 | 135844 | 26331 | 34263823 |
| └ tdd:implement | 1130666 | 0 | 142440 | 10888 | 61710688 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 30081 | 0 | 4130 | 10 | 2675593 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| integrate | 744541 | 0 | 36818 | 2366 | 22475238 |
| document | 81732 | 0 | 10432 | 24 | 6709316 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
