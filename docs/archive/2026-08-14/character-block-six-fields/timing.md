# Phase timing — character-block-six-fields

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 606911 | 0 | 94336 | 146 | 8843014 |
| spec-shippability-review | 54738 | 0 | 5699 | 26 | 2248345 |
| tdd | 9501.948486328125 | 2325481.051513672 | 78686 | 216 | 58324121 |
| └ tdd:scenario | 9501.948486328125 | 0 | 78686 | 216 | 58324121 |
| └ tdd:implement | 0 | 0 | 0 | 0 | 0 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 407646 | 0 | 9403 | 48 | 19393970 |
| security | 103678 | 0 | 15421 | 26 | 10692242 |
| integrate | 203371 | 0 | 5053 | 18 | 7462665 |
| document | 69719 | 0 | 4244 | 20 | 8326785 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
