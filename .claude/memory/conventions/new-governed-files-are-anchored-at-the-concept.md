---
key: new-governed-files-are-anchored-at-the-concept
category: conventions
scope: [archive, tdd, spec]
governs: .claude/skills/archive/SKILL.md,.claude/skills/workspace/contribute.mjs,.claude/skills/workspace/materialize.mjs,docs/system/concepts/**
verified-at: 5f52ba2
last-touched: 2026-08-27
---

- When a landing **adds** a file under `memory.architecture_map.governed_surface`, `/archive` Step 5's `syncBack` will not cover it. `syncBack` re-stamps elements whose anchors match the touched paths; a brand-new file matches no anchor, so it is reported as neither `applied` nor `proposed` — it simply opens a coverage gap that `findGaps` then reports as `unanchored`.
- The fix is authored **at the concept, never at the element**. Elements are materialized output: add `<element-id>=<anchor-glob>` to the owning concept's `anchors:` field (and the id to `members:`), then run `materialize({specDir: 'docs/system', rootDir: process.cwd()})`. Hand-writing an element file works until the next materialize, which rewrites it from the concept map — so a hand-written element without its concept declaration is deleted by the next run.
- Prefer an existing **glob** anchor over a new element when one already covers the directory. `.claude/skills/workspace/*.mjs` absorbed six new files across three cycles without a single corpus edit. A new element is right when the addition is a new *directory* (a new skill), not a new file in an existing one.
- Two things materialize gets wrong that you fix by hand afterwards: the new element's `title` defaults to the **concept's** title (`materialize.mjs:61` falls back to the concept declaration, which carries no per-element title), and the run appends blank lines to every element file ([[materialize-appends-blank-lines-every-run]]).
- The element then has no shard, so the corpus reports `unillustrated: 1`. That is advisory, not an error — but `tests/system-spec-relocation.test.mjs` asserts `elements === diagrams`, so in practice draw the shard: `writeDiagramShard(specDir, id, {kind, label, rootDir})`. That test also hardcodes the absolute corpus counts, so growing the corpus means updating three numbers in it.
- Sequence that worked end to end (2026-08-07, `system-spec-delta-slice-b` adding `.claude/skills/system-reconcile/`): concept `anchors:` + `members:` → `materialize` → fix the inherited title → `writeDiagramShard` → restore the blank-line churn → `findGaps` back to 0.
- Slice C's `applyDelta` is meant to automate exactly this from the spec's `## System delta` table. Until it lands, the concept edit is manual and belongs in the archive phase, which is the corpus's single writer.
