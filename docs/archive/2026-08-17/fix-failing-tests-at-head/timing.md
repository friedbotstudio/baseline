# Phase timing — fix-failing-tests-at-head

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| chore | 920362 | 0 | 42565 | 112 | 18552979 |
| verify | 0 | 0 | 0 | 0 | 0 |
| simplify | 482525 | 0 | 9099 | 26 | 5675044 |
| integrate | 348734 | 0 | 5709 | 20 | 4497581 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
