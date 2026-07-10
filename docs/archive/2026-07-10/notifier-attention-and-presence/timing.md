# Phase timing — notifier-attention-and-presence

| Phase | Model (ms) | Human-wait (ms) | Tokens (out) | Tokens (in) | Tokens (cache) |
|---|---|---|---|---|---|
| tdd | 1119639 | 0 | 102903 | 12653 | 38546461 |
| └ tdd:scenario | 307027 | 0 | 73054 | 8761 | 17362118 |
| └ tdd:implement | 633238 | 0 | 28946 | 3880 | 18817325 |
| └ tdd:verify | 179374 | 0 | 903 | 12 | 2367018 |
| └ tdd:finalize | 0 | 0 | 0 | 0 | 0 |
| simplify | 223660 | 0 | 4423 | 30 | 5959017 |
| security | 131880 | 0 | 10693 | 22 | 4435584 |
| integrate | 486042 | 0 | 5061 | 908 | 8613742 |
| document | 87267 | 0 | 3992 | 420 | 4970746 |

_Model = machine time; Human-wait = idle at a consent gate. Tokens = per-phase output/input/cache-read deltas vs the run-start baseline anchor (n/a when the transcript was unavailable). The grant-commit gate and commit phase land after /archive and are not covered by this render._
