---
key: binding-test-cmd-makes-every-source-edit-cost-a-full-suite-run
category: backlog
scope: []
governs: .claude/hooks/test_runner.mjs,.claude/project.json
status: open
source: assistant-deferral
deferred: cost
raised-on: 2026-08-14
raised-in-context: release-readiness
verified-at: 66fcb29
last-touched: 2026-08-14
---

> Chaining the node suite into `test.cmd` made the binding verdict honest and made every source edit cost 135 seconds. Both come from the same line.

- **The mechanism.** `test_runner.mjs:73-76` substitutes `{file}` into `project.json → test.cmd` and runs it through `bash -lc` on every `PostToolUse` Write/Edit. It skips `.md`, `.json`, `.yaml`, `.yml`, `.toml`, `.txt` and anything under `docs/`, `.claude/`, `.config/` — so `.mjs`, `.js`, `.njk`, `site-src/**` and `tests/**` all still fire.
- **Measured 2026-08-14.** Before AC-001, `test.cmd` was the governance audit alone (~1s). After, it is the audit AND `node --test tests/*.test.mjs` (~135s). Observed live during this workflow's `/document`: a one-paragraph edit to `site-src/memory.njk` triggered a full suite run, which reported 14 failures — all one cause, an unrelated manifest hash drift.
- **Do not fix by reverting AC-001.** The binding verdict covering the suite is the whole point of the ticket: `/integrate` stamped PASS over eight red assertions for an unknown number of cycles because the audit was the only thing it ran. The verdict must keep both.
- **Shape of the fix.** The per-file hook and the binding verdict want different commands. Options: give `test_runner` its own `test.affected_cmd` (the audit, `{file}`-scoped) while `test.cmd` stays the full chain that `verify`/`/integrate` read; or narrow `test.file_globs` so the hook fires on fewer paths. The first is truer — the hook answers "did this file break something cheap to check", the verdict answers "is the tree shippable".
- **While it stands.** Prefer batching source edits, and expect a ~2-minute pause after each one outside the skip list.
- Related: the same `bash -lc` interpolation carries a MEDIUM injection finding in `docs/archive/2026-08-14/release-readiness/security.md`; both are repaired by moving off shell interpolation to an argv spawn.
