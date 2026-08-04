---
key: .claude/skills/workspace/seed-elements.mjs:1
category: landmarks
scope: any
governs: .claude/skills/workspace/seed-elements.mjs,.claude/memory/workspace/**
load_bearing: true
verified-at: 7f89385
last-touched: 2026-08-04
---

- Path: `.claude/skills/workspace/seed-elements.mjs`. Exports `SEED_OPS` — the 14 typed `add` operations that populate `.claude/memory/workspace/elements/`.
- **Transcribed from the four LIVE specs only.** 618 of the repository's 644 `Component(` declarations live in archived specs describing superseded designs; importing them would have built a model mostly wrong about the present. 26 declared, 17 resolve on disk, **14 addressable**.
- **17 resolve but only 14 are addressable, and that gap is the finding.** The corpus addresses by path; specs describe more finely. Two groups collapse: three CI jobs share `.github/workflows/release.yml`, and the phase + path triggers both live in `process_lifecycle_guard.mjs`. Each merges into one element whose `title` names everything it covers.
- **Every anchor must be unique, and it is not cosmetic.** `detectConflicts` compares an op against the PRE-EXISTING corpus and never against its sibling ops, so same-anchor siblings apply cleanly the first time and then reject the ENTIRE contribution atomically on every re-apply. A duplicate is silent until it is permanent. `tests/workspace-seed.test.mjs` asserts uniqueness and names the offenders on failure.
- Every `governed_by`/`rests_on` key was proven to resolve before being written (epic D4). An invented key makes `resolveRefs` refuse the element, which refuses the contribution.
- Verification also repaired two drifted specs: `living-system-model` named `index/build.mjs` and `index/summarize.mjs`, neither ever built; `release-workflow` declared 5 CI jobs where the live YAML has 3.
- **Defining `SEED_OPS` is not seeding.** The live corpus stayed empty until `applyContribution` was run against `.claude/memory` — see [[a-cycle-that-adds-a-gate-must-assert-the-consumer-calls-it]].
