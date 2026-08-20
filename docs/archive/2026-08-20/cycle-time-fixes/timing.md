# Phase timing — cycle-time-fixes

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1118168 | 0 | 58253 | 174 | 14178990 |
| simplify | 340174 | 0 | 6156 | 36 | 3466581 |
| security | 55747 | 0 | 8415 | 20 | 2027859 |
| integrate | 274934 | 0 | 1937 | 12 | 1262773 |
| document | 720242 | 0 | 7096 | 32 | 3449156 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
