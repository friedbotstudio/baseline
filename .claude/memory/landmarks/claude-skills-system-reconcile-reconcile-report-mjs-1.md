---
key: .claude/skills/system-reconcile/reconcile-report.mjs:1
category: landmarks
scope: [scout, spec, tdd, archive, memory-sync]
governs: .claude/skills/system-reconcile/reconcile-report.mjs,.claude/skills/system-reconcile/SKILL.md
source: inferred-from-code
verified-at: 3c08c8a
last-touched: 2026-08-26
---

- Role: the corpus health report behind `/system-reconcile`. Composes seven checks over `docs/system/` into one result — `gaps`, `stale`, `dangling`, `duplicateAnchors`, `orphanShards`, `unillustrated`, `missingKind`. Landed by `system-spec-delta-slice-b` (epic `system-spec-delta`, slice B).
- **It reimplements nothing.** Every check but one was already written and had no production caller: `coverage.findGaps`, `reconcile.classify` (whose `stale`/`dangling` verdict states are read off ONE pass, not computed twice), `reconcile.repairAfterMerge`, `render.findOrphanShards`, `shards.findUnillustrated`. Only `findMissingKind` is new. Composing orphaned APIs was the whole change; a second copy of a rule drifts from the first.
- **Every export is read-only, and that is load-bearing, not incidental.** Spec decision D9: a repair path callable from a workflow phase would break `corpus-has-one-writer-archive-on-the-primary-tree-2026-08-06`. Repairs happen through the human-confirmed procedure in `SKILL.md`, using writers that already exist. `tests/system-spec-delta-shard-writer.test.mjs:377` source-scans for eight writer names, so adding one fails loudly.
- Three exports as of 2026-08-26, not one: `runReconcile`, plus `reconcileForGate` and `gatingFailures`, which the `/archive` Step 5.5 gate added. This entry read "`runReconcile` is the sole export" and claimed a test asserted that list; no such assertion exists — `tests/cli-dispatchers.test.mjs:120` only requires `runReconcile` to remain importable. The read-only invariant is what the writer-name scan actually defends.
- `missingKind` counts only elements that HAVE a shard whose `' @kind` is absent. An element with no shard at all belongs to `unillustrated` alone — counting it in both makes the two arrays sum to more than the corpus and hands the operator the same gap twice under two names.
- First live run over this repo returned `missingKind: 112` — every shard predating the annotation. That is exactly the backfill slice D exists to do, and it is now measurable rather than assumed.
- Caveat: the `catch` returns seven empty arrays, so **clean**, **flag-off**, and **crashed** are indistinguishable in the return value. A stderr line was added as the interim trace; the real fix is a `{reportable, reason}` discriminator, which changes the shape AC-008 fixes at seven arrays and so is scoped to slice C. Recorded as MEDIUM in `docs/archive/2026-08-07/system-spec-delta-slice-b/security.md`. Same family as [[a-check-that-measured-nothing-reports-success]].
- Caveat: covered by the `system-reconcile-report` corpus element's **glob** anchor (`.claude/skills/system-reconcile/*.mjs`), so like [[claude-skills-workspace-delta-mjs-61]] it carries no `anchor_digest` and nothing witnesses it.
