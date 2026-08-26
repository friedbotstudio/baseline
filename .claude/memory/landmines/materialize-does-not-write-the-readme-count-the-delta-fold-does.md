---
key: materialize-does-not-write-the-readme-count-the-delta-fold-does
category: landmines
load_bearing: true
scope: []
governs: .claude/skills/workspace/materialize.mjs, .claude/skills/workspace/delta.mjs, docs/system/README.md
verified-at: 75cb997
last-touched: 2026-08-26
---

- **The trap.** `docs/system/README.md` carries a Count column, and its own prose says the fold maintains it: "`verifyAndApplyDelta` writes that column. It counts the directory again on every confirmed `add` row it applies, in the same call, so the fold cannot leave its own README wrong." True, and it covers exactly one of the two ways an element gets created.
- **The other path is the documented one.** [[new-governed-files-are-anchored-at-the-concept]] tells you to add the anchor to the concept and run `materialize({specDir, rootDir})` directly. `materialize.mjs` contains no reference to the README at all — grep it — so following the convention leaves the count stale, and the prose above reads as though it could not happen.
- **Observed 2026-08-26.** Anchoring `.claude/skills/archive/*.mjs` into `harness-loop` and running materialize took `elements/` and `diagrams/` to 127 while the README still claimed 126. `tests/workspace-readme-gate.test.mjs` failed with `[{"directory":"elements","documented":126,"actual":127},{"directory":"diagrams","documented":126,"actual":127}]`.
- **Cost is low and the reason matters.** `readme-gate.mjs` checks both directions and fails the suite, so the stale count cannot reach a commit. The landmine is not the outcome, it is the wasted loop: the convention sends you down a path its own README says is self-maintaining, and the correction arrives as a red suite rather than at the point of the edit.
- **How to avoid it.** After any direct `materialize` call, re-measure the Count column by hand: `ls docs/system/elements/*.md | wc -l` and the same for `diagrams/*.puml`. Do not read the README's self-description as a guarantee that covers your path.
- **General shape.** A file that documents its own maintenance mechanism describes the caller the author had in mind, not every caller. Same class as [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]].
