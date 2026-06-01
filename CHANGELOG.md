# Changelog

All notable changes to this project will be documented in this file.

The format follows [keepachangelog.com 1.0.0](https://keepachangelog.com/en/1.0.0/). The `## [Unreleased]` section is curated locally by the Phase 11.5 `changelog` skill before each `/commit`; versioned sections are inserted by `@semantic-release/changelog` at release time.

## [Unreleased]

### Added

- 40,000-character cap on `CLAUDE.md`, enforced by `audit-baseline` (FAIL when the file or its `src/CLAUDE.template.md` mirror exceeds the cap). The binding rule is recorded in `CLAUDE.md` Article I.6 and `docs/init/seed.md` §14.
- `.claude/CONSTITUTION.md` — a read-on-demand annex holding amendment history, enforcement-mechanism narration, and the reference appendices (Where things live, Skill index).
- Durable local conversation-thread trail at `.claude/memory/_thread.md` (Article IX clause 8) — a third, local-and-durable memory class. Claude Code shelves the active work-thread on a topic switch and transforms it into a surfaced summary at resume; the trail survives `/memory-flush` and `/clear`, is gitignored, and is model-internal (no new skill or command). Backed by four `.claude/hooks/lib/` helpers (`thread_store`, `shelve_detect`, `shelve_capture`, `resume_transform`), a folded `memory_stop` detector, and most-recent-section injection at SessionStart.
- **`brainstorm` phase helper (PM mode).** New baseline-owned skill at `.claude/skills/brainstorm/` invoked at Step 0.5 of `/intake`, `/spec`, and `/tdd` entry phases when `workflow.json → skip_brainstorm` is `false` (default). Walks four stages: skip-check, gap-analysis, probe-loop (cap 5 iterations), confirm-and-persist. Captures the requirement via Socratic dialogue into `docs/brief/<slug>.md` with six structured fields (actor, trigger, current state, desired state, non-goals, solution-leakage). Stage 2 dialogue discipline is structurally enforced by `.claude/skills/brainstorm/discipline.mjs → scanTurn(text)` — a regex bank that catches solution verbs (`implement`, `refactor`, `add X`), library names (Redis, PostgreSQL, etc.), and proposal phrasing (`we could`, `I recommend`); test coverage at `tests/brainstorm-discipline-violation.test.mjs`. Six helper modules: `skip-check.mjs`, `discipline.mjs`, `validate-call.mjs`, `probe-loop.mjs`, `brief-writer.mjs`, `workflow-defaults.mjs`. New category in CLAUDE.md Appendix B: **Phase helpers (1)**. See Article X.3.
- **`/spec` codesign mode (Engineer mode).** Internal mode of the existing `/spec` skill activated at Step 1.5 when `workflow.json → codesign_mode` is `true` (opt-in). Identifies ≥1 load-bearing technical decision point from the research memo via `.claude/skills/spec/decision-finder.mjs`, presents each to the engineer (`Approve` / `Suggest alternative` / `Discuss tradeoff`) via `AskUserQuestion`, and renders the engineer's verbatim rationale as a `>` markdown blockquote inside a new `## Decisions` section via `.claude/skills/spec/decisions-writer.mjs`. The chosen option recorded is the engineer's pick when they override Claude's recommendation. State persists at `.claude/state/codesign/<slug>.json` (`.claude/skills/spec/codesign-state.mjs`). On `/integrate` failure classified as "needs spec change", `.claude/skills/harness/codesign-reentry.mjs → writeRevisitContext` appends a revisit_context so the next `/harness` invocation re-enters codesign on the named decision. Revisit cap: 3 per decision point. See Article X.4.
- **`/triage` flag parsing.** New `.claude/skills/triage/flag-parser.mjs → parseFlags(request)` regex-matches `--no-brainstorm` and `--codesign` substrings in the request string and sets `workflow.json → skip_brainstorm` and `codesign_mode` respectively. Flags are independent (both may be set in the same triage call). Test coverage at `tests/triage-flag-parsing.test.mjs`.
- **`spec-lint` Check #4: codesign-decisions presence.** `spec-lint/lint.mjs` gained a new check that fires only when `workflow.json → codesign_mode` is `true` AND the saved spec lacks a `## Decisions` heading. Suppressed entirely when `codesign_mode` is false. Test coverage at `tests/spec-codesign-missing-decisions-section.test.mjs`.
- **`docs/brief/<slug>.md` in the archive bundle.** `archive.sh` `PAIRS` array gained a new row mapping the brainstorm brief into the workflow's archive bundle as `brief.md`, alongside `intake.md`, `scout.md`, etc.
- **Read-time defaults pattern for additive `workflow.json` fields.** `.claude/skills/brainstorm/workflow-defaults.mjs → withDefaults(workflowJson)` applies `?? false` on missing `skip_brainstorm` and `codesign_mode` fields so legacy in-flight workflow.json files continue working without an on-disk migrator write. Convention documented at `.claude/memory/conventions.md → workflow-json-read-time-defaults`.
- `audit-baseline` now derives the governance counts (skills, hooks, commands, subagents, selectable/sub tracks, memory files, MCP servers) from the on-disk artifacts via a shared `.claude/skills/audit-baseline/derive-counts.mjs`, and hard-FAILs when a count literal in a prose surface (CLAUDE.md orientation line, the mirror) or the skills category-breakdown sum disagrees with the derived truth.
- `memory_stop` backlog-intent extraction now captures explicit unanchored routing markers (`add to backlog`, `backlog this`, `for the backlog`, and `(in/for) the next session` / `in a later|future session` deferrals) anywhere in a line for both user and assistant turns, alongside the existing line-anchored triggers — closing a recall gap where parenthetical or mid-line backlog intent (e.g. `(add to backlog)`) was silently dropped. Marker phrases are stripped from the derived slug while the full line is preserved as the verbatim. New `tests/memory-stop-recall.test.mjs` (7 tests).
- Gate-A open-questions consolidator. At the `/approve-spec` yield the harness now runs `.claude/skills/harness/consolidate-open-questions.mjs`, which extracts the `## Open questions` bullets from the slug's intake, research, and spec artifacts, dedupes them across phases (a question restated downstream collapses to one line tagged with every phase it appeared in), and buckets them spec-first, so the reviewer sees one consolidated list of unresolved decisions before approving. The harness SKILL.md gate-A handling invokes it and surfaces its output in the yield message. New `tests/consolidate-open-questions.test.mjs` (9 tests).

### Changed

- Hardened state-file writes and input handling. JSON state writes now go through an atomic temp+rename (`writeJsonAtomic` in `.claude/hooks/lib/common.mjs`, applied to the thread cursor/candidate, the resume-transform cache, and the `workflow.json` migrator), so a crash mid-write can't leave a corrupt file (CWE-362). `seed-tasklist.mjs` validates the workflow slug against `^[a-z0-9][a-z0-9-]*$` before use (CWE-78). The `/grant-commit` consent window is documented as 900s (matching the guard default; the public FAQ "five minutes" is corrected to fifteen).
- Trimmed `CLAUDE.md` from ~46k to ~39k characters by relocating non-binding content (history, mechanism narration, Appendices A/B) to the annex. All binding rules retained; only explanatory material moved.
- Documented the new `_thread.md` memory class across the constitution and docs: `CLAUDE.md` Article IX clause 8 (and the `src/CLAUDE.template.md` mirror), `docs/init/seed.md` §4.1 (and the `src/seed.template.md` mirror), the `.claude/CONSTITUTION.md` annex, `.claude/memory/README.md`, and the public `site-src/memory.njk` page.
- `src/seed.template.md` synced to `docs/init/seed.md` (pre-§16 body) with a byte-parity test that guards the §16 reserved-placeholder carve-out.
- `memory_session_start` sweeps leaked single-use `*_grant` consent markers at session start.
- 3 parallel-racing tests isolated to per-tmpdir builds via `tests/helpers/clone-and-build.mjs`; `publish-check` / `smoke-tarball` tests env-gated with a faithful npm-install probe so restricted sandboxes skip cleanly.
- **Skill count: 39 → 40.** CLAUDE.md (Article III greeting, Appendix A, Appendix B), `src/CLAUDE.template.md` byte-mirror, `docs/init/seed.md` (§0 header, §3 directory comment, §4.3 heading, §13 Step 5), `src/seed.template.md` byte-mirror, and `README.md` (intro + count table) all bumped. "Eleven categories" → "twelve categories" everywhere; new "Phase helpers (1)" category appears in the canonical breakdown. Audit-baseline picks up the new skill automatically via `manifest.owners.skills.brainstorm: "baseline"` (no hardcoded list to update; Article XI compliance).
- **CLAUDE.md gained Article X.3 (Entry-phase brainstorm — PM mode) and Article X.4 (`/spec` codesign mode — Engineer mode).** Five-row rule tables per amendment cover read-time defaults, dialogue discipline, iteration caps, idempotency, and re-entry mechanics. Byte-mirrored to `src/CLAUDE.template.md`.
- **Site docs updated.** `site-src/_data/baseline.json` (`skills.total: 40`, `skills.categoriesWord: "twelve"`, new `skills.byCategory.phaseHelpers: 1`). `site-src/skills/core.njk` gained a new `§VIII Phase helpers` section with the brainstorm row; `§IX` Audit and `§X` Alt tracks renumbered; TOC updated.
- **Homepage accessibility floor (2026-05-29 audit).** `site-src/index.njk` strata SVG now carries an inline `<title id="strata-title">` element so screen readers get a coherent narration ("The four strata of the baseline: Genesis, Constitution, Implementation, and Tool boundary where the guards intercept"). The workflow arch-bento (`viewBox 0 0 1000 1200`) `<title>` trimmed from ~80 words to a 17-word noun phrase; `<desc>` trimmed to the node-order list and grew a one-line mention of Step 0.5 brainstorm + Step 1.5 codesign. The `bento-mobile` subtree now carries `aria-hidden="true"` so screen readers narrate only the desktop subtree regardless of viewport. Bento label floor raised from 8.5–9px monospace to 10.5px (`.cell-modifier`, `.pair-tag`, `.runtime-foot` in `site-src/assets/site.css`) — the prior sub-7px device-pixel render was unreadable. Inline copy: `index.njk:97` "Ten articles" → "Eleven articles" (CLAUDE.md now has Articles I–XI).
- **`PRODUCT.md` stale counts corrected.** Line 20 "thirty-six skills" → "forty"; line 40 anti-references "36 skills, 1 subagent, 11 phases, 3 gates" → "40 skills, 1 subagent, 11 phases, 4 gates". Article X.1 governance file but the counts leak into impeccable's loaded context every session, so factual accuracy matters.
- **17 new tests** at `tests/brainstorm-*.test.mjs`, `tests/codesign-*.test.mjs`, `tests/spec-codesign-*.test.mjs`, `tests/triage-flag-parsing.test.mjs`, `tests/intake-*.test.mjs`, `tests/workflow-json-defaults.test.mjs`, `tests/audit-skill-count-drift.test.mjs`, `tests/archive-brief-pairs.test.mjs`, plus two fixtures at `tests/fixtures/{intake,spec}-prefeature-baseline.md`.
- **Archive bundle for `brainstorm-and-codesign`** includes the spec rendered as 16 SVGs at `docs/archive/2026-05-29/brainstorm-and-codesign/spec-rendered/` (c4_context, c4_container, 2 c4_components, class, 9 sequences, state, dependency_graph).
- The docs site reads governance counts from a computed `site-src/_data/baseline.cjs` (replacing the static `baseline.json`) that calls the shared deriver at build time, so rendered counts can no longer drift from the artifacts.
- `triage/SKILL.md` no longer carries duplicated canonical track-shape templates; `.claude/workflows.jsonl` is the single source and `tests/memory-flush-phase.test.mjs` AC-006 now reads the track node order directly from it.
- The `/document` phase (Step 2) gained a reflective public-site trigger. A new `.claude/skills/document/public-site-reflect.mjs` → `findDescribedSurfaces` derives the skill/hook/command tokens a change touches and word-boundary-greps `site-src/**/*.njk` for pages that name them, so a behavior change surfaces the public page that describes it even when no `site-src/**` file is in the diff (closing the file-presence blind spot). Each surfaced page now routes through BOTH the reference register (`documentation`) and the persuasive feature-value register (`prose`/`copywriting`) — per the standing guidance to describe the user-facing feature, not just the mechanism.
- The local conversation-thread trail (`.claude/memory/_thread.md`) is now bounded. `thread_store.appendEntry` calls a new `pruneTrail` after each shelve, evicting the oldest sections so at most `THREAD_MAX_SECTIONS` (default 20) remain — the trail is outside `/memory-flush`'s reset path by design, so the cap lives in the append path. Only the most-recent section is ever injected at SessionStart, so the cap bounds disk growth with no loss of live continuity. New `tests/thread-trail-rolloff.test.mjs` (7 tests).
- Full serial test suite is ~29% faster (~644s → ~459s) and spawns no JVM by default. The six JVM-spawning PlantUML tests (`spec-lint-design-calls`, `plantuml-syntax-guard-runtime`, `spec-render-runtime`, `install-java-preflight`) now skip unless `PLANTUML_TESTS=1`, so a default `node --test` run no longer shells out to `java -jar … -checkonly`/`-tsvg`. The build/manifest tests (`tests/skill-ownership.test.mjs`, `tests/manifest.test.mjs`) share one cached template build instead of rebuilding per test — the mutating drift tests now tamper with a fast `cp -a` copy of the pristine built tree rather than running a full rebuild each.

### Fixed

- The Phase 11.5 changelog actuator no longer corrupts `CHANGELOG.md`. `unreleased-writer.mjs` now bounds the `## [Unreleased]` body at the next level-1 OR level-2 heading (it had recognized only level-2 `##` headings and silently deleted every level-1 `# [x.y.z]` released block below `[Unreleased]`), and locates the `[Unreleased]` heading by line-anchored match so a prose mention in the intro is never mistaken for the real heading. One-time `CHANGELOG.md` structural cleanup merged a duplicate buried `[Unreleased]` into the canonical single section. (The separate defect where the actuator classifies from `git log` instead of the staged diff is tracked for a follow-up.)
- The Phase 11.5 changelog actuator now sources its `[Unreleased]` entries from a caller-supplied `--entries-file` (a JSON array of `{section, body, breaking?}`) instead of classifying `git log`. Phase 11.5 runs before `/commit`, so git-log held already-committed/prior-workflow commits and the actuator re-listed stale work into `[Unreleased]` on every run; the caller — which knows the impending change — now writes the entries. `--preview-only` still uses semantic-release for a version projection. This resolves the follow-up noted above (the classify-from-staged half of the changelog-actuator work).
- `git_commit_guard` now classifies git subcommands via a wrapper- and quote-aware command tokenizer: closes a false-positive (read-only commands mentioning "git commit" are no longer blocked; Q-003) and a consent-gate bypass where a `git commit`/`git push` wrapped in `sh -c` / `eval` / `$(…)` / a subshell evaded gate C.
- `destructive_cmd_guard` now blocks Bash writes to consent tokens/markers under `.claude/state/` (including non-JS-interpreter writes and the `>|` clobber redirect), closing the Bash bypass of the approval gates.
- The docs site rendered "5 consent commands" while six ship; the count is now derived (6) and can no longer go stale.
- `audit-baseline` silently skipped its entire run — exiting 0 without checking anything — when invoked under a symlinked path (e.g. macOS `/tmp` → `/private/tmp`), because its main-module guard compared a realpath-resolved `import.meta.url` against the verbatim `process.argv[1]`. The guard now realpath-resolves both sides.
- The Phase 11.5 changelog actuator no longer silently drops accumulated `[Unreleased]` entries. `appendUnderUnreleased` gained an opt-in `guardShrink` (the actuator enables it; `--allow-shrink` disables it for intentional prunes) that refuses a replace which would reduce the entry count before writing — a partial entries-file would otherwise have wiped the difference.
- `destructive_cmd_guard` now blocks shell-variable-indirected Bash writes to consent tokens/markers (a redirect whose directory is spelled via `$VAR`/`${VAR}` rather than a literal `.claude/state/` path). The detector (`writesConsentPath`) moved to `.claude/hooks/lib/common.mjs`, matches the reserved consent basename in the redirect target however the directory is written, and is boundary-anchored so a longer filename merely containing the token as a substring does not false-trip (7f2c MEDIUM).
- The session-start leaked consent-marker sweep no longer follows a symlinked marker to its target. `sweepLeakedGrantMarkers` (`.claude/hooks/lib/common.mjs`) `lstat`s each marker and removes only the link, never reading or deleting through it (7f2c LOW, CWE-59/CWE-367).

### Security

- Closed the consent-gate Bash-bypass class on the commit/push and spec/swarm approval paths — both wrapper-form command evasion (`sh -c "git commit"`) and Bash-written approval tokens are now denied.
- Bounded the `memory_stop` intent-strip input to `MAX_INTENT_TEXT_LEN` (240 chars) in `normalizeIntent`, preventing super-linear regex backtracking (CWE-1333) in the new unanchored marker strip on a crafted multi-KB transcript line that matches a backlog marker — a ~10 KB line previously stalled the Stop hook 12s+. Guarded by `test_when_pathological_long_marker_line_then_bounded_time_and_candidate`.
- The open-questions consolidator validates its `--slug` against `^[a-z0-9][a-z0-9-]*$` before reading any artifact, blocking a path traversal (CWE-22) where a crafted slug such as `../../secret` could echo the `## Open questions` section of an arbitrary `.md` file. Guarded by `test_when_slug_has_path_traversal_then_rejected`.
- Thread-trail eviction parses sections via the forge-proof base64 data block, not the `## SHELVED` heading line. A multi-line verbatim cue can render a bare line beginning `## SHELVED `, which a heading-counting eviction miscounts as a section boundary — dropping a section that should survive (data loss). Guarded by `test_when_phantom_heading_in_cue_then_no_wrongful_eviction`.

# [0.12.0](https://github.com/friedbotstudio/baseline/compare/v0.11.0...v0.12.0) (2026-05-29)

### Bug Fixes

* **memory:** hardening batch closes 14 review findings ([33560f2](https://github.com/friedbotstudio/baseline/commit/33560f272eafd66eabd8d8c92dd5fc3180b0b812))

### Features

* add freeform workflow track for ad-hoc edit batches ([751e892](https://github.com/friedbotstudio/baseline/commit/751e892bf5b4ec84b328ace0f4802dc40977bde0))

# [0.11.0](https://github.com/friedbotstudio/baseline/compare/v0.10.0...v0.11.0) (2026-05-27)

### Features

* remove python3 runtime dependency; port skill helpers to Node ESM ([756dd42](https://github.com/friedbotstudio/baseline/commit/756dd420f239a9480e50c2d5446ea597985524d5))

# [0.10.0](https://github.com/friedbotstudio/baseline/compare/v0.9.0...v0.10.0) (2026-05-27)

### Bug Fixes

* **plantuml:** always-download jar + java -jar runtime; pin now enforced ([d058472](https://github.com/friedbotstudio/baseline/commit/d058472749f62c73cba14ea0c2f078bb5e48d11e))
* **shippability:** vendor src/cli modules into shipped tree + harden scanner ([3e1bf19](https://github.com/friedbotstudio/baseline/commit/3e1bf194374f489e72f8e28c760c9a76d549aba5))

### Features

* add code-browser skill as default code-navigation mechanism ([7901e65](https://github.com/friedbotstudio/baseline/commit/7901e650f9bec72d4feefa73a099a408f0d3cce1))
* **upgrade:** version-aware no-op fast-path + baseline_version stamping ([64b79c8](https://github.com/friedbotstudio/baseline/commit/64b79c85791b868d0f3bc957d45a93ce89155b29))

### Performance Improvements

* **hooks:** port 22 hooks to Node ESM + audit fast-path + tier hardening ([9b54561](https://github.com/friedbotstudio/baseline/commit/9b5456168cd60ea38418a62655773cea4402c2ce))

# [0.9.0](https://github.com/friedbotstudio/baseline/compare/v0.8.2...v0.9.0) (2026-05-26)

### Features

* ship /upgrade-project marker helper + build-time SKILL.md scan gate ([b5d40eb](https://github.com/friedbotstudio/baseline/commit/b5d40eb4a0eda25f088f9f9aa848c1dc3ed32e1d))
* **spec-shippability:** catch dev-tree refs in shipped SKILL.md prose ([67da6dc](https://github.com/friedbotstudio/baseline/commit/67da6dce8259bfb6f43da544bffd1dfb83753068))

## [0.8.2](https://github.com/friedbotstudio/baseline/compare/v0.8.1...v0.8.2) (2026-05-22)

### Bug Fixes

* **audit:** silently skip README.md count claims when file absent ([4e5395d](https://github.com/friedbotstudio/baseline/commit/4e5395df4e2abd1b07213a0808cfac995c3c86a4))
* **tui:** render BASELINE wordmark on install / upgrade / doctor ([7b630ce](https://github.com/friedbotstudio/baseline/commit/7b630ce00e13ba030ab04ec1ebd6f76c22cc8e33))
* **upgrade:** stop replay prompts on runtime-state files + post-reconciliation files ([558fab5](https://github.com/friedbotstudio/baseline/commit/558fab50726e5734b7ef58794cc49e9f61c14938))

## [0.8.1](https://github.com/friedbotstudio/baseline/compare/v0.8.0...v0.8.1) (2026-05-22)

### Bug Fixes

* **audit:** stop false-FAILing on consumer installs + bump commit_consent TTL to 900s ([ea66e1d](https://github.com/friedbotstudio/baseline/commit/ea66e1d21b973206fecc850e03f3b6d7d59f5a59)), closes [#5](https://github.com/friedbotstudio/baseline/issues/5)

# [0.8.0](https://github.com/friedbotstudio/baseline/compare/v0.7.0...v0.8.0) (2026-05-22)

### Features

* **cli:** tier-1 Merge option + BASE-less stage + /upgrade-project two-way reconciliation ([f1f4fc2](https://github.com/friedbotstudio/baseline/commit/f1f4fc2f592bf6ab47f6495fea99cd230389b405))

# [0.7.0](https://github.com/friedbotstudio/baseline/compare/v0.6.0...v0.7.0) (2026-05-21)

### Bug Fixes

* **cli:** surface tier-2/3 unrecoverable-BASE files in upgrade dry-run ([92e0d10](https://github.com/friedbotstudio/baseline/commit/92e0d10921224bd2059d06fbc5b0383d11386ddf))

### Features

* **workflows:** declarative track DAGs via workflows.jsonl (§18 + Article IV) ([cb1d511](https://github.com/friedbotstudio/baseline/commit/cb1d51116fe3ba6ec660fb6315335a12d60a589b))

# [0.6.0](https://github.com/friedbotstudio/baseline/compare/v0.5.0...v0.6.0) (2026-05-20)

### Bug Fixes

* **scripts:** smoke-tarball handles v3 shipped manifest {sha256, tier} entries ([6837992](https://github.com/friedbotstudio/baseline/commit/68379924902be1b3234217dad17b26f772e8507d))

### Features

* **cli:** three-tier upgrade flow + /upgrade-project skill ([3a82801](https://github.com/friedbotstudio/baseline/commit/3a828018a56e42e96f27d04d9adb63cf12289f21))

# [0.5.0](https://github.com/friedbotstudio/baseline/compare/v0.4.0...v0.5.0) (2026-05-20)

### Features

* **cli:** BASELINE wordmark splash + manifest relocation + branded error paths ([e2927c7](https://github.com/friedbotstudio/baseline/commit/e2927c7160dd3737ee164fa9d50c0d50eb0c196d)), closes [#080b12](https://github.com/friedbotstudio/baseline/issues/080b12)

# [0.4.0](https://github.com/friedbotstudio/baseline/compare/v0.3.0...v0.4.0) (2026-05-18)

### Features

* **cli:** branded TUI for install / upgrade / doctor + retire --merge ([71d5577](https://github.com/friedbotstudio/baseline/commit/71d5577a5baeb5863ac0bd274d1534185284e505))
* **site:** add brand byline + install-pill component + redesign hero ([490a4a6](https://github.com/friedbotstudio/baseline/commit/490a4a67c1158b8b2e7a2629b6aeee9225eb8f92))
* **workflow:** add Phase 11.5 changelog skill + responsive bento SVG ([db291ed](https://github.com/friedbotstudio/baseline/commit/db291ed0d3971bbde26bc7385d063225c0a7fd14))

# [0.3.0](https://github.com/friedbotstudio/baseline/compare/v0.2.1...v0.3.0) (2026-05-17)

### Bug Fixes

* **audit:** allow preamble-only canonical memory files ([db0221b](https://github.com/friedbotstudio/baseline/commit/db0221b53f1a6575fbb9e86cf6d203fa6039c9ed))
* **audit:** require closing separator in canonical memory preambles ([e6ca9b6](https://github.com/friedbotstudio/baseline/commit/e6ca9b63bbee46bcfa24a720b101f4d13a924a59))

### Features

* **design-ui:** add mixed_brief Stage 0 terminal for multi-lane briefs ([be2d941](https://github.com/friedbotstudio/baseline/commit/be2d94122fe58475c12c642126345978c713f223))
* drift-check tick, backlog auto-flip, ac008 fixture regen ([bfad579](https://github.com/friedbotstudio/baseline/commit/bfad579c8477f813c8aa7b8a30778d3ebd2050cf))
* **harness:** auto-resume across consent gates via Stop-hook rung 4 ([1333cb7](https://github.com/friedbotstudio/baseline/commit/1333cb7bdf3d451ddfac70cdc3bfb8e56db33819))
* **hooks:** branch-aware git consent policy with /grant-push gate ([3a3314e](https://github.com/friedbotstudio/baseline/commit/3a3314ebe18c342e77d1b39c932e202985461a2e))
* **init-project:** explicit gate at Step 5 review surface ([5a79b1c](https://github.com/friedbotstudio/baseline/commit/5a79b1cb95204e7ab8d815e97425bf1709ab91ba))
* **memory:** add backlog bucket for future-work intent extraction ([54a9235](https://github.com/friedbotstudio/baseline/commit/54a923512cd620e35d5450441ad85fa829bd796a))
* **workflow:** add /memory-flush as workflow Phase 10.6 (end-of-workflow memory curation) ([a3c55f8](https://github.com/friedbotstudio/baseline/commit/a3c55f89d9d97a6debc8e722df918280826d0892))

# [0.2.1](https://github.com/friedbotstudio/baseline/compare/v0.2.0...v0.2.1) (2026-05-14)

### Bug Fixes

* **release:** release refactors and constitution scope changes ([149e415](https://github.com/friedbotstudio/baseline/commit/149e4157c4da749c9cfba5b96374a81ab24343a0))

### Features

* **site:** wire Google Analytics 4 into the Friedbot Studio site ([14f06f6](https://github.com/friedbotstudio/baseline/commit/14f06f6ad7acc38ccc3674899e13d9519e9b12f0))

# [0.2.0](https://github.com/friedbotstudio/baseline/compare/v0.1.0...v0.2.0) (2026-05-14)

### Bug Fixes

* **cli:** exclude manifest.json from install copy + make .npmrc opt-in ([ae351e2](https://github.com/friedbotstudio/baseline/commit/ae351e2d56702218588b294eb028f0abbef02970))
* **release:** revert branches range modifier (semantic-release ERELEASEBRANCHES) ([06f79a4](https://github.com/friedbotstudio/baseline/commit/06f79a4ba523c787250364055e4a44572a5f4b2d))

### chore

* **release:** cap main at 0.x + breaking → minor (alpha safety belt) ([0682a28](https://github.com/friedbotstudio/baseline/commit/0682a2838df68e7690f776bf8d1a03b0ba2aaec4))

### BREAKING CHANGES

* **release:** / feat! commits from default major to minor so they
actually cut a release within 0.x (0.N → 0.N+1) instead of being silently
skipped by the cap.

Net effect during alpha: feat → minor; fix → patch; feat! / BREAKING
CHANGE → minor (the 0.x semver convention); chore(release / site / ci /
actions) and build → no release (existing rules). When ready for 1.0,
remove both modifications in one chore.

The corresponding release-workflow test (test_when_releaserc_parsed_then_branches_is_main_capped_at_0x_and_next_prerelease,
renamed from the plain-main predecessor) was updated to assert the new
branches shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
