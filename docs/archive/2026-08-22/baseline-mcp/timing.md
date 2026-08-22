# Phase timing — baseline-mcp

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| intake | 0 | 0 | n/a | n/a | n/a |
| scout | 143875 | 0 | 25773 | 46 | 5358124 |
| research | 204297 | 0 | 33056 | 56 | 7113434 |
| spec | 2878570 | 0 | 57199 | 48 | 6750435 |
| spec-shippability-review | 137750 | 0 | 13333 | 32 | 4892166 |
| roadmap-sync | 31979 | 0 | 3073 | 20 | 3399852 |
| memory-sync | 81776 | 0 | 10101 | 34 | 5963642 |
| implementation | 253191888 | 0 | 188131 | 514 | 75846795 |
| simplify | 268721 | 0 | 19846 | 38 | 4535699 |
| security | 187730 | 0 | 16494 | 38 | 5111992 |
| integrate | 10230980 | 0 | 85481 | 228 | 37130583 |
| └ integrate:attempt-2 | 0 | 0 | -43145 | -92 | -16179786 |
| document | 1771071 | 0 | 75830 | 152 | 30225888 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
