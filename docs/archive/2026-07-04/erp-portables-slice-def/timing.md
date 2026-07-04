# Phase timing — erp-portables-slice-def

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1553909 | 0 | 237172 | 18786 | 49124244 |
| └ tdd:scenario | 656464 | 0 | 127669 | 7995 | 15198249 |
| └ tdd:implement | 780793 | 0 | 95661 | 10749 | 28141267 |
| └ tdd:verify | 100578 | 0 | 13080 | 38 | 5228882 |
| └ tdd:drift-check | 17691 | 0 | 6150 | 16 | 2227680 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 67681 | 0 | 14305 | 42 | 5892353 |
| integrate | 93809 | 0 | 5834 | 26 | 3736256 |
| document | 271546 | 0 | 23168 | 1013 | 8675275 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
