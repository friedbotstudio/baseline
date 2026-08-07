# Phase timing — corpus-recall-reachability

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 0 | 0 | 0 | 0 | 0 |
| spec-shippability-review | 65905 | 0 | 7436 | 28 | 4249318 |
| tdd | 896007.1499023438 | 756270.8500976562 | 189005 | 414 | 89260218 |
| └ tdd:scenario | 852613.1499023438 | 0 | 186117 | 394 | 83937984 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 29228 | 0 | 2659 | 18 | 4789173 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 109031 | 0 | 11479 | 40 | 10748629 |
| security | 159030 | 0 | 19830 | 40 | 11061022 |
| integrate | 160946 | 0 | 7073 | 30 | 8595341 |
| document | 335900 | 0 | 31538 | 88 | 26007696 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
