---
key: the-rightsize-baseline-assumes-you-armed-before-you-edited
category: landmines
load_bearing: true
scope: []
governs: .claude/skills/harness/rightsize-gate.mjs, .claude/skills/harness/SKILL.md
verified-at: 75cb997
last-touched: 2026-08-26
---

- **The trap.** `/harness` preflight step 6a snapshots every already-dirty path into `workflow.json → rightsize_base[]`, and the gate later excludes those paths from its measure. The SOP states the assumption plainly — "the workflow's real source/test files, written later by `/tdd`, are created after the snapshot and are always measured" — but nothing enforces the ordering. Arm the harness AFTER writing code and the snapshot swallows the entire change.
- **It fails toward skipping, which is the dangerous direction.** The gate then measures `{"files":0,"lines":0}` and returns `skip: ["simplify","document"]`. A zero measure is indistinguishable from a genuinely tiny change, so the gate reports success and proposes dropping two phases. Nothing warns.
- **Observed 2026-08-26 on `discard-ledger-audit-allowance`.** The fix was written first and `/harness` invoked afterwards, so `rightsize-gate check` returned `{"skip":["simplify","document"],"keep":["security"],"measured":{"files":0,"lines":0,"touched":[]}}` over a diff of five files. The skip was discarded by hand and both phases run; `/simplify` then found two real cleanups and the code-review fan-out a third. Logged at `.claude/state/harness/discard-ledger-audit-allowance.log`.
- **How to avoid it.** Arm the harness before the first edit, which is what the SOP intends. When you cannot — an ad-hoc fix that becomes a workflow — read `measured` before accepting any skip, and treat `files: 0` against a non-empty diff as proof the baseline is wrong rather than as a small change. `git status --short` at arm time is the check: anything already dirty that this workflow authored is about to be excluded from its own measure.
- **A fail-open default is only safe when the failure direction is more work.** Here the flag is on by default and the failure direction is less. That asymmetry is what makes an unenforced ordering assumption expensive; see [[an-optimizations-skip-condition-can-never-fire]] for the sibling shape, where the wrong signal made a guard useless rather than unsafe.
