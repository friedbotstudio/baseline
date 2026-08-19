---
key: a-synthesizing-writer-erases-fields-its-arguments-cannot-carry
category: landmines
load_bearing: true
scope: [implement, simplify, security]
governs: .claude/skills/workspace/shards.mjs
verified-at: 69c3259
last-touched: 2026-08-19
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
- Sibling: [[materialize-appends-blank-lines-every-run]] and [[sweep-auto-close-round-trips-entries-and-drops-unknown-fields]] are the same defect class — a round-trip that does not preserve its input.

**The 2026-08-07 fix was half a fix, and the other half cost 19 shards.** This entry used to close by saying the defect was caught before it shipped. It was not. Making the writer *able* to carry `technology` and `description` left every CALLER free to omit them, and `delta.mjs`'s `/archive` path passed only `{kind, rootDir}`. Each archive run therefore rewrote its touched shard into the exact three-argument form measured above, one workflow at a time, until 19 of 116 carried the damage. `0d8e776` degraded two; the run that produced this correction found two more already dirty in the tree. Nothing failed, because a writer that renders faithfully from what it was given is not wrong at the sink.

**What the second half had to be.** Capability in the writer is not preservation; preservation has to be the DEFAULT. `writeDiagramShard` now reads the shard on disk and fills any field the caller omitted, so precedence runs caller, then existing, then the historical default — and a caller can only ever ADD information. The defaults that used to be the first choice are now the last. Ship that shape with the capability, or the capability is a parameter nobody passes.

- **Generalise it:** when you widen a lossy writer, ask what happens if the next caller omits the new parameter. If the answer is "the old data loss", you have moved the bug rather than fixed it.
- Repair path, for when this has already happened: git history is the only lossless source for a field that exists nowhere else on disk. `workspace restore-shards` walks it. The element record is a fallback for a shard that was never rich, never a primary — records carry no `techn`, so a record-first repair finishes what the defect started.
- Standing guard: `tests/corpus-shard-preservation.test.mjs` scans every live shard and fails on the three-argument form, so the class cannot recur silently a third time.
