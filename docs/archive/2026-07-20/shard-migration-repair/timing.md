# Phase timing — shard-migration-repair

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 28105321 | 0 | n/a | n/a | n/a |
| spec-shippability-review | 48493 | 0 | 5646 | 24 | 2382309 |
| tdd | 3619655 | 0 | 240909 | 534 | 103658109 |
| └ tdd:scenario | 764925 | 0 | 96644 | 160 | 24459755 |
| └ tdd:implement | 2825282 | 0 | 141274 | 358 | 75406863 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 29448 | 0 | 2991 | 16 | 3791491 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 218213 | 0 | 13789 | 46 | 11128830 |
| security | 186120 | 0 | 30567 | 38 | 9528885 |
| integrate | 2474173 | 0 | 20651 | 74 | 17854871 |
| document | 185106 | 0 | 22141 | 46 | 12475796 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
