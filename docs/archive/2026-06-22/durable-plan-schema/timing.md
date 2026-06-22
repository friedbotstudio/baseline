# Phase timing — durable-plan-schema

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 1085834 | 0 | 128471 | 3376 | 5942682 |
| scout | 437016 | 0 | 30423 | 2563 | 3627381 |
| research | 146773 | 0 | 26670 | 32 | 2856473 |
| spec | 296291 | 0 | 61689 | 1559 | 4881204 |
| spec-shippability-review | 36418 | 0 | 3994 | 20 | 2230826 |
| swarm-plan | 188153 | 0 | 44590 | 1058 | 6224872 |
| swarm-dispatch | 1838041 | 0 | 311888 | 23357 | 48247427 |
| simplify | 218526 | 0 | 38933 | 4436 | 14597796 |
| tdd | 120797 | 0 | 17279 | 22 | 4723394 |
| security | 47354 | 0 | 5663 | 8 | 1745616 |
| integrate | 256271 | 0 | 16060 | 603 | 8040415 |
| document | 94348 | 0 | 14877 | 32 | 7241283 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
