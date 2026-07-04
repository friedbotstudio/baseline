# Phase timing — erp-portables-slice-c

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1916950 | 0 | 242109 | 14126 | 61726565 |
| └ tdd:scenario | 747316 | 0 | 117328 | 5119 | 17887175 |
| └ tdd:implement | 1016923 | 0 | 115674 | 8971 | 38125277 |
| └ tdd:verify | 125469 | 0 | 6881 | 24 | 3800849 |
| └ tdd:drift-check | 27242 | 0 | 2226 | 12 | 1913264 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 259171 | 0 | 12208 | 44 | 7108936 |
| security | 78635 | 0 | 11441 | 22 | 3627821 |
| integrate | 442895 | 0 | 11656 | 523 | 7099822 |
| document | 205724 | 0 | 29665 | 1038 | 13529781 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
