---
key: code-structure-oracle-has-no-test-file-exemption-3b8d
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-20
raised-in-context: changedfiles-shape-contract
verified-at: 2367f5e
last-touched: 2026-08-20
governs: .claude/skills/code-structure/oracle.mjs
deferred: risk
---

> Splitting one spec's tests across files buys no reader anything.

- **The gap.** `runCodeStructureOracle` measures every element of `ctx.changedFiles` against the 80-line module budget. It has no exemption list — not for tests, not for fixtures, not for generated code. `project.json → tdd.exempt_globs` governs TDD obligations, not this oracle.
- **Why it does not bite yet.** Test files are usually untracked on the branch that introduces them, so they never reach the oracle ([[untracked-files-are-invisible-to-every-code-review-checker-7f21]]). Fixing that blind spot makes this one live on the same day.
- **What it would do.** A new test file over 80 lines has `prior: null`, which D2 rates BLOCKER — the change created it. `tests/changedfiles-shape-contract.test.mjs` is 379 substantive lines covering ten ACs and would block its own landing.
- **The judgement to make.** The 80-line budget is a layer-discipline rule for modules. Whether a test file is a module in that sense is a real decision, not an oversight to patch — decide it before adding an exemption glob.
- `simplify` marked that file `clean` on 2026-08-20 for this reason, which is a human call the oracle currently cannot make.
