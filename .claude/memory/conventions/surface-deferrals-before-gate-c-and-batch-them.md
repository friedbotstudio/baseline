---
key: surface-deferrals-before-gate-c-and-batch-them
category: conventions
scope: [security, simplify, integrate, document]
governs: .claude/skills/harness/SKILL.md, .claude/skills/security/SKILL.md, .claude/skills/commit/SKILL.md
source: user-feedback
verified-at: 05d8fec
last-touched: 2026-08-24
---

> bro, in future, I want you to highlight these "things" that we silently file in
> backlog before we commit. see, a workflow is costly and we need to strategies
> such that we can amortize on simplify, security, and document as much as
> possible... think, every workflow running its simplify, security, document,
> memory-sync, and archive route... multiply it to 10 tasks. what have we done?

- **Before yielding at gate C, list every deferral this workflow produced** —
  security findings not acted on, promoted backlog entries, punch-list items — and
  mark each ride-along or defer with a reason. Do not file one silently and mention
  it after the commit.
- **Why: a deferral does not save the deferred work's cost, it adds a full
  mechanical tail.** `security` + `integrate` + `archive` + `memory-sync` + gate C
  are per-workflow fixed cost, paid identically for a one-line fix and a large one.
  Measured on `planner-cli-output` (2026-08-20, commit b93a5e4): 1,218s model time
  and 8.5M cache reads for a 10-line diff; security 61s + integrate 456s of that.
- **Ride-along default:** a finding whose file is already in the workflow's
  `write_set` rides along. security has read the file, integrate re-runs the suite
  regardless, so marginal cost is near zero. Defer only what needs its own design
  decision or touches a surface outside the write set.
- **Batch every real deferral.** `power` (velocity.power_mode.enabled, already true
  here) runs the mechanical phases ONCE per batch with security per ticket and an
  ordered commit split under one grant. N quickfixes pay N tails; one power batch
  pays one. The right-size gate trims simplify/document per run but by constitution
  can never skip security, and never touches integrate or archive.
- Counter-case that is NOT covered by this: a Critical/High security finding still
  blocks its own workflow. Ride-along is an economy for LOW/MEDIUM and for punch-list
  items, never a reason to carry a blocker forward.
