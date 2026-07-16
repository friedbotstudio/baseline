# Phase timing — gate-taxonomy

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 561493 | 0 | 139654 | 143 | 10568523 |
| scout | 137457 | 0 | 21882 | 42 | 4235195 |
| research | 113169 | 0 | 15902 | 36 | 3888386 |
| spec | 302694 | 0 | 56093 | 42 | 4866418 |
| spec-shippability-review | 50158 | 0 | 6765 | 28 | 3595899 |
| tdd | 646645 | 0 | 110442 | 187 | 29950213 |
| └ tdd:scenario | 289412 | 0 | 60952 | 97 | 14986326 |
| └ tdd:implement | 93160 | 0 | 17080 | 26 | 4214871 |
| └ tdd:verify | 102628 | 0 | 7818 | 24 | 3983121 |
| └ tdd:drift-check | 161445 | 0 | 24592 | 40 | 6765895 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 87314 | 0 | 11849 | 44 | 7671522 |
| security | 226355 | 0 | 30234 | 52 | 9367077 |
| integrate | 190680 | 0 | 22796 | 52 | 9713407 |
| document | 76789 | 0 | 11807 | 32 | 6141704 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
