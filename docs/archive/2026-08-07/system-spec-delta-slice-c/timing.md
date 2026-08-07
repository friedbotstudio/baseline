# Phase timing — system-spec-delta-slice-c

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1867087 | 0 | 142106 | 338 | 37255241 |
| └ tdd:scenario | 479884 | 0 | 60103 | 170 | 14725725 |
| └ tdd:implement | 1392472 | 0 | 82222 | 170 | 22821916 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 0 | 0 | 0 | 0 | 0 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 123553 | 0 | 11127 | 42 | 6248683 |
| security | 351017 | 0 | 29500 | 62 | 9784278 |
| integrate | 348600 | 0 | 6582 | 26 | 4290612 |
| document | 108502 | 0 | 11790 | 920 | 7471569 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
