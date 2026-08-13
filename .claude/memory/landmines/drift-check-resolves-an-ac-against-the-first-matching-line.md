---
key: drift-check-resolves-an-ac-against-the-first-matching-line
category: landmines
scope: [tdd, scenario, implement]
governs: .claude/skills/tdd/drift_check.mjs
verified-at: 79e41cb
last-touched: 2026-08-13
---

- Path: `.claude/skills/tdd/drift_check.mjs → scoreAgainstDiff`.
- Landmine: **an AC resolves against the FIRST added line that mentions its id, anywhere in the scored diff, and that line becomes the reported evidence.** A file naming an AC id it does not cover is that AC's false witness.

`scoreAgainstDiff` returns on first match. Diff order puts tracked changes first, then untracked files alphabetically, so which file wins is an accident of naming.

**Measured 2026-08-13.** Two ACs came back `resolved` citing `docs/audits/swarm-first-production-run-2026-08-09.md`, an untracked report from an earlier session that only discussed those ids. Both had real coverage elsewhere, so the verdicts were right by accident — an AC with no coverage would have passed identically.

**Then the fix reproduced the defect.** After widening `EXCLUDED_DIFF_PREFIXES` to cover every per-workflow report directory, the same two ACs resolved against a comment in the NEW test file that narrated the incident by id. Path-based exclusion cannot reach that: a test file is legitimately scored.

- **The rule:** never name an AC id in a file that does not cover it. Write the incident without the literals ("two of its criteria"); the ids belong only in the file that defends them.
- **Read the evidence column, not just the verdict.** They are independent. A `resolved` whose citation is unrelated prose is not proof, and the verdict alone cannot tell earned coverage from a coincidental substring.
- Excluded prefixes now cover `docs/{specs,archive,audits,rca,security,intake,scout,research,brief}/` and `.claude/state/` — every directory holding reports ABOUT workflows. `docs/{system,references,runbooks}/` stay scored, because those can be a docs ticket's real deliverable.
