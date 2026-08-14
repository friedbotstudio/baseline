---
key: derive-the-memory-census-literals-or-gate-them-at-write-time
category: backlog
scope: []
status: picked-up
source: assistant-deferral
raised-on: 2026-08-13
raised-in-context: contracts-rows-resolve-at-drift-check
verified-at: c53a121
last-touched: 2026-08-13
governs: tests/memory-scope-store-invariants.test.mjs, .claude/skills/memory-sync/SKILL.md
superseded-at: 2026-08-14
---

> Eight census-literal corrections in one two-commit session, in four sittings, while three memory entries describing the pattern were live and being authored. Two of the eight were caused by writing those entries.

- **The work.** Stop paying this cost per workflow. Two candidate shapes, and the choice is a real design call rather than a preference:
  - **Derive the path-leg census.** `PATH_LEG_BASELINE` is a drift trap, and its own comment already says "a governed-memory count is a census, not an invariant: re-measure it; do not defend it." A test that re-measures and asserts *no unexplained movement* (rather than an absolute) keeps the trap's teeth without the treadmill. The four entries are hand-picked probes, so the set — not the counts — is the thing worth pinning.
  - **Gate at write time.** `/memory-sync` knows exactly which entries it is about to write and with what `scope:`/`governs:`. It can compute which census literals the write will move and either re-measure them in the same commit or refuse until the curator does. This converts a next-workflow surprise into a same-workflow chore, which is where the cost belongs.
- **`PHASE_BUDGETS` is a different animal and must not be lumped in.** A budget is policy with no oracle: re-measuring it to the exact current value silently converts it into a zero-headroom tripwire, which is what has happened four times. Deciding what that cap should actually measure — surfaced VOLUME rather than entry count — is its own question. See [[census-and-budget-are-different-numbers]].
- **Do not "fix" this by deleting the assertions.** They are the only thing that noticed the store growing, and one of them (the landmark deferral count) is a roadmap commitment T11 depends on.
- Evidence and the graduation argument: [[anti-drift-tests-compare-against-the-live-oracle-b4d2]]. Mechanism for why one write moves several literals: [[a-wide-governs-glob-ripples-into-unrelated-literals]].
