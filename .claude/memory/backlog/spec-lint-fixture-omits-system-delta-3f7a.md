---
key: spec-lint-fixture-omits-system-delta-3f7a
category: backlog
scope: [integrate]
status: open
source: assistant-deferral
raised-on: 2026-08-26
raised-in-context: review-gate-input-measurement
governs: tests/spec-lint-design-calls.test.mjs
verified-at: e27219d
last-touched: 2026-08-26
deferred: cost
---

> A gated test that has been red since the System delta check landed is a test nobody is reading.

- **The defect.** `specBody()` in `tests/spec-lint-design-calls.test.mjs` emits no `## System delta` section. `checkSystemDelta` (`.claude/skills/spec-lint/lint.mjs:183`) returns FAIL on that whenever `memory.architecture_map.enabled` is true, which the fixture's own `makeProject()` sets. Two tests fail: `test_when_spec_lint_runs_on_ui_spec_with_design_calls_then_passes` (:156) and the one at :175.
- **Why it is quiet.** Both are gated behind `PLANTUML_TESTS=1`, so `npm test` reports green and only `npm run test:full` shows them.
- **Fix shape.** Add a `## System delta` section to `specBody()`, or have `makeProject()` leave `memory.architecture_map.enabled` unset so the check SKIPs the way it does for a consumer project.
- **Measured** 2026-08-26 on `npm run test:full` at e27219d: 3407 tests, 7 fail. The other five were run artifacts rather than defects — four ENOENT reads of `obj/template/` caused by a concurrent `npm run publish:smoke` rebuilding it mid-run, and one stale `updated:` date on `site-src/velocity.njk` fixed in the same session.
- Sibling of [[a-pipe-in-a-filename-removes-its-row-from-the-review-gate-5c04]].
