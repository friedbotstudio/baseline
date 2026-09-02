---
key: erp-portables-ac-011-and-ac-012-belong-to-no-slice-7a52
category: backlog
status: open
scope: [triage, tdd]
governs: docs/specs/erp-portables.md, .claude/state/epic/erp-portables.json
source: assistant-deferral
raised-on: 2026-09-02
raised-in-context: gate-fidelity
verified-at: 02f3c68
last-touched: 2026-09-02
---

> spec-lint reports AC-011 and AC-012 as assigned to no slice in erp-portables, and that report is TRUE. I am not weakening the check to make my own criterion pass.

- `spec-lint`'s epic slice-assignment check reports `assigned to no slice: AC-011, AC-012` against `docs/specs/erp-portables.md`. The report is correct. Both are cross-cutting enforcement criteria that no `## Slice <id>` section claims.
- Before the `gate-fidelity` fix the same check reported **16** unassigned ACs on that spec, because its heading pattern refused the titled headings every epic spec on disk writes. Fixing the reader dropped the false 14 and left these two real ones.
- The true report is pinned in `tests/spec-lint-slice-ownership.test.mjs`, which asserts the failure detail ends exactly at `AC-011, AC-012`. That test goes green on its own the moment the epic gives them a home; it does not have to be edited.
- What is owed: either assign both criteria to a slice section, or add a slice that owns the cross-cutting enforcement work. Recorded as spec D11. See [[claude-skills-lib-slice-grammar-mjs]].
