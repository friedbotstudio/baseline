# Phase timing — audit-flake-writer-isolation

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 2029335 | 0 | 129522 | 412 | 49936054 |
| └ tdd:scenario | 723472 | 0 | 64828 | 180 | 16944739 |
| └ tdd:implement | 1266513 | 0 | 63715 | 226 | 31959893 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 39350 | 0 | 979 | 6 | 1031422 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 285939 | 0 | 11334 | 60 | 10631881 |
| security | 147016 | 0 | 5655 | 20 | 3659399 |
| integrate | 215696 | 0 | 5104 | 28 | 5231454 |
| document | 348023 | 0 | 36883 | 92 | 18182174 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
