# Phase timing — erp-portables-slice-b

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1217905 | 0 | 201495 | 24818 | 40719172 |
| └ tdd:scenario | 531129 | 0 | 100884 | 13377 | 12185051 |
| └ tdd:implement | 484123 | 0 | 76381 | 11328 | 19130122 |
| └ tdd:verify | 81424 | 0 | 12674 | 38 | 4745573 |
| └ tdd:design-ui | 103808 | 0 | 6796 | 65 | 3352211 |
| └ tdd:drift-check | 17421 | 0 | 4760 | 10 | 1306215 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 93181 | 0 | 11658 | 40 | 5601171 |
| security | 58963 | 0 | 7991 | 12 | 1658495 |
| integrate | 765040 | 0 | 12166 | 2150 | 7412464 |
| document | 123714 | 0 | 17939 | 2694 | 7769643 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
