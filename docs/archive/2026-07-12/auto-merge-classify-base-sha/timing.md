# Phase timing — auto-merge-classify-base-sha

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 649455 | 0 | n/a | n/a | n/a |
| └ tdd:scenario | 413385 | 0 | n/a | n/a | n/a |
| └ tdd:implement | 164625 | 0 | 14938 | 69 | 5543220 |
| └ tdd:verify | 71445 | 0 | 8686 | 50 | 5892394 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 86274 | 0 | 10696 | 49 | 4854814 |
| security | 172805 | 0 | 31826 | 42 | 4629255 |
| integrate | 326327 | 0 | 13541 | 50 | 6024830 |
| document | 3502729 | 0 | 39145 | 94 | 11069814 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
