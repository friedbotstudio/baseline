---
key: delta-fold-writes-a-degraded-shard-for-every-new-element-7f3a
category: backlog
scope: [archive, spec]
status: open
source: assistant-deferral
raised-on: 2026-08-24
raised-in-context: staleness-witness
verified-at: 2542786
last-touched: 2026-08-24
governs: .claude/skills/workspace/delta.mjs, .claude/skills/workspace/shards.mjs
deferred: dependency
---

> The fold added one element and the corpus guard went red on the shard it wrote.

- **The defect.** `delta.mjs:257` calls `writeDiagramShard(specDir, row.elementId, { kind: row.kind, rootDir })` — `kind` and nothing else. For an element that already has a shard, `mergedFields` preserves the real label, technology and description. For a NEW element there is no existing shard, so the defaults land: `label = elementId`, `technology = kind`, `description = null`. A null description drops the fourth argument and the line renders as the three-argument form.
- **Two shipped guards contradict each other on this path.** `test_when_no_shard_exists_then_label_and_technology_take_their_defaults` pins the defaults; `test_when_the_corpus_is_scanned_then_no_shard_carries_the_three_argument_form` (AC-007) forbids what those defaults produce. Neither is wrong on its own — the defaults were written to stop a rewrite destroying an existing shard, and that repair never covered the fresh-shard case.
- **Measured** on `staleness-witness`, 2026-08-24. The fold wrote `Component(staleness_predicate, "staleness-predicate", "c4_component")`; the shard was hand-corrected to the four-argument form in that cycle's diff.
- **The fold already holds what it needs.** The same loop writes the element file, so the anchor and the title are both in hand; passing them through as `label` and `description` is the whole fix.
- **Fix this with [[spec-less-tracks-leave-new-modules-unwitnessed-c5d1]].** Both live on the delta path and both concern how a new element enters the corpus.
