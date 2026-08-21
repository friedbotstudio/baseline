---
key: code-structure-line-budget-needs-a-file-kind-carve-out-7e2c
category: backlog
scope: [simplify, integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-21
raised-in-context: unsanitised-path-pair
verified-at: a163ec5
last-touched: 2026-08-21
governs: .claude/skills/code-structure/oracle.mjs
deferred: risk
---

> The durable fix, and its own workflow: a file-kind dimension on the budget, decided from a census rather than picked.

- **The defect.** `code-structure/oracle.mjs` applies one 80-substantive-line budget to every changed file, and the only relief is `isInheritedDebt`, which asks whether the file was ALREADY over budget at HEAD. That makes the budget bind hardest on the file kinds it was never written for.
- **Measured 2026-08-21.** 241 of 434 test files in this repository exceed 80 substantive lines, so the rule is already unenforced there in practice. It fires only on the ones a branch happens to touch, which is arbitrary rather than principled.
- **Page templates behave the same way.** A marketing page's length is a function of how much it has to say, and it has no Orchestration / Domain / Foundation layers to split along, so the oracle's `suggested_fix` is not actionable on it.
- **Proposal.** A file-kind dimension on the budget: source modules keep 80; tests and page templates get their own number or an explicit exemption. The number is decided from a census of the tree, not picked.
- **Cost of not doing it.** Every branch touching a test or a template pays a BLOCKER whose only remedies are a cosmetic trim or a deferral entry. This branch paid exactly that: [[two-files-land-over-the-line-budget-2026-08-21-a3f5]].
