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
- **`backlog-decay` sweep mode** (`/memory-flush` Step 0d) — `node .claude/skills/memory-flush/sweep.mjs --mode backlog-decay --memory-dir .claude/memory --threshold-days 90` lets the curator prune long-open backlog entries via `keep / drop / picked-up / skip` replies. `drop` and `picked-up` stamp `status:` + `superseded-at:` so Step 0a auto-closes them next run.
- **Q-NNN allocator** at `.claude/skills/memory-flush/next-q-id.mjs` — returns `Q-NNN` for the next pending-questions ID (max+1 zero-padded). Counts CLOSED entries against the max so a closed Q-007 still increments to Q-008.
- **Size-cap visibility** in the SessionStart index. Per-file Status column flips to `over-cap` when the file exceeds its declared `size-cap`, plus a `## Files over size-cap` block worst-overage first. `landmarks.md` now visibly flagged at 513/500.
- **Mid-flight workflow callout** in the SessionStart additionalContext. When `workflow.json` exists and `completed[]` doesn't include `commit`, surfaces `Workflow <slug> is mid-flight — /harness to resume, /triage to abandon`.
- **Pending-memory advisory** in the `/grant-commit` SOP — non-blocking surface that names the candidate count before writing the consent token.
- **`source:` provenance stamps** on auto-emitted candidates: `inferred-from-code` on landmarks, `library-pinned` on libraries. Aligns the auto-extractor with the README schema.
- **Widened intent triggers** in `memory_stop.mjs` — 5 anchored patterns mined from this repo's backlog corpus: `we (need to|should|must|ought to|have to)`, `(cure|mitigation|remediation|remedy):`, `follow-up:`, `future work:`, numbered-action lists. Precision regression traps verify mid-sentence forms still don't fire.
- **Form B closure documentation** in `.claude/memory/README.md`. Both `## <key> — CLOSED <date>` heading suffix (Form B) and structured `resolved-at:` / `superseded-at:` (Form A) are now documented as first-class closure signals. R4 prose pattern documented alongside R1–R3.
- `.claude/skills/lib/probe.mjs` — shared JSON-extraction helper for test fixtures. Three verbs: `field <key>` (extract a top-level scalar), `block <name>` (extract `hookSpecificOutput.<name>`), `additional-context` (alias). Reads JSON from stdin; replaces the `python3 -c '...'` idiom in 6 test fixtures across `.claude/hooks/tests/` and `.claude/skills/changelog/tests/`.
- Three structural regression tests guarding the new invariants: `tests/no-python3-in-shipped-tree.test.mjs` (scans `.claude/skills/` + `scripts/` for any `python3` invocation outside the analyzer-regex exemption list), `tests/governance-no-python3-runtime.test.mjs` (enumerates four governance files and forbids `python3` mentions outside the documented historical-narrative lines), and `tests/appendix-a-mirror.test.mjs` (asserts byte-equality on the `.claude/hooks/` Appendix A row between `CLAUDE.md` and `src/CLAUDE.template.md`).
- Version-aware no-op fast-path in `create-baseline upgrade`. When `<target>/.claude/.baseline-manifest.json → baseline_version` equals the running CLI's `package.json → version` AND no pending stage exists AND every dry-run action is benign (`NOOP` / `MARKER_MATCHED` / `NEVER_TOUCH_PRESERVE`), the CLI prints `already on baseline X.Y.Z; nothing to do` and exits 0 with zero filesystem writes. New `isVersionAwareNoop` export in `src/cli/merge.js`; called from `src/cli/tui/upgrade.js → run()` (TTY) and `bin/cli.js → runPlainUpgrade` (non-TTY) after the pending-stage check, before the full three-tier engine.
- `baseline_version` field stamped into `<target>/.claude/project.json` on every install + upgrade write path. New foundation module `src/cli/project-json.js → refreshBaselineVersion(target, version)` performs a narrow read-modify-write (atomic tmp+rename via `randomUUID`) that preserves every other top-level user-defined key byte-for-byte. Mirrors the atomic-write convention from `src/cli/reconciliation-marker.js`.
- One-line bullet in `bin/cli.js` HELP_TEXT under `Upgrade:` naming the new fast-path message + exit-0 contract, alongside the existing tier-1/tier-2/tier-3 bullets.
- `marker.mjs` shipped CLI helper at `.claude/skills/upgrade-project/marker.mjs` — Node ESM, stdlib only, byte-parity peer of `src/cli/reconciliation-marker.js → recordReconciliation`. Subcommand `record <target> <rel> <baseline_version> <template_sha>` writes `<target>/.claude/.baseline-reconciliations.json` atomically (write-then-rename via `randomUUID` tmpfile). Exit 0 success, 1 on filesystem error, 2 on bad args. Closes the v0.8.1-class bug where `/upgrade-project` invoked `node -e "import('./src/cli/reconciliation-marker.js')..."` against the target's cwd — consumer installs only receive `.claude/`, so every reconciliation hit `ERR_MODULE_NOT_FOUND` on the marker write. Spec: `docs/specs/marker-helper-shipped-instead-of-dev-import.md`.
- `scan-shipped-skills.mjs` aggregate scanner at `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs` — re-validates the actual shipped `SKILL.md` content at build time (not just spec drafts). Walks `<root>/<slug>/SKILL.md` immediate children, runs C1 (`DEV_TREE_RUNTIME_REF`) + C3 (`UNSHIPPED_MODULE_IMPORT`) via the extracted shared `analyzer.mjs`. Supports `--shipped-tree <dir>` for build-time use when manifest.json is not yet stamped. Exit 0 CLEAN / 1 NEEDS_REVIEW / 2 BLOCKED / 3 missing root. Wired into `scripts/build-template.sh` Stage 1.6 between prune and template overlay; build aborts on exit 2/3 before manifest stamp so a regressed SKILL.md cannot reach npm.
- `analyzer.mjs` at `.claude/skills/spec-shippability-review/analyzer.mjs` — shared shippability domain helper extracted from `check.mjs`. Exports `collectShellFences(text)` (handles both column-0 tagged fences AND indented bash/sh/shell fences — the typical SKILL.md numbered-list shape the original column-0-only regex missed) and `runDevTreeAndUnshippedChecks(fences, manifest, sourcePath) → findings[]`. Consumed by both `check.mjs` (per-spec drafts) and `scan-shipped-skills.mjs` (aggregate scan).
- Three-tier upgrade flow for `create-baseline upgrade`: tier 1 binary prompt (with new "Keep your version / Use new baseline / Show diff" labels and a Show-diff re-prompt loop capped at two consecutive picks), tier 2 mechanical merge via `git merge-file --diff3` (auto-merges textually non-overlapping local + upstream changes), tier 3 semantic staging that writes BASE + INCOMING + a per-run manifest under `.claude/state/upgrade/<ts>/` for the new `/upgrade-project` Claude Code skill to reconcile.
- New `/upgrade-project` maintenance skill at `.claude/skills/upgrade-project/SKILL.md` (owner: baseline; 38 total skills, +1 maintenance category). Reads the staged BASE / INCOMING / LOCAL trio per pending file, reasons through three-way deltas in main context, writes reconciled bytes to LOCAL, deletes the stage on all-RECONCILED. Supports `args=dry-run` (emit unified diff, no writes). Fallback: `NEEDS_USER_INPUT` status with a targeted question when the LLM cannot disambiguate. Declares the **zero-drift renumbering rule** for structural conflicts (e.g. both sides add Article XI → user content shifts to next available slot, never folds — so the next upgrade produces zero new staging entries).
- `src/cli/upgrade-tiers.js` — new Domain module: `dispatchByTier`, `resolveBase` (hybrid local-cache + npm-fallback BASE recovery), `writeStage`, `findPendingStage`, `NoBaseError` with structured `kind` enum.
- `src/cli/diff-render.js` — new Foundation: LCS-based unified-diff renderer with optional ANSI colorize. Pure function, composable from any caller.
- `.claude/.baseline-prior/` cache directory written by `freshInstall` — mirrors the template tree so subsequent upgrades have BASE content for 3-way merge without a network round-trip. Per-directory `.gitignore` with `*` keeps the cache git-invisible.
- `baseline_version` field on the installed `.baseline-manifest.json` (read from CLI's own package.json at install time) so future upgrades can recover BASE via npm fallback when the cache is absent.
- Per-file tier classification in the shipped manifest (`obj/template/.claude/manifest.json`). Every entry is now `{sha256, tier}` instead of bare sha. SEMANTIC_EXPLICIT list (exhaustive): `docs/init/seed.md`, `CLAUDE.md`, `src/seed.template.md`, `src/CLAUDE.template.md`. Defaults: `.sh`/`.mjs`/`.js`/`.py`/`.ts`/`.md` → MECHANICAL; everything else → BINARY_PROMPT. Frontmatter `tier:` field overrides for the rare special case. README.md explicitly defaults to MECHANICAL (NOT SEMANTIC) per project-owner direction.
- New CLI exit codes: `4` = mechanical-merge conflicted (LOCAL on disk has `<<<<<<<` / `=======` / `>>>>>>>` markers); `5` = semantic-merge staging pending (`/upgrade-project` invocation expected).
- New `ACTION_KINDS` in `src/cli/merge.js`: `MECHANICAL_MERGE_CLEAN`, `MECHANICAL_MERGE_CONFLICTED`, `SEMANTIC_MERGE_STAGED`.

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
- **Landmark candidate emission threshold** in `memory_stop.mjs`. Auto-extractor emits only on (Write event) OR (Edit count >= 3). Brand-new files surface immediately; single drive-by edits no longer pollute pending. Added a `Trigger:` field to the candidate body that names the cause (`newly written this session` vs `edited N times this session`).
- **Pending-candidates nag fires in both workflow states.** Previously gated on `workflow.json` absence; now fires whenever pending > 0 with framing per case (`carried over from a prior workflow` vs `accumulated this session — Phase 10.6 will flush before commit`).
- **Resume snapshot caps doubled** in `.claude/hooks/lib/resume_writer.mjs`: `MAX_USER_PROMPTS` 3 → 6, `MAX_FILES` 12 → 24, `MAX_SKILLS` 5 → 10, `MAX_BASH` 5 → 10, `USER_PROMPT_CHARS` 400 → 800. The SessionStart 10KB envelope still enforces the upper bound.
- **Resume freshness gate removed.** Snapshots surface regardless of age. The 7-day cutoff was defensive but cost more than it saved; replaced with prominent `(snapshot age: <N>d — verify before relying)` framing when age > 7d.
- **Memory README + memory-flush SOP** corrected for `.sh` → `.mjs` rename completed in commit 756dd42, plus other live-file drift caught in this session's drift analysis (landmarks.md ×15, decisions.md ×1, backlog.md ×3, src/memory/_pending.template.md ×2, src/memory/_resume.template.md ×2, spec-shippability-review SKILL.md ×1).
- **Memory-flush SKILL.md Step 3 HEAD wording** updated to describe the new fall-through-to-date semantics; the prior claim that `HEAD` is permanently fresh on git was removed.
- `src/project.template.json → test.cmd` from `bash .claude/skills/audit-baseline/audit.sh --file={file}` to `node .claude/skills/audit-baseline/audit.mjs --file={file}`. The pristine template ships to every new install via `npx @friedbotstudio/create-baseline`; without this rewrite, fresh installs would have pointed at the deleted `.sh` file.
- `scripts/build-template.sh` `AUDIT_SCRIPT` path and invocation (`bash` → `node`) so the build's drift self-check exercises the ported audit at every release.
- Five skill SOPs (`memory-flush`, `commit`, `harness`, `tdd`, `audit-baseline`) and three command docs (`init-project`, `init-project-doctor`) updated to reference `.mjs` helpers instead of the removed `.py` / `.sh` paths.
- `.claude/memory/conventions.md → hook-script-shape` entry rewritten for the Node ESM convention (`import lib/common.mjs`, `readPayload`, `emitAllow`/`emitBlock`/`emitAsk`/`emitInfo`); the prior `python3 heredoc, no jq` description is retired.
- 17 `landmarks.md` entries pointing at the removed `.py` / `.sh` paths refreshed to the new `.mjs` paths (per `/memory-flush` Phase 10.6 sweep, spec Q-SP-03 resolution).
- Article XI Appendix A row in `CLAUDE.md` (and its `src/CLAUDE.template.md` mirror) — hook scripts are now Node ESM (`.mjs`), not "Bash + python3, no jq". Mirror byte-equality preserved.
- `docs/init/seed.md` runtime requirements (§1 Baseline truth) — removed the "`python3` on PATH (skill-only)" bullet entirely. `node ≥ 18.17` is now the only scripting-runtime requirement. Mirror in `src/seed.template.md` updated identically.
- Two site-src copy renames: `site-src/memory.njk` figcaption and `site-src/skills/core.njk` bullet now name `sweep.mjs stamp-closure` (was `sweep.py stamp-closure`) for the backlog auto-close narrative.
- `.claude/skills/upgrade-project/SKILL.md` Procedure step 5 — invokes `node .claude/skills/upgrade-project/marker.mjs record <target> <rel> <baseline_version_to> <incoming_sha256>` instead of the broken `node -e "import('./src/cli/reconciliation-marker.js')..."`. Existing constraints around `.baseline-reconciliations.json`, dry-run no-write, and the SHALL NOT exception list are preserved verbatim.
- `.claude/skills/spec-shippability-review/check.mjs` — refactored to delegate C1 + C3 to `analyzer.mjs`. C2 (`DEV_HELPER_EXTENSION`) stays local since it scans write_set lines, not shell fences. The per-spec report JSON shape (`{slug, spec_path, verdict, generated_at, findings[]}`) is byte-identical to the pre-refactor shape, so `spec_approval_guard.sh` consumes it unchanged. All 4 existing fixture tests pass byte-equal after the refactor.
- TUI customization prompt verbiage replaced. The old labels `Keep mine` / `Take theirs` (git-rebase terminology that flips meaning depending on perspective) become `Keep your version` / `Use new baseline` / `Show diff` (installer-correct framing with diff preview).
- `bin/cli.js` help text updated from "three-way merge" to a three-tier description naming the new exit codes and the `/upgrade-project` reconciliation skill.
- `MANIFEST_VERSION` bumped from `1` to `2` on the installed manifest (`buildManifestFromDir` emits the new version; `baseline_version` field optional via opts arg). Shipped manifest bumped from `2` to `3` to carry the new per-file `{sha256, tier}` object shape. Consumer reads tolerate both shapes (bare sha → fall back to BINARY_PROMPT tier).
- `dispatchUpgrade` in `bin/cli.js` and `tui/upgrade.js → run()` short-circuit when `findPendingStage` returns non-null — re-invoking `upgrade` with a pending stage prints the same "run /upgrade-project" pointer without re-staging or re-prompting (idempotency AC-007).
- `audit-baseline.sh` handles both v2 (bare sha string) and v3 (`{sha256, tier}` object) manifest file entries — `expected_hash = entry if isinstance(entry, str) else entry.get('sha256')`.
- Shipped manifest relocated from `obj/template/manifest.json` (template root) to `obj/template/.claude/manifest.json` (inside the `.claude/` subtree). The recursive install now delivers it directly to `<target>/.claude/manifest.json` with no special-case copy step, fixing both the visual clutter of a top-level `manifest.json` in consumer projects AND the consumer-side audit's hash-drift detection (`audit-baseline/audit.sh` reads the manifest from `<root>/.claude/manifest.json` first, with a fallback to `obj/template/.claude/manifest.json` for the dev repo). CLAUDE.md Article XI, `seed.md` §17, and their `src/*.template.md` byte-mirrors all carry the new path. `COPY_EXCLUDE` is now empty (the previous `manifest.json` exclusion is no longer needed — the manifest lives inside `.claude/` so the recursive walk picks it up at the same path the consumer expects). Legacy-buggy installs that already have a stray `target/manifest.json` at root from a prior upgrade get it auto-pruned on the next upgrade (newFiles lacks the top-level path; oldFiles has it; threeWayMerge takes the PRUNE branch).
- Every usage-class error in the CLI now flows through a single `usageError(msg)` helper in `bin/cli.js` that routes to `meta.renderUsageError` — branded banner + `Error: <msg>` + canonical HELP_TEXT, all to stderr. The parseArgs catch translates `Unknown option '--upgrade'` into a friendly "Did you mean `create-baseline upgrade <target>`? `upgrade` is a subcommand, not a flag." hint (and same for `--doctor`). Help-text accompanies every non-success exit so users always see usage guidance alongside the failure.
- CLAUDE.md Article IV phase table grew a Phase 11.5 sub-row mirroring the 10.5 and 10.6 pattern.
- `commit/SKILL.md` prereq line tightened from "BOTH archive AND memory-flush" to "ALL of archive AND memory-flush AND changelog".
- `harness/SKILL.md` phase ordering text and state-machine resume table now name the changelog step between `/grant-commit` and `commit`.
- `triage/SKILL.md` four task-seeding templates (chore, tdd-entry, spec-entry, intake-entry) now insert a `Run /changelog` task between `Wait for /grant-commit` and `Run /commit`. Non-git projects auto-except `changelog` alongside `commit`.
- `CHANGELOG.md` migrated to keepachangelog 1.0.0 format. Version blocks moved from `# [version]` (single hash) to `## [version]` (double hash); the file gained a top-level `# Changelog` heading and a `## [Unreleased]` section.
- `scripts/build-template.sh` audit step moved from Stage 0 to after the manifest rebuild, closing a chicken-and-egg loop on any workflow that edits baseline-owned `SKILL.md` files.
- `package.json` description retired the "Zero-dependency Node CLI scaffolder" claim. The package now ships exactly one runtime dependency (see Added above) and the description reflects the branded interactive flows.
- `src/cli/merge.js → threeWayMerge` grew an opts object: `{dryRun, onSkipCustomized}`. Default behavior is unchanged; `onSkipCustomized` lets the upgrade TUI resolve `SKIP_CUSTOMIZED` actions via user prompts and reclassify them as `OVERWRITE` when the user picks "take-theirs".
- `bin/cli.js` argv parser dropped `merge` from its option set. `--help`, `--version`, install, upgrade, and doctor each route to a branded path when `process.stdout.isTTY` is true and to today's plain output when false. The router uses dynamic `await import('../src/cli/tui/*.js')` so clack never loads on the non-TTY path.
- README.md and the docs site (`site-src/install.njk`, `site-src/cli.njk`) updated to describe the `upgrade` subcommand, the retired `--merge` flag, the `doctor --json` mode, and the new runtime-dependency posture. The site copy ran through the `humanizer` pass per Article X.1 user-facing-copy discipline.

### Removed

- `python3` as a runtime dependency. The baseline now requires only `node >= 18.17` (plus `bash`, `git`, and optionally `java` for `/spec-render`'s PlantUML pass). Removed `.claude/skills/memory-flush/sweep.py` (replaced by `sweep.mjs`), `.claude/skills/tdd/drift_check.py` (replaced by `drift_check.mjs`), and 5 in-shell `python3` heredoc wrappers (`audit.sh`, `validate.sh`, `render.sh`, `swarm_merge.sh`, `lint.sh`) — each collapsed into its Node ESM equivalent. Empirically verified by running the full audit on a `PATH` that masks `python3`: exit 0, fails=0, warns=0. Closes backlog item `migrate-bash-python-heredocs-to-javascript-d454`.
- `--merge` flag retired. Passing it now exits 2 with a stderr line pointing the user to `create-baseline upgrade <target>`. The semantics are preserved on the new subcommand; only the surface changed.
- Pre-1.0 break per `.releaserc.json` `releaseRules` (maps `breaking: true` to a minor bump while on 0.x).

### Fixed

- The Phase 11.5 changelog actuator no longer corrupts `CHANGELOG.md`. `unreleased-writer.mjs` now bounds the `## [Unreleased]` body at the next level-1 OR level-2 heading (it had recognized only level-2 `##` headings and silently deleted every level-1 `# [x.y.z]` released block below `[Unreleased]`), and locates the `[Unreleased]` heading by line-anchored match so a prose mention in the intro is never mistaken for the real heading. One-time `CHANGELOG.md` structural cleanup merged a duplicate buried `[Unreleased]` into the canonical single section. (The separate defect where the actuator classifies from `git log` instead of the staged diff is tracked for a follow-up.)
- The Phase 11.5 changelog actuator now sources its `[Unreleased]` entries from a caller-supplied `--entries-file` (a JSON array of `{section, body, breaking?}`) instead of classifying `git log`. Phase 11.5 runs before `/commit`, so git-log held already-committed/prior-workflow commits and the actuator re-listed stale work into `[Unreleased]` on every run; the caller — which knows the impending change — now writes the entries. `--preview-only` still uses semantic-release for a version projection. This resolves the follow-up noted above (the classify-from-staged half of the changelog-actuator work).
- `git_commit_guard` now classifies git subcommands via a wrapper- and quote-aware command tokenizer: closes a false-positive (read-only commands mentioning "git commit" are no longer blocked; Q-003) and a consent-gate bypass where a `git commit`/`git push` wrapped in `sh -c` / `eval` / `$(…)` / a subshell evaded gate C.
- `destructive_cmd_guard` now blocks Bash writes to consent tokens/markers under `.claude/state/` (including non-JS-interpreter writes and the `>|` clobber redirect), closing the Bash bypass of the approval gates.
- **Memory subsystem hardening batch (14 findings from review).** Closes two active bugs and seven decay/discipline holes uncovered in a session-start audit of `.claude/memory/`, the three memory hooks, and the `memory-flush` skill. Highlights:
  - **Cross-invocation dedup bug** in `memory_stop.mjs` — the `existingKeys` regex captured only the path token before ` → target.md`, so the lookup key never matched. Every session re-emitted the same candidates; `_pending.md` accumulated 6× duplicates of the same 4 files. Widened the capture to `(.+?)\s*$` so the full key matches. Regression tests at `tests/memory-stop-dedup.test.mjs`.
  - **Closure detection misaligned with actual entry style.** `pending-questions.md` Q-NNN entries close via `## Q-005 — CLOSED 2026-05-16` heading suffix + `- Resolution:` body. The sweep recognized neither. Extended `sweep.mjs modeAutoClose` to detect the heading suffix (em-dash or ASCII `--`) and added prose pattern R4 (`^(\s*-\s*)?\*{0,2}Resolution\s*:`).
  - **`verified-at: HEAD` decay-evasion hatch closed.** `memory_session_start.mjs` and `sweep.mjs` short-circuited staleness when `stamp === 'HEAD'` on git repos. HEAD now falls through to date-based check on `last-touched`. 5 entries that were silently fresh-forever surfaced as stale.
  - **`stripFrontmatter` hardened against body horizontal rules.** Replaced `indexOf('---')` substring search with line-anchored `^---$` lookup. A `---` substring inside a frontmatter field no longer silently truncates content.
- `create-baseline upgrade` write paths now persist `baseline_version` into the saved `<target>/.claude/.baseline-manifest.json`. Prior to this fix, `src/cli/tui/upgrade.js → loadManifests` and `bin/cli.js → runPlainUpgrade` called `buildManifestFromDir` without the `baseline_version` option, so the saved manifest dropped the field. `isLegacyManifest` then flagged every subsequent upgrade as legacy and re-surfaced the `Your previous install predates version-tracked manifests` warning on every run, even after the user had already reconciled. With this fix, the field round-trips correctly and the warning fires at most once during the post-fix migration upgrade.
- `.mcp.json` deep-merge no longer reports as an applied update when the merged content is byte-identical to the existing target. `src/cli/mcp.js → deepMergeMcpServers` now returns `{wrote: boolean}` after computing the merged bytes in memory and comparing against the existing target file; `src/cli/merge.js` reads the flag and classifies the action as `NOOP` instead of `SPECIAL_MERGE` when `wrote: false`. Idempotent re-runs against an unchanged template no longer rewrite `.mcp.json` or inflate the `Applied N update(s)` count. Existing baseline-refresh semantics (template-named servers refreshed from template; user-added servers preserved) are unchanged.
- Test discipline note for fixture-based bash tests with `out="$(cmd)" || true` patterns: the `|| true` clobbers `$?` to zero regardless of what the command returned. The `consent-expired_test.sh` rewrite drops `|| true` and reads `$?` directly; `set -uo pipefail` (no `-e`) propagates the exit code without aborting the test.
- `doctor` error-path rendering. When the target lacks `.claude/.baseline-manifest.json`, the TTY path now renders the same `Baseline doctor` brand frame as the success path (target line in muted ink, error line with red `doctor:` marker) instead of falling through to the plain renderer. The router no longer short-circuits errors away from the TUI.

### Security

- Closed the consent-gate Bash-bypass class on the commit/push and spec/swarm approval paths — both wrapper-form command evasion (`sh -c "git commit"`) and Bash-written approval tokens are now denied.
- `extractFromTarball` in `src/cli/upgrade-tiers.js` adds a defensive `resolve(candidate).startsWith(tmpRoot + sep)` check after `tar -xz` extraction. Both `bsdtar` (macOS default) and GNU tar reject absolute paths and `..` components by default, but the explicit check makes the safety contract platform-agnostic and survives future tar-binary behavior changes. On escape, throws `NoBaseError{kind: 'tarball_path_traversal'}` which routes the file to the tier-1 binary-prompt fallback (never uses LOCAL as BASE).
- `/upgrade-project` skill body declares a path-validation constraint: before writing reconciled bytes to LOCAL, the skill must verify `path.resolve(target, rel)` is a descendant of target. Stage manifest `rel` values that escape route to `NEEDS_USER_INPUT` with reason `path-traversal-rejected` — defense in depth against a local attacker who has prior write access to `.claude/state/upgrade/`.
- npm registry trust boundary unchanged: tarballs fetched via `libnpmpack.pack('@friedbotstudio/create-baseline@<v>')` are sha256-verified against the consumer's installed manifest before being used as BASE. Mismatches throw `NoBaseError{kind: 'npm_sha_mismatch'}`. Legacy `manifest_version: 1` installs (no `baseline_version`) cannot recover BASE → tier-2/3 files route to tier-1 binary prompt with a one-time notice.
- BASELINE pixel-art wordmark splash for the CLI. New `src/cli/tui/splash.js` renders the wordmark in three bands of FBS orange (bevel: shadow / mid / highlight / mid / shadow) plus a thin `▔` outline trace. Surfaces: `--help` (splash + canonical HELP_TEXT), `--version` (wordmark + version line marquee), no-arg TTY landing (splash, exit 0), and slim brand strip on the install / upgrade intros (`▲ BASELINE v<ver> / <action>`). Non-TTY paths and narrow terminals (< 60 cols) degrade gracefully to the plain HELP_TEXT body. The docs-site CLI page (`site-src/cli.njk`) embeds a frozen PNG of the splash inside the existing `.install-snippet` terminal chrome; PNG background uses `#080b12` (sRGB of `oklch(15% 0.015 260)`) so it merges seamlessly with the site's `--code-bg`.
- New `paintRGB` + `PALETTE` exports on `src/cli/tui/tokens.js` plus a third `accentShadow` orange triple (`#7a2907` ≈ `oklch(35% 0.15 41.5)`) so the wordmark can paint each row in its bevel-band color.
- Regression test suites: `tests/splash.test.mjs` covers wordmark structure (6 rows: 5 letter bands + 1 outline trace), uniform width, `wordmarkFits()` thresholds (treats falsy `columns` as wide-enough so `script(1)` ptys still render the marquee), command-table presence, version-line absence (docs-PNG-staleness regression guard), and brand-strip composition. `tests/cli-tui.test.mjs` gained five regression tests asserting that every usage-class error (parseArgs failure, unknown flag, missing target, mutually-exclusive flags, existing-baseline conflict) prints `HELP_TEXT` after the branded error message — closing the `Error: Unknown option '--upgrade'` UX gap where Node's `parseArgs` noise leaked into stderr.
- Phase 11.5 `changelog` skill that curates per-commit entries under `## [Unreleased]` in this file before `/commit` stages the diff. Same `commit_consent` token authorizes both the changelog step and the commit step; no new gate. `--preview-only` mode prints the projected next version without writing files.
- Asymmetric bento composition for the architecture diagram on the public docs site. Single inline SVG, two layout regimes: bento at viewports wider than 768px and a vertical stack at narrower viewports. CSS custom properties carry the cell coordinates; `@media (max-width: 768px)` swaps the regime.
- `reinsertUnreleasedHeading` export in `unreleased-writer.mjs` as a release-time fallback. The `@semantic-release/changelog` plugin prepends release notes above existing headings; the export restores the canonical `# Changelog` then `## [Unreleased]` ordering at the top of the file.
- Branded terminal UI for the `create-baseline` CLI. New `src/cli/tui/{install,upgrade,doctor,tokens,meta}.js` modules render install / upgrade / doctor / help / version flows with Friedbot Studio brand colors (oklch palette translated to 24-bit truecolor ANSI), clack-style intro / spinner / outro framing, and interactive per-file conflict resolution on the new `upgrade` subcommand. Non-TTY invocations (CI / piped stdout) fall through to the prior plain output line-for-line; `@clack/prompts` is dynamic-imported only on the TTY path.
- New `create-baseline upgrade [target]` subcommand. In a TTY, presents each customized-stale file as a `keep-mine / take-theirs / abort` `select` prompt; in CI, reproduces the prior `--merge` behavior (exit 3 on any skipped customization).
- `create-baseline doctor --json` flag. Emits the structured `DoctorReport` as a single JSON line on stdout for CI consumers; honors `--strict`; exit codes unchanged.
- Single pinned runtime dependency, `@clack/prompts@1.4.0`. First runtime dep this package has ever shipped; transitive closure is six packages (`@clack/core`, `fast-wrap-ansi`, `fast-string-width`, `fast-string-truncated-width`, `sisteransi`), all under reputable maintenance, `npm audit` clean at adoption time. The `DEPS_ALLOWLIST` constant in `scripts/check-files-diff.mjs` is the supply-chain contract that gates future additions.

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
