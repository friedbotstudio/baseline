# Phase timing — manifest-scope-fix

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 0 | 0 | 0 | 0 | 0 |
| scout | 83195 | 0 | 13405 | 28 | 1755684 |
| spec | 157218 | 0 | 22086 | 70 | 5335460 |
| spec-shippability-review | 338944 | 0 | 3839 | 36 | 3143369 |
| tdd | 745138 | 0 | 16907 | 78 | 7347371 |
| └ tdd:scenario | 57270 | 0 | 7720 | 36 | 1831204 |
| └ tdd:implement | 648988 | 0 | 6066 | 32 | 3755695 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 38880 | 0 | 3121 | 10 | 1760472 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| security | 54232 | 0 | 5587 | 20 | 3560971 |
| integrate | 335021 | 0 | 2393 | 18 | 3282132 |
| document | 17708 | 0 | 1245 | 8 | 1476041 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
