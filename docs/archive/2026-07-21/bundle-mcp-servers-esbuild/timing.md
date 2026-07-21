# Phase timing — bundle-mcp-servers-esbuild

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 1141821 | 0 | 108302 | 142 | 9293294 |
| spec-shippability-review | 57317 | 0 | 5492 | 32 | 3231394 |
| tdd | 1289808 | 0 | 192912 | 324 | 47817368 |
| └ tdd:scenario | 415118 | 0 | 75300 | 105 | 13454672 |
| └ tdd:implement | 653505 | 0 | 78738 | 159 | 24404391 |
| └ tdd:verify | 79665 | 0 | 3692 | 12 | 1969464 |
| └ tdd:drift-check | 141520 | 0 | 35182 | 48 | 7988841 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 73230 | 0 | 6196 | 36 | 6159703 |
| security | 100671 | 0 | 14746 | 24 | 4196796 |
| integrate | 121451 | 0 | 6842 | 30 | 5376287 |
| document | 60097 | 0 | 7142 | 26 | 4740570 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
