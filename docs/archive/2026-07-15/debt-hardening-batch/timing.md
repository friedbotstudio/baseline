# Phase timing — debt-hardening-batch

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 586604 | 0 | 117918 | 153 | 11830859 |
| spec-shippability-review | 53304 | 0 | 2164 | 20 | 2261804 |
| tdd | 375206.19140625 | 4779116.80859375 | 263058 | 372 | 59900420 |
| └ tdd:scenario | 0 | 0 | 78958 | 97 | 13354040 |
| └ tdd:implement | 4078976 | 0 | 150380 | 162 | 26157148 |
| └ tdd:verify | 435268 | 0 | 13271 | 61 | 10657164 |
| └ tdd:drift-check | 219081 | 0 | 20449 | 52 | 9732068 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 106852 | 0 | 7525 | 26 | 4966293 |
| security | 109677 | 0 | 18081 | 32 | 6220934 |
| integrate | 121711 | 0 | 6506 | 32 | 6372271 |
| document | 144803 | 0 | 18184 | 36 | 7307186 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
