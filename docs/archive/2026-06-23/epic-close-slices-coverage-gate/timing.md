# Phase timing — epic-close-slices-coverage-gate

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 958407 | 0 | 107789 | 3150 | 22427337 |
| └ tdd:scenario | 741887 | 0 | 84444 | 2523 | 13534590 |
| └ tdd:implement | 104142 | 0 | 6636 | 22 | 2105658 |
| └ tdd:verify | 100254 | 0 | 11183 | 589 | 5165887 |
| └ tdd:finalize | 12124 | 0 | 5526 | 16 | 1621202 |
| simplify | 87154 | 0 | 12744 | 28 | 2881385 |
| security | 74246 | 0 | 11045 | 22 | 2328851 |
| integrate | 443728 | 0 | 14038 | 2800 | 6651769 |
| document | 124873 | 0 | 15240 | 1653 | 4950591 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
