---
key: fanout-changedfiles-omits-untracked-files-6b07
category: backlog
scope: [integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/harness/assemble-context.mjs
deferred: risk
---

> A gate whose verdict is indistinguishable from a real one when its input is short. The module's own header documents that failure class; this is another instance of it.

- **The defect.** `assemble-context.mjs` builds the code-review fan-out's `changedFiles` from `git diff --name-only HEAD`, which lists tracked modifications only. Every file a change CREATES is untracked until it is staged, so the checkers never see it.
- **Measured** on the `unsanitised-path-pair` run, 2026-08-21. The fan-out measured 25 tracked files and returned BLOCKED on two, while `tests/unsanitised-path-sinks.test.mjs` (128 substantive lines, no prior) and `tests/site-constitutional-claims.test.mjs` (81, no prior) sat unmeasured on disk. Both are new, so `isInheritedDebt` returns false and both would have been BLOCKERs.
- **Why it is quiet.** `inputState` reads `measured`, not `no-input`, because the input was non-empty. Nothing in the verdict signals that it was short.
- **Fix shape.** Union in `git ls-files --others --exclude-standard`, with `prior: null` for each, which is the value `hydrateChangedFile` already assigns when `git show HEAD:<path>` throws.
- **Consequence carried by** [[two-files-land-over-the-line-budget-2026-08-21-a3f5]].
