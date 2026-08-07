---
key: a-synthesizing-writer-erases-fields-its-arguments-cannot-carry
category: landmines
scope: [implement, simplify, security]
governs: .claude/skills/workspace/shards.mjs
load_bearing: true
verified-at: 9235a23
last-touched: 2026-08-07
---

- Path: `.claude/skills/workspace/shards.mjs → writeDiagramShard`, and any writer whose output is "a pure function of the arguments".
- Landmine: **a writer that synthesizes its whole output silently deletes every field its parameter list cannot express. Routing existing data through it is a destructive migration wearing the costume of a backfill.**

**Measured 2026-08-07, epic `system-spec-delta` slice D**, before the backfill ran. The slice's instruction was to "write each named shard's real kind through `writeDiagramShard`" — 112 shards, one added annotation each, apparently mechanical. `writeDiagramShard` emitted `Component(alias, "label", "kind")`: C4's **technology** argument filled with the **diagram kind**, and no `descr` argument at all. The live shards were `Component(alias, "anchor", "technology", "title")`. Running the instruction literally would have rewritten all 112 into the three-argument form.

**What each argument was worth, measured before deciding:**

| C4 argument | recoverable from the element record? |
|---|---|
| 2 — label | yes, equals `anchor:` in 112/112 |
| 4 — descr | yes, equals `title:` in 112/112 |
| **3 — technology** | **no** — 61 shards say `component`, **51 say `subsystem`**, every record says `kind: component` |

So two of three were derivable and one was not. The `subsystem` distinction in those 51 shards exists **nowhere else on disk** — not in the record, not in the concept, not in a config. A three-argument rewrite would have destroyed it with no error, no failing test, and a diff that reads as 112 tidy one-line additions.

**Why it nearly happened.** The writer's own docblock says "Idempotent by construction: the output is a pure function of the arguments, so re-running a backfill rewrites identical bytes." That claim is true **only for shards the writer itself authored**. For anything authored elsewhere it inverts: purity is exactly what guarantees the foreign fields do not survive. The docblock reads as reassurance and is, for the wrong population.

- **The check that catches it, and it is cheap.** Before routing existing files through a writer, diff one file's parsed arguments against what the writer would emit for it. If any field has no parameter to land in, the writer is lossy for that population — extend the writer or do not use it. The fix here was two optional fields (`technology` defaulting to `kind`, `description` omitted when absent), which kept the writer's prior output byte-identical and made the legacy form round-trip.
- **The test that proves it stayed fixed.** `tests/system-spec-delta-kind-backfill.test.mjs → test_when_backfilled_shard_is_rewritten_from_its_own_arguments_then_bytes_identical` reads every live shard's arguments back out, re-writes them into a throwaway corpus, and asserts byte-equality. A corpus-wide idempotence assertion is the only one that distinguishes a backfill that CONVERGED on the writer from one that was hand-approximated — the latter passes every state assertion and then gets silently rewritten by the next real write.
- Sibling: [[materialize-appends-blank-lines-every-run]] and [[sweep-auto-close-round-trips-entries-and-drops-unknown-fields]] are the same defect class — a round-trip that does not preserve its input. Those two were caught after they shipped; this one was caught before, by measuring the arguments instead of trusting the instruction.
