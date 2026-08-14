---
key: .claude/skills/tdd/drift_check.mjs:1
category: landmarks
scope: [scout]
verified-at: 8201af6
last-touched: 2026-08-14
---

- Role: spec-to-implementation drift analysis helper. Invoked by the harness as a drift-check-tick inside /tdd's seeded worker chain (between the last design-ui-tick / verify-tick and tdd-finalize). CLI: `--slug <slug>` (required), `--project-root <path>` (default `.`), `--diff <path>` (override of `git diff <merge-base>..HEAD`). Parses numbered AC IDs from the spec's ## Acceptance criteria table (regex on `| AC-NNN |` rows) and row-slugs from the ## Design calls table; scores each as `resolved` (item ID literal in any diff added-line) or `unresolved` (no diff added-line references it). Writes `<project-root>/.claude/state/drift/<slug>.md` with a `| kind | id | verdict | evidence |` markdown table per item. Exit 0 on zero-unresolved, exit 1 on `≥ 1 unresolved`, exit 2 on tool error. Special case: spec absent → "no spec; skipped" on stdout, exit 0, no report file (chore-track support per AC-011 of the wf-loop-closing-hygiene spec).
- Caveat: the workflow that first shipped drift_check.mjs (workflow-loop-closing-hygiene) did NOT exercise the harness's drift-check-tick path at runtime — the harness instance in flight predated the tdd/SKILL.md update and could not inline the helper. Unit-tested via `.claude/skills/tdd/tests/drift_check_test.sh` (4 scenarios covering all-resolved / one-unresolved / no-spec / *(none)*-design-calls). Live runtime exercise begins in the next spec-track workflow after the shipping commit. Path-traversal LOW finding on the `--slug` argument is non-blocking (operator trust model) — see `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md` Finding #1.
