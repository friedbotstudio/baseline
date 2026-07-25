# Phase timing — slug-guard-hoist-and-consent-expiry

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 526896 | 0 | 83253 | 152 | 11078321 |
| spec-shippability-review | 80876 | 0 | 8249 | 36 | 3558007 |
| tdd | 32084440 | 0 | 145210 | 392 | 55172367 |
| └ tdd:scenario | 31116065 | 0 | 77357 | 152 | 18021886 |
| └ tdd:implement | 877308 | 0 | 59387 | 198 | 30187470 |
| └ tdd:verify | 56274 | 0 | 4105 | 24 | 3964143 |
| └ tdd:drift-check | 28682 | 0 | 4361 | 18 | 2998868 |
| └ tdd:finalize | 7310 | 0 | 802 | 4 | 668874 |
| simplify | 211707 | 0 | 19589 | 82 | 14129211 |
| security | 8353177 | 0 | 23008 | 34 | 6102951 |
| integrate | 119669 | 0 | 12074 | 38 | 5334915 |
| document | 187251 | 0 | 21752 | 62 | 12033454 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
