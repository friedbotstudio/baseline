---
key: untracked-files-are-invisible-to-every-code-review-checker-7f21
category: backlog
scope: [integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: changedfiles-shape-contract
verified-at: 2367f5e
last-touched: 2026-08-20
governs: .claude/skills/harness/assemble-context.mjs
deferred: risk
---

> The gate is weaker than the spec implies until it is addressed.

- **The defect.** `assembleChangedFiles` probes with `git diff --name-only HEAD`, which does not list untracked paths. A file this change created reaches no code-review checker at all.
- **Measured on the workflow that found it.** `changedfiles-shape-contract` added a 379-line test file and a 383-line spec; neither appeared in `ctx.changedFiles`, so neither was measured by `code-structure`.
- **What it costs.** D2 gives a new file the BLOCKER severity, because its length is debt the change itself created. That branch of AC-003 is unit-tested and cannot fire through the live producer — the only severity the gate reaches in practice is the inherited one.
- **Why it was left.** D1 deliberately kept `assembleChangedFiles` as an honest name for the `git diff --name-only` probe, and `tests/checker-fanout.test.mjs:166` pins its `string[]` return. Widening the probe changes what the workflow means by "changed" and belongs in its own spec.
- **Fix shape.** Union the probe with `git ls-files --others --exclude-standard`, then decide what `prior` means for a path with no HEAD version (today: `null`, which is already the new-file signal).
- Sibling of [[1. `ctx.changedFiles` has two readers that disagree on its shape]].
