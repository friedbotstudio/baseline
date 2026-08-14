---
key: .claude/skills/tdd/tests/drift_check_test.sh:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: Fixture-based integration tests for `.claude/skills/tdd/drift_check.mjs:1`. 4 scenarios covering AC-002 (all-resolved → exit 0, table marks every AC `resolved`), AC-003 (one-unresolved → exit 1, evidence column names the missing AC ID), AC-011 (no-spec → exit 0, stdout `no spec; skipped`, no report file), and the `*(none)`-Design-calls case (spec present but Design calls table absent → exit 0 over ACs only). Builds tempdir project roots with synthetic spec files + `--diff` override fixtures, invokes the helper, asserts on the markdown report at `<project-root>/.claude/state/drift/<slug>.md` and the exit code.
- Companion: `.claude/skills/tdd/drift_check.mjs:1` (the helper under test), `.claude/skills/tdd/tests/run.sh:1` (the aggregate runner that picks this up).
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline`); run manually during /tdd, /simplify, /integrate. The test scenarios encode the contract documented in `docs/specs/workflow-loop-closing-hygiene.md` ACs — adding behaviors to `drift_check.mjs` requires extending this suite in lockstep, or the next drift-check-tick will go unverified.
