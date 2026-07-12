# Phase timing — unified-execution-roadmap

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| chore | 505402 | 0 | 66884 | 157 | 13462412 |
| verify | 0 | 0 | 0 | 0 | 0 |
| simplify | 0 | 0 | 0 | 0 | 0 |
| integrate | 252526 | 0 | 14548 | 36 | 3360978 |
| document | 609557 | 0 | 44765 | 90 | 8921619 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
