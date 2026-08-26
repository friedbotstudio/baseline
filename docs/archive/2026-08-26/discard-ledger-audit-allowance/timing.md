# Phase timing — discard-ledger-audit-allowance

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2448949 | 0 | 67642 | 184 | 11851173 |
| simplify | 542954 | 0 | 10918 | 34 | 3117478 |
| security | 47572 | 0 | 3073 | 12 | 1211230 |
| integrate | 771705 | 0 | 7376 | 22 | 2315782 |
| document | 86433 | 0 | 8595 | 38 | 4260443 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
