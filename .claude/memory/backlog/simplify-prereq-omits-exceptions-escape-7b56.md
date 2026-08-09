---
key: simplify-prereq-omits-exceptions-escape-7b56
category: backlog
scope: [spec, tdd, integrate]
status: open
raised-on: 2026-08-05
raised-in-context: ledger-key-form
source: user-instruction
estimated-effort: low (two prose clauses; the derivation machinery already exists)
verified-at: d36d7f0
last-touched: 2026-08-05
---

> verbatim (user, 2026-08-05, after the defect was surfaced at the gate-C yield):
> "backlog the defect"

- Intent: Two phase-skill prereqs demand `simplify` be in `completed` and give it no `OR in exceptions` escape, so a workflow whose `simplify` was legitimately skipped cannot satisfy them as written.
  - `.claude/skills/integrate/SKILL.md` → "`simplify` in `completed` AND (`security` in `completed` OR `security` in `exceptions`)" — the asymmetry is visible inside one sentence: `security` gets the escape, `simplify` does not.
  - `.claude/skills/security/SKILL.md` → "`simplify` in `completed`".
- **Measured 2026-08-05 at d36d7f0**: these are the ONLY two prereq clauses in `.claude/skills/*/SKILL.md` missing the escape. `archive`, `document`, `research`, `roadmap-sync`, `scout`, `simplify` and `spec` all read "in `completed` OR in `exceptions`". So this is a two-site omission, not a convention.
- Why it bites: `simplify` is one of exactly two phases the post-`tdd` right-size gate is permitted to auto-skip (CLAUDE.md Art. IV; `harness/rightsize-gate.mjs`), and the gate skips by appending to `exceptions[]`. The sanctioned skip therefore produces a state both prereqs reject. Hit live in `ledger-key-form`: the gate measured 3 files / 59 lines, skipped `simplify`, and both `/security` and `/integrate` ran with an unsatisfied prereq. Proceeding was correct — Art. I.4 puts the constitution above the implementation, and Art. IV sanctions the skip — but a phase skill should never require a judgment call to get past its own precondition.
- Same class as Epic 6 T7 (`derive-exceptions`, landed): *no phase skill may declare a prereq its own track is structurally unable to satisfy*. T7 fixed the case where a track's DAG omits the node; this is the case where a **runtime oracle** moves a declared node into `exceptions` after the fact. The T7 machinery does not cover it, because the skip happens after triage derives the array.
- Fix: add `OR in exceptions` to both clauses. Consider deriving the prereq check from `workflow.json` mechanically rather than restating it in prose in each SKILL.md — prose in a SKILL.md cannot fail a build, which is the recurring shape here (see [[discard-ledger-is-inert-until-memory-sync-step-4-5-runs]] and the `document-gate` case).
- Do NOT "fix" this by making the right-size gate write `completed` instead of `exceptions`. That would falsely record that `simplify` ran, corrupting `auto_skipped[]`'s whole purpose as a provenance trail and misleading `/archive`'s timing table.
