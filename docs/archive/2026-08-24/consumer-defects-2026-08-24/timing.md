# Phase timing — consumer-defects-2026-08-24

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 0 | 0 | 0 | 0 | 0 |
| spec-shippability-review | 481689 | 0 | 8347 | 34 | 5760880 |
| tdd | 0 | 28719661.572509766 | 327047 | 910 | 133508953 |
| └ tdd:scenario | 0 | 0 | 108826 | 178 | 46055123 |
| └ tdd:implement | 6383626 | 0 | 163655 | 580 | 62048298 |
| └ tdd:verify | 3706318 | 0 | 28265 | 88 | 14210443 |
| └ tdd:drift-check | 8467367 | 0 | 26301 | 64 | 11195089 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 144333 | 0 | 14462 | 44 | 8437329 |
| security | 3313895 | 0 | 101207 | 228 | 49139655 |
| integrate | 3730598 | 0 | 51958 | 136 | 33920839 |
| document | 418258 | 0 | 55810 | 126 | 35255253 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
