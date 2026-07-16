# Phase timing — gate-collapse

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 570037 | 0 | 123149 | 158 | 7803727 |
| scout | 281728 | 0 | 32965 | 46 | 3585706 |
| research | 170987 | 0 | 26334 | 34 | 3071105 |
| spec | 344002 | 0 | 60297 | 42 | 4282964 |
| spec-shippability-review | 55489 | 0 | 6987 | 28 | 3228631 |
| tdd | 13262116 | 0 | 368425 | 806 | 145630765 |
| └ tdd:scenario | 705441 | 0 | 97812 | 140 | 18521379 |
| └ tdd:implement | 12521156 | 0 | 264537 | 648 | 122881746 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 35519 | 0 | 6076 | 18 | 4227640 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 239093 | 0 | 25795 | 74 | 17720990 |
| security | 329132 | 0 | 42616 | 82 | 20555669 |
| integrate | 216581 | 0 | 22272 | 68 | 17696845 |
| document | 348070 | 0 | 44223 | 102 | 27837546 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
