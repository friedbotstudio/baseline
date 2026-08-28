---
key: a-spec-system-delta-kind-reaches-the-shard-writer-unchecked
category: landmines
scope: [spec, archive]
governs: .claude/skills/workspace/delta.mjs, .claude/skills/workspace/shards.mjs
surfaces-on: docs/specs/**, .claude/skills/workspace/**, docs/system/**
verified-at: e9a5893
last-touched: 2026-08-29
---

- Landmine: **the `Kind` column of a spec's `## System delta` table is written into the diagram corpus verbatim, and nothing validates it against the corpus vocabulary. A wrong token degrades shards that were already correct, and no gate objects.**

**Measured 2026-08-28**, on the `stale-keying-and-glob-scope` workflow. The spec declared `component` in all four `Kind` cells. The corpus's word for that annotation is `c4_component` — 123 of 128 shards said so. `delta.mjs:283` passes `row.kind` straight to `writeDiagramShard`, which writes `' @kind ${kind}` with no mapping and no check.

What that cost:

| Stage | What happened |
|---|---|
| `/spec-lint` | passed |
| gate A | passed |
| checker fan-out | CLEAN |
| `/archive` Step 3 | wrote `@kind component` into 4 shards, three of which had been correct |
| `/archive` Step 5.7 | 2 tests red, two phases after the typo was authored |

An unregistered kind binds `witness: none` rather than throwing, so the three rewritten elements silently stopped being witnessed. The corpus health gate at Step 5.5 passed on the same tree, because it reads different sections.

- **The element record and the diagram shard use different vocabularies on purpose.** All 128 element `.md` files carry `kind: component`; the `.puml` annotation carries `c4_component`. `row.kind` reaches only the shard writer, so the spec's `Kind` cell is the DIAGRAM kind and `c4_component` is what belongs there. Writing the element-record word into it is the mistake, and the two words are similar enough to look right.
- **Repairing it is not a hand-edit.** `/archive` Step 5.5 makes `docs/system/` byte-identical between Step 3 and the workflow's end, and Step 3 is the corpus's only writer. Correct the `Kind` cell, restore the spec to `docs/specs/`, re-run the delta, then re-archive. Re-running with the right token restored the three damaged shards to bytes identical to HEAD.
- **The check that would have caught it does not exist.** Nothing compares the `Kind` cell against the kinds the witness registry knows. That gap is [[the-kind-column-has-no-validator-and-nothing-notices-7c14]].
- Related: [[a-check-that-measured-nothing-reports-success]] — an unregistered kind binding `none` is the same shape, a degraded state that reads exactly like a healthy one.
