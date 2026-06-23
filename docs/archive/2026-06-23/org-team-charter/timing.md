# Phase timing — org-team-charter

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 1500295 | 0 | 199234 | 5291 | 13766865 |
| spec-shippability-review | 51765 | 0 | 4146 | 1406 | 2516683 |
| tdd | 3342223 | 0 | 422872 | 30199 | 116721955 |
| └ tdd:scenario | 575006 | 0 | 117570 | 2905 | 13859856 |
| └ tdd:implement | 2697462 | 0 | 298961 | 27266 | 96458468 |
| └ tdd:verify | 51171 | 0 | 2502 | 12 | 2739781 |
| └ tdd:drift-check | 18584 | 0 | 3839 | 16 | 3663850 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 116319 | 0 | 13078 | 44 | 10177678 |
| security | 945640 | 0 | 8929 | 591 | 6577824 |
| integrate | 170016 | 0 | 9665 | 30 | 7145123 |
| document | 429972 | 0 | 39308 | 2893 | 17728876 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
