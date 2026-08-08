---
key: baseline-self-dev-verify-audit-not-unit-suite
category: landmines
scope: [tdd, integrate]
caveat: confirmed live 2026-06-22 in `simplify-reverify-guard` — verify-tick + integrate stamped via the audit; the new helper's 10 unit tests AND the `tier-dial-coverage` regression risk were caught only by a manual `npm test` in `/integrate` (1057 tests, 1043 pass). The constituent facts existed but scattered across [[baseline-skill-edit-needs-manifest-rebuild]] and [[live-objtemplate-rebuild-races]]; no single entry synthesized the audit-vs-unit-suite split + its integrate implication, so it was re-derived from `project.json`/`package.json` from scratch. This entry is the synthesis. Companion: [[baseline-skill-edit-needs-manifest-rebuild]] (the manifest-rehash half).
verified-at: 22c986b
last-touched: 2026-06-22
---

- Path: `.claude/project.json → test.cmd` = `node .claude/skills/audit-baseline/audit.mjs --file={file}` (`test.kind: structural`) vs `package.json → scripts.test` = `node --test --test-reporter=spec tests/*.test.mjs`.
- Trap: when developing the baseline ON the baseline, the BINDING verification (`verify-tick`, `/simplify` re-verify, `/integrate`) runs `test.cmd` = the STRUCTURAL AUDIT, not the unit suite. The `node --test tests/*.test.mjs` unit suite is a SEPARATE command (`npm test`); `/implement`'s RALPH loop drives the specific failing tests via `node --test <file>`, but no workflow phase runs the FULL unit suite as its binding stamp. So a change can pass every phase's audit and still have BROKEN UNIT TESTS no phase caught — and several unit tests inspect baseline SKILL.md bodies (`tier-dial-coverage.test.mjs` reads `simplify`/`security`/`spec-lint`/`integrate` SKILL.md for the tier-dial read-path line), so editing a checker skill can break a unit test the structural audit is blind to.
- Mitigation: for any change that edits a baseline skill/hook body or adds a helper under `.claude/skills/<slug>/`, run `npm test` MANUALLY during `/integrate` (in addition to the binding audit stamp) — the audit is necessary but not sufficient. Run it serially for a deterministic verdict (`node --test --test-concurrency=1 tests/*.test.mjs`) per [[live-objtemplate-rebuild-races]]. The unit suite is also the only place a NEW unit test (e.g. a helper's own tests) actually executes inside the workflow.
