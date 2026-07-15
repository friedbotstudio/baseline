# Phase timing — non-ui-oracle-c5

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| spec | 504391 | 0 | 139864 | 144 | 23707117 |
| spec-shippability-review | 0 | 0 | 0 | 0 | 0 |
| tdd | 936614.1408691406 | 10621607.85913086 | 180832 | 303 | 87809733 |
| └ tdd:scenario | 160453.14086914062 | 0 | 99474 | 155 | 41811005 |
| └ tdd:implement | 725271 | 0 | 75751 | 128 | 39568767 |
| └ tdd:verify | 0 | 0 | 0 | 0 | 0 |
| └ tdd:drift-check | 50890 | 0 | 5607 | 20 | 6429961 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 44344 | 0 | 5253 | 20 | 6453588 |
| security | 52709 | 0 | 8607 | 18 | 5826582 |
| integrate | 106579 | 0 | 3146 | 18 | 5855702 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
