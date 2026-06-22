# Phase timing — checker-fanout-live-wiring

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1032884 | 0 | 193961 | 6406 | 26885073 |
| └ tdd:scenario | 776076 | 0 | 163455 | 4770 | 15992510 |
| └ tdd:implement | 187698 | 0 | 23511 | 1600 | 6803806 |
| └ tdd:verify | 52273 | 0 | 5247 | 28 | 3174496 |
| └ tdd:finalize | 16837 | 0 | 1748 | 8 | 914261 |
| simplify | 67429 | 0 | 6593 | 34 | 3935444 |
| security | 67723 | 0 | 8763 | 22 | 2609163 |
| integrate | 125852 | 0 | 4179 | 36 | 4390570 |
| document | 80116 | 0 | 10116 | 32 | 3989735 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
