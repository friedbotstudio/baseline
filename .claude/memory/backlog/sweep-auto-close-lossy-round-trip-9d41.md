---
key: sweep-auto-close-lossy-round-trip-9d41
category: backlog
scope: [memory-flush]
status: open
raised-on: 2026-08-07
raised-in-context: epic-child-pin-and-delta-backticks (ad-hoc flush after the commit)
source: assistant-deferral
estimated-effort: small (preserve unknown frontmatter keys + drop the body-heading split) plus a round-trip test
verified-at: 1db3b6c
last-touched: 2026-08-07
---

> `--mode auto-close` reported `{"closed": 2}` and also rewrote 13 unrelated files and created 2 spurious shards. The report names only the closures, so the damage is invisible in the output.

**Two independent bugs in one path**, both in the parse-and-rewrite that `sweep.mjs --mode auto-close` performs on every entry it walks:

1. **Unknown frontmatter fields are demoted to prose.** `load_bearing: true` came back as a trailing `- load_bearing: true` body bullet on all 13 entries that carried it. `placement.annotationPlacementAllowed` reads it as a FIELD, so those entries silently stop authorizing annotation placement.
2. **A body `## ` heading is treated as an entry boundary.** In the sharded shape a file is one entry by construction, so the split has no legitimate case. It produced shards keyed by heading prose (spaces, em dash, colon) that `assertSafeFactKey` would reject, and stripped `scope:` / `governs:` / `verified-at:` / `last-touched:` off the parent — which by Step 4.6's own rule makes the parent unreachable at every trigger.

**The fix has a natural test.** Round-trip every shard in the live store through the parser and renderer and assert byte-identity, the same property that would have caught [[materialize-appends-blank-lines-every-run]] in the corpus writer. Both defects are one codec failing to preserve its input; a single property test covers both.

**Why it is not fixed inline.** It was found by running the skill after a commit had already landed, with no workflow open. Repairing a Step 0 actuator deserves its own scenarios rather than riding an ad-hoc flush, and the working tree was restored to HEAD bytes so nothing is currently corrupt.

**Related.** [[sweep-auto-close-round-trips-entries-and-drops-unknown-fields]] carries the measurement and the safe-revert recipe.
