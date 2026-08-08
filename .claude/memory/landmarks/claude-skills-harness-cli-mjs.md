---
key: .claude/skills/harness/cli.mjs
category: landmarks
scope: []
governs: .claude/skills/harness/cli.mjs, .claude/skills/harness/workflow-migrator.js, .claude/skills/lib/argv.mjs
load_bearing: true
verified-at: 9179afd
last-touched: 2026-08-09
---

- Path: `.claude/skills/harness/cli.mjs`. Orchestration — a Pattern A dispatcher over `lib/argv.mjs` with exactly one subcommand, `migrate`, wrapping `workflow-migrator.js → migrateWorkflowJsonInPlace`. Cited by `harness/SKILL.md` preflight Step 3a.
- **Why this file exists at all, and it is not "for consistency."** `workflow-migrator.js` is a byte-for-byte build mirror of `src/cli/workflow-migrator.js` (`build-template.sh` Stage 0b, guarded by `tests/vendored-mirror-bytes.test.mjs`). A `process.argv` entry point written into the mirror is silently reverted by the next `npm run build`; written into the source, it drags the change into `src/**`, which matches no `diagram_profiles` entry. A wrapper here is the only front door that costs neither.
- **This is the caller that made `dispatch` async.** The dispatcher-sweep spec originally decided the opposite (D2: keep `dispatch` synchronous) on the premise that the one async target could carry its own Pattern B entry point. The build-mirror constraint above falsified that premise at implement time. `await` on a non-promise costs the synchronous handlers nothing; without it an async handler's promise reaches `emit` as `{}` and `process.exit` fires before the write lands.
- Only one subcommand by design: the other seventeen modules in this directory (`rightsize-gate`, `checker-fanout`, `notify`, `consolidate-open-questions`, …) already self-dispatch on `process.argv` and are cited that way. Adding second front doors beside working ones is scaffold, not reuse.
- Error mapping is deliberate: a missing file raises `NotFoundError` (exit 2), an unmapped `entry_phase` stays a validation error (exit 1). Collapsing them would tell a caller to fix their config when the real problem is a typo in the path.
- Related: [[claude-skills-lib-argv-mjs]] owns the dispatch contract this wires into.
