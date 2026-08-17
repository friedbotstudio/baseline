---
key: claude-skills-lib-tests-is-executed-by-nothing
category: backlog
load_bearing: false
scope: [triage, integrate, implement]
governs: .claude/skills/lib/**, tests/**
status: open
raised-on: 2026-08-17
raised-in-context: unify-epic-heading-grammar
source: assistant-deferral
verified-at: 19631b7
last-touched: 2026-08-17
---

> `.claude/skills/lib/tests/probe.test.mjs` exists on disk and is executed by nothing: not `project.json → test.cmd` (`node --test tests/*.test.mjs`, which globs the repo-root `tests/` only), not `npm test`, not CI.

- **Why it matters here specifically.** `.claude/skills/lib/` now holds `epic-heading.mjs`, which carries the CWE-74 `assertInert` guard. A test directory sitting beside a security-relevant module that never runs is an invitation to add a guard test there and believe it is covering something.
- **Confirmed 2026-08-17**: the directory contains exactly one file, `probe.test.mjs`. The `unify-epic-heading-grammar` workflow put its own tests in the repo-root `tests/epic-heading-grammar.test.mjs` for this reason — that is where the binding command looks.
- **Two candidate fixes, unresolved.** Widen the test glob to pick up `.claude/skills/**/tests/*.test.mjs`, or delete the stray directory. Widening changes what the binding verify command covers, so it is a real decision.
- Raised in the security report's Out-of-scope section as "worth closing".
