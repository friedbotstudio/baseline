---
key: editing-a-stage-0b-mirror-is-silently-reverted-by-npm-run-build
category: landmines
scope: [scout, spec, tdd, security, integrate]
verified-at: 1414f27
last-touched: 2026-07-13
---

- Path: `scripts/build-template.sh` Stage 0b (lines ~66-90, `sync_vendored_mirror`) → the generated mirrors under `.claude/skills/triage/` (`workflows-validator.js`, `workflows-validator-invariants.js`, `workflows-validator-predicates.js`, `track-tasklist-materializer.js`, `workflow-migrator.js`). The SOURCES live in `src/cli/`.
- Trap: those `.claude/` files are **build artifacts**, not sources. Editing one lands, then the next `npm run build` **silently copies over it** from `src/cli/`. The edit does not error — it evaporates. Live 2026-07-13 (`extractor-noise-and-prereq-drift`): a one-line change to `KNOWN_TRACK_FIELDS` in `.claude/skills/triage/workflows-validator.js` made its test go green, then the mandatory post-hook-edit `npm run build` reverted it and the test went red again. The failure mode is maximally confusing: the test passes, then fails, with no edit in between.
- Compounding: editing ANY `.claude/hooks/**` or `.claude/skills/**` file REQUIRES `npm run build` (landmine [[baseline-skill-edit-needs-manifest-rebuild]]), so the very step that keeps the manifest honest is the step that destroys a mirror edit. The two landmines interlock.
- Mitigation: before editing anything under `.claude/skills/*/*.js`, check whether a same-named file exists in `src/cli/`. If it does, **edit `src/cli/` and let the build propagate**. `diff -q src/cli/<f> .claude/skills/triage/<f>` returning "identical" is the tell. Confirm the edit SURVIVED a build (`grep` the mirror after `npm run build`) — do not assume.
- Note the asymmetry: `SKILL.md` files are NOT mirrors and are edited in place. Only the vendored `.js` helpers are synced. Related backlog: [[generators-stamp-derived-header-vs-byte-equality-contracts-e9c1]] — a DERIVED header on generated files is the root-cause fix, and this incident is fresh evidence for it.

---
