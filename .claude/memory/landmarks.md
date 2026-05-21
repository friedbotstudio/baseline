---
owners: [scout]
category: codebase landmarks
size-cap: 500
key: path:line
verifies-against: git
---

# Codebase landmarks

Where things live in this repo. The `scout` skill cites these and re-verifies before use; failed verifications are corrected or deleted in the same run.

Each entry's stable key is `path:line`.

---

## .claude/hooks/lib/common.sh:1

- Role: shared bash helpers for every guard hook (payload parsing, decision emitters, common path constants, plus consent-gate marker helpers and `canonical_rel`)
- Companion: `.claude/hooks/lib/common.mjs` (JS-port pilot, see landmark below). The two parallel libraries coexist while the bash → mjs port is incremental; bash hooks source `common.sh`, the two JS-ported hooks (`git_commit_guard.mjs`, `consent_gate_grant.mjs`) import from `common.mjs`.
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: every hook script sources this; breaking changes here cascade. Edit with the entire hook fleet in mind.

## bin/cli.js:1

- Role: `create-baseline` CLI entrypoint — argv routing, mode dispatch (fresh / `--force` / `upgrade` subcommand / `doctor` subcommand / `--dry-run`), exit codes 0/1/2/3/4.
- TTY routing: `dispatchInstall`, `dispatchUpgrade`, `dispatchDoctor` each branch on `process.stdout.isTTY` and dynamic-import the matching `src/cli/tui/*.js` module on the TTY path; non-TTY falls through to the plain path so clack never loads in CI. The `--help` and `--version` branches do the same against `src/cli/tui/meta.js` (TTY → brand banner, non-TTY → bare body).
- `--merge` flag removed in branded-cli-tui; passing it now exits 2 with stderr line pointing to `create-baseline upgrade <target>`. The router catches `parseArgs`'s unknown-option throw and emits the migration message before exit.
- Doctor adds `--json` flag: emits `JSON.stringify(report)` on stdout with the same exit codes; `--strict` still escalates customizations to exit 1. Error reports (no-manifest) also route through the TUI renderer when `process.stdout.isTTY` — no more short-circuit to the plain text formatter.
- Verified-at: 2c1527a
- Last-touched: 2026-05-18
- Caveat: depends on every src/cli/*.js module + needs `obj/template/` to exist (run `npm pack` or `bash scripts/build-template.sh` first). Tests can override the template dir via `CREATE_BASELINE_TEMPLATE_DIR=<path>` env var without running the full build (read at `bin/cli.js:73`).

## src/cli/plantuml.js:1

- Role: deferred-fetch logic for the upstream PlantUML jar — sha256-pinned, redirect-handling, mock-friendly via `opts.fetch`
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: pinned constants (`PINNED_SHA256`, `UPSTREAM_URL`, `PINNED_SIZE`) must update in lockstep with `.claude/bin/NOTICE` when the upstream PlantUML version bumps

## scripts/build-template.sh:1

- Role: regenerates `template/` from the live root via rsync + src/*.template.* overlay; invoked at `prepack`
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: the rsync exclude list is the authoritative ship-vs-don't-ship surface — extend when new dev-only paths land at root

## .claude/hooks/spec_design_calls_guard.sh:1

- Role: the 21st write-boundary hook. Blocks writes to `docs/specs/*.md` whose `write_set` intersects `project.json → tdd.ui_globs` unless the spec body declares a populated `## Design calls` section. Structural enforcement of CLAUDE.md Article X.2 (design-task routing through `design-ui`). Conditional firing: skips when `tdd.ui_globs` is empty or when the spec's write_set has no UI files.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: inlines its own copy of `_expand_brace_globs` / `_glob_to_regex` / `_matches_any_glob` in a Python heredoc; the same helpers live byte-identical in `.claude/skills/spec-lint/lint.sh`. Consolidation (a shared `.claude/hooks/lib/glob.py` plus a heredoc-pattern shift) is tracked as a follow-up.

## .claude/skills/design-ui/SKILL.md:1

- Role: pure orchestrator of the vendored `impeccable` skill for UI design tasks. Classifies intent (Stage 0: design / development / copy via `references/design-vs-development.md`), translates design intents to an impeccable recipe (Stage 1 via `references/intent-table.md`), orchestrates with state persistence (Stage 2 via `references/orchestration.md` + `references/state-machine.md`). Writes only thin glue (state JSON at `.claude/state/design/<slug>.json`, snapshots under `docs/design/<slug>.*.md`, memory candidates) — never product code. Per Article X.2, every UI design task inside a workflow phase routes here.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: v1 of design-ui (code-writing role, "implements a frontend interface") was retired in the same commit. Old framing survives in some prior memory entries; the current contract is in this SKILL.md plus the four siblings under `references/`.

## .claude/skills/harness/SKILL.md:1

- Role: end-to-end workflow orchestrator. Per-tick atomicity (one `Skill(phase)` call + one `.claude/state/harness_state` write per tick). Walks the 11-phase pipeline, invokes each phase skill in order, yields at consent gates (`/approve-spec`, `/approve-swarm`, `/grant-commit`) and at `needs_user` task placeholders, decides swarm-vs-solo at Phase 6, auto-loops `/tdd` on bounded integrate failures. Invokable by both the user (slash command) and the model (`Skill(harness)`).
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: auto-continuation across non-gated phase boundaries is driven by the `harness_continuation` Stop hook reading `harness_state` AND the session-scoped marker `.claude/state/.harness_active`. Three-rung gate: (1) `stop_hook_active` absent on payload, (2) `.harness_active` marker exists, (3) `harness_state.state == "continue"`. Marker is the in-the-loop signal — created by the harness skill on every `continue` write (marker FIRST), deleted on `yielded`/`done` (marker FIRST), and cleaned unconditionally by `memory_session_start.sh` on session boundary so cross-session ghost resumption is structurally impossible. The harness-auto-continuation workflow (archive: docs/archive/2026-05-12/harness-auto-continuation/) introduced the Stop hook with a freshness-window + tick-cap design; the harness-active-marker workflow (in flight on this branch) replaced that with the cleaner three-rung gate after the freshness window proved structurally too tight for real-world tool-call latency.

## .claude/skills/audit-baseline/audit.sh:1

- Role: drift-check between this repo's implementation and the constitution + seed.md. Verifies hook/agent/skill/command names + counts, settings.json wiring, project.json key presence, .mcp.json servers, vendored license files, helper script presence, and per-file memory-shape canonical preamble via the `is_valid_preamble(text)` helper (strict opener `^# `, full preamble must include a closing `---` separator; `_pending` and `_resume` get the same shape check). Skill-ownership drift uses `load_manifest()` which tries `<root>/.claude/manifest.json` first (consumer projects) and falls back to `<root>/obj/template/.claude/manifest.json` (dev repo) — keep both paths in mind when reasoning about why the audit found or didn't find the manifest. Exit 0 PASS / 1 FAIL. Wired as the binding `project.json → test.cmd` for this project, so every `verify` stamp at `.claude/state/last_test_result` is grounded in this script's verdict.
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: the script's `EXPECTED_*` count constants are load-bearing — any chore that adds/removes a hook, skill, or command bumps the counts here AND in CLAUDE.md/seed.md/README.md. The `is_valid_preamble` helper allows preamble-only files (empty body after the closing separator) so a freshly-emptied `_pending.md` still PASSes; opener-only files without a closing separator FAIL (regression trap captured in `tests/preamble_check_test.sh`). When the manifest is missing from BOTH lookup paths (e.g. fresh clone before `npm run build`), the audit emits a WARN-level "skill ownership: manifest" line and falls back to frontmatter scanning — drift detection is degraded but not failing.

## .claude/hooks/consent_gate_grant.mjs:1

- Role: UserPromptSubmit hook that parses `/approve-spec` / `/approve-swarm` / `/grant-commit` / `/grant-push` in the user's raw prompt **before Claude is invoked**, derives the canonical slug via `lib/common.mjs → canonicalSlug`, and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (spec/swarm/commit/push) then allows Claude's approval-token write only when the marker is present, fresh (TTL = `consent.gate_marker_ttl_seconds`, default 120s), and slug-matched. Single-use; deleted on the allowed write.
- Verified-at: HEAD
- Last-touched: 2026-05-15
- Caveat: this hook is what makes Article IV consent gates structurally un-forge-able. Runs OUTSIDE Claude's tool boundary — Claude cannot reach the UserPromptSubmit code path, so it cannot mint the marker. The matching write-time `.<gate>_grant` Write/Edit/MultiEdit block lives in each PreToolUse approval guard, not here. JS-port pilot (one of the first two hooks ported from bash to Node ESM); the remaining 20 hooks are still `.sh`.

## .claude/hooks/spec_approval_guard.sh:1

- Role: PreToolUse hook on Edit/Write/MultiEdit enforcing Article IV gate A. Validates that a fresh `.spec_approval_grant` marker exists before allowing approval-token writes to `.claude/state/spec_approvals/<slug>.approval`; blocks self-approval inside spec markdown bodies; blocks direct writes to the marker file itself.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: pair this with `swarm_approval_guard.sh` and `git_commit_guard.mjs` (JS-port pilot) — the three approval guards share the same marker-validation pattern. `lib/common.sh → canonical_slug` and `lib/common.mjs → canonicalSlug` are the parallel slug-derivation entry points; both implement the same "strip directory + trailing .md" canonicalization.

## .claude/hooks/swarm_approval_guard.sh:1

- Role: PreToolUse hook on Edit/Write/MultiEdit enforcing Article IV gate B. Validates that a fresh `.swarm_approval_grant` marker exists before allowing approval-token writes to `.claude/state/swarm_approvals/<slug>.approval`; blocks direct writes to the marker file itself.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: parallels `spec_approval_guard.sh` exactly; consolidation into one shared guard library is a known follow-up but blocked on the same `lib/common.sh` glob/marker refactor as `spec_design_calls_guard.sh`.

## src/seed.template.md:1

- Role: pristine ship-time template for the project's genesis prompt (`docs/init/seed.md`). `npx @friedbotstudio/create-baseline` overlays this onto a fresh target tree; `scripts/build-template.sh` regenerates `obj/template/` from it. Per Article I.4 precedence, this template is the source of truth for the baseline's shape — any drift between `docs/init/seed.md` and this file means the genesis is out of step with what ships.
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: byte-equal mirroring obligations apply only to specific sections, not the whole file. §17 (manifest provenance) must carry the same manifest paths in both files — `obj/template/.claude/manifest.json` for the shipped manifest and `<target>/.claude/manifest.json` for the consumer install location. The §16 (project-specific configuration) section MUST stay pristine in the template (no `Generated:` stamp, no detected-stack table); the audit emits `seed.template.md: §16 has been populated` if it drifts from the placeholder. Touch the template and `docs/init/seed.md` in the same commit but never bulk-cp from live seed.md to template — the live seed.md has §16 populated and would contaminate the template. Edit §17 by hand in both files.

## src/CLAUDE.template.md:1

- Role: pristine ship-time template for the in-session constitution (`CLAUDE.md`). Per Article XI, this file SHALL remain byte-equal to `CLAUDE.md` for the Article XI block; `audit-baseline` enforces `CLAUDE.md missing Article XI citation` on drift. Article XI carries the manifest-path contract: shipped manifest at `obj/template/.claude/manifest.json`, consumer install at `<target>/.claude/manifest.json`, runtime hash table separately at `<target>/.claude/.baseline-manifest.json`.
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: touch this and `CLAUDE.md` in the same commit. The byte-mirror test (`tests/template-drift.test.mjs`) flips to failure when CLAUDE.md and src/CLAUDE.template.md diverge. The audit hashes every file under tracked skill paths against `manifest.files`, but the constitution mirror is verified via citation-presence checks, not hash equality — that's why the byte-equal obligation lives in this caveat rather than in a hash entry. Pre-existing drift between the two files (e.g., Phase 11.5 changelog row missing from one side) is OUT of scope for the splash workflow but breaks the `tests/template-drift.test.mjs` invariant; fix in its own chore.

## .claude/skills/triage/SKILL.md:1

- Role: workflow entry point. Selects `entry_phase` (intake / spec / tdd / chore), writes `.claude/state/workflow.json`, seeds the `TaskCreate` checklist for every non-excepted phase + consent-gate placeholders (with `metadata.needs_user: true`). Auto-adds `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, `commit` to `exceptions` when the project is non-git.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: the canonical task templates that the harness re-seeds from on every tick live inside this SKILL.md. Article V's "task discipline" rule depends on those templates being authoritative; if you change a phase's task shape, update the template here so harness re-seeding stays reconciled with `workflow.json → completed`.

## .claude/hooks/harness_continuation.sh:1

- Role: Stop hook that auto-resumes the harness across both mid-loop phase boundaries (Path A) and consent-gate yields (Path B). All paths gated by rung 1 (`stop_hook_active` absent on payload). Path A — mid-loop continuation: (2) `.claude/state/.harness_active` marker exists, (3) `harness_state.state == "continue"`. Path B (rung 4) — gate-resume after a consent slash command: (4a) `harness_state.state == "yielded"`, (4b) `workflow.json` exists and parses, (4c) at least one consent token under `commit_consent` / `push_consent` / `spec_approvals/<slug>.approval` / `swarm_approvals/<slug>.approval` has mtime newer than `harness_state`'s mtime. Emits `{"decision":"block","reason":"…invoke Skill(harness)…"}` when Path A or Path B passes; silent otherwise.
- Verified-at: 1333cb7
- Last-touched: 2026-05-17
- Caveat: Path B was added by `1333cb7` (feat(harness): auto-resume across consent gates via Stop-hook rung 4) so the user doesn't need to type `/harness` to resume after `/approve-spec` / `/approve-swarm` / `/grant-commit` / `/grant-push`. The marker presence check moved INSIDE the Python heredoc because Path B fires with the marker absent (the harness skill deletes it on `yielded`). Sanity rail logs WARN to `.claude/state/harness/harness_continuation.log` on marker-slug vs `workflow.json` slug mismatch but does NOT change the decision — intentional, so a stale marker doesn't strand the user. Never writes consent markers; structurally cannot reach `consent_gate_grant`'s code path.

## .claude/hooks/memory_session_start.sh:1

- Role: SessionStart hook that injects the memory index + per-file table + Stale-entries block (top-5 by oldest last-touched, alphabetical-by-`<file>:<key>` tiebreak, `… and N more` overflow) + resume snapshot into the next-turn additional context, reports K candidates pending in `_pending.md`, excludes entries carrying `resolved-at:` or `superseded-at:` from the stale count (closure short-circuits decay), and unconditionally cleans `.claude/state/.harness_active` so cross-session ghost resumption is structurally impossible.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: the harness-active-marker cleanup is what makes the harness's three-rung gate session-bounded — pair this with `harness_continuation.sh:1` and the harness skill's per-tick marker-FIRST discipline. The stale predicate is 30 commits behind HEAD (git) OR 30 days since `last-touched:` (non-git fallback); the non-git threshold matches `.claude/skills/memory-flush/sweep.py:1` so /memory-flush Step 0c re-derives the same set.

## src/cli/doctor.js:46

- Role: `runDoctor(target, options={})` — read-only drift check against `<target>/.claude/.baseline-manifest.json`. Returns `{exitCode, strict, matched, customized, missing, added, tampered}`. With `options.strict: true`, any `customized` entry promotes exitCode to 1 and populates `tampered[]` with `{path, shipped, observed}` sha256 hex triples. Without `--strict`, customized is informational (legacy default exitCode 0). `formatReport(report)` at `src/cli/doctor.js:114` renders `TAMPERED: <path>  shipped=<sha256>  observed=<sha256>` lines when `tampered[]` is populated.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: `--strict` is the post-install supply-chain tampering detector for the AC-006 contract (supply-chain-hardening workflow, 2026-05-13). `bin/cli.js` routes the flag via `parseArgs` and passes it as `{strict: !!values.strict}` to `runDoctor`. The `tampered[]` array exists ONLY when `customized.length > 0`; downstream consumers should `Array.isArray(report.tampered) && report.tampered.length > 0` before reading.

## src/cli/install.js:79

- Role: `freshInstall(templateDir, target)` — bulk `cp -r templateDir target` with a filter that skips `SPECIAL_MERGE` paths (`.mcp.json` → deep-merge) and `COPY_EXCLUDE` paths; then applies `NEVER_TOUCH` (preserve user's `.claude/project.json` if present) and `SPECIAL_MERGE`; then `materializeNpmrc(target)` writes `<target>/.npmrc` from `src/.npmrc.template`; finally writes `<target>/.claude/.baseline-manifest.json` as the runtime hash table. `forceInstall` parallels the shape but with `force: true` and `skipNeverTouch: true`. The shipped sha256 manifest at `obj/template/.claude/manifest.json` (with `owners.skills`) is delivered to `<target>/.claude/manifest.json` by the recursive cp itself — no special-case step — because it lives inside the `.claude/` subtree of the template; `COPY_EXCLUDE` is empty since path-level exclusion is no longer needed.
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: `materializeNpmrc` reads `NPMRC_TEMPLATE_PATH` (resolved relative to `import.meta.url` → package root → `src/.npmrc.template`) — it's a no-op when the template path doesn't exist (fixture / dev tree without the file) AND when `target/.npmrc` already exists (never overwrite operator config). This indirection exists because npm pack mechanically drops top-level `.npmrc` files from published tarballs (see landmines.md → `npm-pack-excludes-dotnpmrc`), so the bytes ship under a non-excluded basename in `src/` and are materialized at install time. The runtime `<target>/.claude/.baseline-manifest.json` and the shipped `<target>/.claude/manifest.json` are two distinct files: shipped is frozen at release time and carries `owners.skills`; runtime is built from `buildManifestFromDir(target, listFiles(target))` post-install and is hash-only. `writeBaselineManifest` excludes `.claude/.baseline-manifest.json` from its own hash table to avoid the self-reference, but DOES hash `.claude/manifest.json` so `upgrade`'s threeWayMerge tracks it as a normal file.

## src/.npmrc.template:1

- Role: pristine ship-time bytes for the target project's `.npmrc`. Contents are exactly `ignore-scripts=true\nmin-release-age=7\n` (38 bytes). Materialized into `<target>/.npmrc` by `src/cli/install.js → materializeNpmrc()` during freshInstall/forceInstall.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: this file is NOT overlaid into `obj/template/` by `scripts/build-template.sh` — npm pack drops `.npmrc` from published tarballs regardless of `package.json → files`. The bytes ship in `src/.npmrc.template` (non-excluded basename) and `install.js` reads them at install time. The `ignore-scripts=true` default protects downstream consumers from postinstall-script supply-chain attacks; `min-release-age=7` (npm 11+) refuses to install registry versions younger than 7 days. AC-007 of the supply-chain-hardening workflow asserts these bytes are byte-identical end-to-end. Tied to runbook §Pre-publish hygiene sweep `~/.npmrc` operator defaults.

## .claude/skills/memory-flush/sweep.py:1

- Role: deterministic actuator for /memory-flush Step 0 AND for /commit Step 6. Four modes via `--mode {auto-close, prose-scan, stale-sweep, stamp-closure}` + `--memory-dir`. auto-close deletes blocks carrying valid `resolved-at:` (pending-questions) or `superseded-at:` (other five canonical files) and flags malformed dates + per-file invariant violations. prose-scan surfaces entries whose body matches R1/R2/R3 (Resolution path/Superseded by/Resolved by, anchored, case-insensitive) and applies stdin replies (y deletes, n keeps, skip defers). stale-sweep re-derives the stale set with the same predicate as `memory_session_start.sh:1` and applies stdin replies (re-verify / delete / mark-closed / skip). stamp-closure (non-interactive) takes `--backlog-keys <csv>` and writes `status: picked-up` + `superseded-at: <today>` to each named backlog.md entry; invoked by /commit Step 6 when workflow.json → source_backlog_keys is populated; report shape `{stamped, missing, already_closed}`. Emits JSON action report on stdout.
- Verified-at: 5a79b1c
- Last-touched: 2026-05-17
- Caveat: the stale predicate's non-git threshold (30 days) MUST stay in sync with `memory_session_start.sh:1`'s `STALE_DAYS` — they re-derive the same set. Spec design diagram says 90 days; the 30-day choice matches the test plan AC-003 row and the index header label `stale (>=30 commits old)`. The helper trusts argv strings reaching `git rev-list` (e.g., the verified-at value as `<stamp>..HEAD`); a malicious memory file could feed a `--exec`-style argv flag — low risk because filesystem write to `.claude/memory/` already implies broader compromise. See `docs/archive/2026-05-13/memory-lifecycle-closure/security.md` LOW finding. stamp-closure has its own LOW finding (CWE-22 path traversal via slug; CWE-78 shell quoting of backlog-keys CSV) — see `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md`; mitigations are non-blocking carve-outs for a future hardening workflow.

## .claude/hooks/tests/memory_session_start_test.sh:1

- Role: fixture-based integration tests for `.claude/hooks/memory_session_start.sh:1`. Covers AC-003 (stale block listing, overflow, alphabetical tiebreak), AC-005 (closure-exclusion in stale count), AC-007 (audit re-run remains green), AC-008 (header+table byte-equality + legacy `_resume.md` compatibility). Builds synthetic `.claude/memory/` trees under tempdirs and invokes the real hook with `CLAUDE_PROJECT_DIR` redirected at the tempdir.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline`); these are runnable manually during /tdd, /simplify, and /integrate. The AC-008 byte-equality test compares against `.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt` — that fixture was captured pre-spec against the live memory tree and represents today's bytes; if the live tree's entry count or stale count drifts, the fixture needs re-capture.

## .claude/skills/memory-flush/tests/run.sh:1

- Role: fixture-based integration tests for `.claude/skills/memory-flush/sweep.py:1`. Covers AC-001 (auto-close on structured closure fields + malformed date handling + invariant violation flagging), AC-002 (prose surface-and-confirm with y/n/skip on anchored R1/R2/R3 matches; mid-sentence non-matches stay silent), AC-004 (stale-sweep with re-verify/delete/mark-closed), AC-006 (no-closure no-prose entries survive all paths + grandfathered legacy entries).
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: invokes `sweep.py` via `python3` and `--memory-dir <tempdir>` — until `sweep.py` exists, every flush test fails RED (correct TDD state, demonstrated during this workflow's scenario-tick). Test order matters for stale-sweep tests because replies are read one-per-entry-iteration from stdin in file-order.

## .claude/skills/chore/SKILL.md:1

- Role: alternate workflow track for tasks that need no TDD — documentation edits, governance count bumps, vendored-skill content updates, configuration tweaks, formatting, typo fixes, dependency bumps where no project code changes, skill consolidations. Skips `/scenario` and `/implement` (no failing test to drive); runs the edits directly; conditionally routes through `simplify` / `integrate` / `document` based on diff triggers. `verify`, `archive`, `/grant-commit`, `/commit` remain mandatory. Selected at `/triage` time when the request matches the chore predicate; recorded as `entry_phase: chore` in `.claude/state/workflow.json`.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: chore is a stripped-down pipeline, not a bypass — silently skipping a triggered conditional phase (e.g., `document` when prose was touched) violates Article IV. The conditional-phase trigger predicates live inside this SKILL.md body and are the authoritative list; the `triage` skill mirrors them when routing.

## src/cli/conflict.js:1

- Role: `SENTINEL_PATHS` (frozen array of 5 install-marker paths: `.claude`, `.claude/.baseline-manifest.json`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`) + `scanSentinels(target)` async helper. Returns the subset of sentinels found in the target tree; `bin/cli.js` uses the non-empty result to short-circuit fresh-install mode with a "prior baseline detected" message and the `--force` / `--merge` / `--dry-run` mode hint.
- Verified-at: 01780d7
- Last-touched: 2026-05-14
- Caveat: `.claude/.baseline-manifest.json` is the strongest "previously installed by create-baseline" signal because its presence implies a successful install; the file header comment in conflict.js explains why the older `README.md` sentinel was dropped (the allowlist build ships no README.md, so users keep their own). Update both `SENTINEL_PATHS` and `bin/cli.js`'s conflict-handling branch in lockstep if the install layout changes.

## .claude/hooks/lib/common.mjs:1

- Role: Node ESM counterpart to `lib/common.sh` (the bash version). Exports `readPayload`, `payloadGet`, `projectGet`, `emitBlock` / `emitAllow` / `emitAsk` / `emitInfo`, `logLine`, `canonicalRel`, `canonicalSlug`, `writeMarkerAtomic`, `validateConsentMarker`, `blockMarkerSelfWrite`, and the consent-marker path constants (`CONSENT_MARKER_{SPEC,SWARM,COMMIT,PUSH}` plus `_REL` siblings). Plus `matchAnyGlob(name, globs)` — a hand-rolled shell-glob matcher used by `git_commit_guard.mjs` for branch-policy evaluation (no third-party deps).
- Imported by: `.claude/hooks/git_commit_guard.mjs`, `.claude/hooks/consent_gate_grant.mjs`. JS-port pilot for two hooks; the remaining 20 bash hooks still source `common.sh`.
- Verified-at: 3a3314e
- Last-touched: 2026-05-16
- Caveat: behavior parity with the bash version is intentional. When extending one, mirror to the other (or document why they diverge in the relevant hook header). The `matchAnyGlob` glob semantics (`*` doesn't cross `/`, `**` does) are the only addition; the bash version has no equivalent because the bash hooks don't need branch matching yet.

## .claude/hooks/git_commit_guard.mjs:1

- Role: PreToolUse hook with two matcher legs (JS-port pilot). (1) Bash leg enforces branch-aware policy: `git commit` on a protected branch (per `project.json → git.protected_branches` glob; `null` = every branch protected) requires fresh `commit_consent` (`/grant-commit`, 5-min TTL); `git push` on a protected branch requires fresh `push_consent` (`/grant-push`, 5-min TTL); both proceed without consent on non-protected branches. `git.branch_pattern` regex (optional) gates commits on branch-name conformance. Detached HEAD denies both with explicit error. Hard-blocks remaining forbidden flags (`--amend`, `--no-verify`, `reset --hard`, `clean -f`, `checkout --`, `branch -D`, `config`, `rebase -i`, `add -A|.`). (2) Write leg gates Claude's writes to the consent files: blocks direct writes to the `.commit_consent_grant` and `.push_consent_grant` markers, and only allows writes to `commit_consent` / `push_consent` when a fresh marker is on disk (single-use, consumed on success). Completes the symmetry with `spec_approval_guard.sh` (gate A) and `swarm_approval_guard.sh` (gate B).
- Verified-at: HEAD
- Last-touched: 2026-05-15
- Caveat: the Bash-leg FORBIDDEN_RE is a raw regex over the command string, not a tokenized argv inspection — Q-003 (pending-questions.md) tracks the trade-off and the `-F /tmp/msg.txt` workaround for commit messages that legitimately mention forbidden git ops. Q-004 (the push-leg / Article VII disagreement) was closed by this hook's rewrite — push is no longer in FORBIDDEN_RE; it's governed by the branch-aware policy. JS-port pilot: one of the first two hooks ported from bash to Node ESM (the other is `consent_gate_grant.mjs`).

## src/settings.template.json:1

- Role: pristine ship-time template for `.claude/settings.json` — the hook wiring + permissions file that `/init-project` copies (or merges) into a target repo. Declares all 22 baseline hooks across PreToolUse / PostToolUse / SessionStart / Stop / PreCompact / UserPromptSubmit events, plus `permissions.allow`/`deny` for tool gating. The overlay source for `npx @friedbotstudio/create-baseline`.
- Companion: `src/project.template.json:1` (the per-project config it pairs with), `src/CLAUDE.template.md:1` (the constitution template).
- Verified-at: 3a3314e
- Last-touched: 2026-05-16
- Caveat: adding a new hook requires touching this file AND the matching Article VIII row in `src/CLAUDE.template.md` AND `docs/init/seed.md` §4.1 — the audit cross-checks all three. `$CLAUDE_PROJECT_DIR` is the only valid path prefix for hook commands; absolute paths leak the author's home directory into installed projects.

## src/project.template.json:1

- Role: pristine ship-time template for `.claude/project.json` — the per-project config the CLI installs with `configured: false`, then `/init-project` populates after running the recommender. Declares `test`/`lint` runners, `tdd` source/test/ui globs, `destructive` Bash patterns, `swarm` config (`min_tasks_worth_swarming`, `isolation`, `exempt_path_prefixes`), `git` branch policy (`protected_branches`, `branch_pattern`), and the consent gate TTL.
- Companion: `src/settings.template.json:1` (hook wiring), `src/cli/install.js:79` (CLI overlay logic).
- Verified-at: 3a3314e
- Last-touched: 2026-05-16
- Caveat: `configured: false` is the project-agnostic operating state (Art. III). `setup_guard` surfaces a one-shot reminder when it sees this; other guards bind regardless. `git.protected_branches: null` (the default) means every branch is consent-gated — set explicitly to `["main", "release/*"]` to loosen.

## .claude/skills/commit/SKILL.md:1

- Role: Phase 11 workflow skill. Stages the diff and runs `git commit` with the message via HEREDOC; the `git_commit_guard` Bash-time hook enforces consent independently. Prereq line 8: BOTH `archive` AND `memory-flush` in `workflow.json → completed` (or in `exceptions`). Step 1 archives `workflow.json` into the slug bundle as the first move; Step 2 verifies memory-flush is the final non-commit entry; Steps 3–7 stage named paths, draft message (humanizer pass on the body), and commit. Non-git projects auto-except this skill at triage time.
- Companion: `.claude/hooks/git_commit_guard.mjs:1` (consent enforcement at the Bash boundary), `.claude/skills/archive/SKILL.md:1` (Phase 10.5 sibling), `.claude/skills/memory-flush/SKILL.md:1` (Phase 10.6 sibling whose completion this skill's prereq depends on).
- Verified-at: be2d941
- Last-touched: 2026-05-17
- Caveat: never `git add -A` / `git add .` (seed.md Pillar 5 forbids both); always stage named paths. Never `git commit --amend` or pass `--no-verify`/`--no-gpg-sign` unless the user explicitly named the operation in their current request. The phase-prereq tightening to require `memory-flush` (added 2026-05-17 with the Phase 10.6 wiring) is structurally enforced by this skill's prose — `git_commit_guard` does not duplicate the check.

## .claude/skills/memory-flush/SKILL.md:1

- Role: Workflow Phase 10.6 owner + ad-hoc curation entry point. Runs between `/archive` (Phase 10.5) and `/grant-commit` (Phase 11) on every track (intake / spec / tdd / chore). The skill SOP composes three `sweep.py` modes (auto-close / prose-scan / stale-sweep) for canonical-file closure (Step 0), then triages `_pending.md` candidates through promote / discard / defer (Steps 1–5), then resets `_pending.md` to skeleton (Step 5), then emits a Step 6 report. On **empty `_pending.md` body** (zero `## CANDIDATE:` blocks) the skill fast-paths: Step 0 sweeps still run unconditionally, Steps 1–5 are skipped, Step 6 emits a one-line "no pending candidates" report. Empty-pending fast-path still appends `"memory-flush"` to `workflow.json → completed` so `/commit`'s prereq is satisfied either way.
- Companion: `.claude/skills/memory-flush/sweep.py:1` (the deterministic actuator the SOP invokes), `.claude/hooks/memory_session_start.sh:1` (the debt-mode session-start nag that signals when ad-hoc invocation is needed outside a workflow), `.claude/skills/commit/SKILL.md:1` (Phase 11 sibling whose prereq depends on this skill's completion).
- Verified-at: be2d941
- Last-touched: 2026-05-17
- Caveat: the empty-pending fast-path skips Steps 1–5 but NOT Step 0 — auto-close on `pending-questions.md` entries carrying `resolved-at:` runs regardless of pending body state. This is how Q-001's resolution propagated in the meta-bootstrap workflow that introduced Phase 10.6. The session-start nag in `memory_session_start.sh` fires only on K>0 AND `workflow.json` absent (debt-mode); during an active workflow the nag stays silent because this skill's Phase 10.6 invocation handles flushing.

## .claude/hooks/memory_stop.sh:1

- Role: Stop-event Bash hook with embedded `python3` heredoc that extracts three candidate kinds from the per-turn transcript JSONL: (1) Edit/Write/MultiEdit `tool_use` blocks → `landmark` candidates (path-touch + suggested-role bullet); (2) `context7` MCP `tool_use` blocks → `library` candidates; (3) anchored line-start intent phrasings in user/assistant `text` blocks → `backlog` candidates with role-tagged provenance (`source: user-instruction` vs `source: assistant-deferral`) + verbatim + slug+4char-sha256 stable key + active-workflow context. Pure passive collector — only ever appends `## CANDIDATE:` blocks to `_pending.md`; never writes to canonical memory files. Best-effort: every extraction path is wrapped so a malformed transcript event cannot crash the hook.
- Companion: `.claude/hooks/lib/resume_writer.py:1` (the text-block-walk helper this hook's intent extraction mirrors), `.claude/memory/backlog.md:1` (the canonical destination after `/memory-flush` promotion), `.claude/skills/memory-flush/SKILL.md:1` (the curator that drains `_pending.md`).
- Verified-at: HEAD
- Last-touched: 2026-05-17
- Caveat: intent patterns are anchored line-start regexes (`^(?:\s*[-*]\s*)?<trigger>\b` for user-role; `^<trigger>\b` for assistant-role) tuned for precision over recall per CLAUDE.md X.1 — mid-sentence trigger occurrences MUST NOT emit candidates. Six triggers ship: `TODO[:\s]`, `next we (should|need to|must)`, `let's also`, `we should also`, `backlog this`, `after this (lands)?`. Adding a trigger means re-running the byte-parity fixture at `.claude/hooks/tests/fixtures/memory_stop_landmark_baseline.txt` AND extending the regression-trap tests in `.claude/hooks/tests/memory_stop_intent_test.sh`. Noise filters (`<system-reminder>`, `<command-name>`, `<local-command-`) come from the same lineage as `lib/resume_writer.py:110-114` — keep them in lockstep.

## .claude/hooks/tests/memory_stop_intent_test.sh:1

- Role: Fixture-based integration tests for `memory_stop.sh:1`'s intent-extraction surface. 10 scenarios across 6 ACs (AC-001 user TODO emit, AC-002 assistant Let's-also with `assistant-deferral` source, AC-003 mid-sentence + system-reminder suppression, AC-004 byte-parity landmark fixture, AC-010 slug+4hash collision resistance, AC-012 no-intent regression trap). Each test builds a tempdir project root, writes a synthetic JSONL transcript via `append_text_event` / `append_tool_use_event` helpers, invokes the real hook with `CLAUDE_PROJECT_DIR` redirected, and asserts on `_pending.md` body changes. Assertion helpers (`assert_file_contains` / `assert_file_not_contains`) use `grep -qF --` to defend against BSD grep treating leading-dash needles like `- Role: user` as a flag.
- Companion: `.claude/hooks/memory_stop.sh:1` (the hook under test), `.claude/hooks/tests/fixtures/memory_stop_landmark_baseline.txt` (the captured pre-extension reference output for AC-004 byte-parity; canonicalized via timestamp-line stripping).
- Verified-at: HEAD
- Last-touched: 2026-05-17
- Caveat: the AC-004 byte-parity baseline was captured BEFORE the intent-extraction extension landed in `memory_stop.sh` — it's the contract that the no-intent path stays stable. Re-capturing the fixture is required any time `memory_stop.sh`'s landmark/library extraction paths change shape (path-touch threshold, file-prefix filters, ISO-timestamp format). The four mid-sentence / system-reminder / zero-content / no-intent tests are REGRESSION_TRAP_PRE_PASSING per `conventions.md → test-regression-trap-semantics` — they pass both before and after the extension and must continue to pass.

## .claude/skills/audit-baseline/tests/preamble_check_test.sh:1

- Role: Fixture-based integration tests for `audit.sh:1`'s strict-preamble validator (the `is_valid_preamble(text)` helper introduced 2026-05-17). 5 scenarios across the memory-shape audit branch: opener-only FAILs, no-opener FAILs (regression trap), valid-empty-body PASSes "empty (preamble-only)", valid-with-entries PASSes "N entries", `_pending` opener-only FAILs (strict rule applies to the special-case file). Test pattern: build a stub `.claude/memory/` tempdir with all 9 expected memory filenames (7 canonical + `_pending` + `_resume`), substitute one file with a fixture from `tests/fixtures/`, invoke audit.sh via `CLAUDE_PROJECT_DIR=$TMP`, grep only for the specific `memory shape: <name>.md` line in the captured output. Audit exit code is ignored (the stub tree fails hook/skill/agent counts; we only care about the memory-shape branch).
- Companion: `.claude/skills/audit-baseline/audit.sh:1` (the helper under test), `.claude/skills/audit-baseline/tests/fixtures/` (5 synthetic preamble fixtures: opener_only, no_opener, full_empty_body, full_with_entries, _pending_opener_only). Pattern source: `.claude/hooks/tests/memory_session_start_test.sh:1` (tempdir + CLAUDE_PROJECT_DIR style anchor).
- Verified-at: HEAD
- Last-touched: 2026-05-17
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline/audit.sh`); run manually during /tdd, /simplify, /integrate alongside the two `.claude/hooks/tests/memory_*.sh` test files. Bash dynamic-scoping gotcha during authoring: helper functions that loop over a list (e.g. `for name in ...`) MUST declare the loop variable local OR rename it (`mem_name`) so the parent `run()`'s `local name="$1"` isn't clobbered — captured in `.claude/skill-memory/scenario/MEMORY.md` post-fix.

## .claude/skills/tdd/drift_check.py:1

- Role: spec-to-implementation drift analysis helper. Invoked by the harness as a drift-check-tick inside /tdd's seeded worker chain (between the last design-ui-tick / verify-tick and tdd-finalize). CLI: `--slug <slug>` (required), `--project-root <path>` (default `.`), `--diff <path>` (override of `git diff <merge-base>..HEAD`). Parses numbered AC IDs from the spec's ## Acceptance criteria table (regex on `| AC-NNN |` rows) and row-slugs from the ## Design calls table; scores each as `resolved` (item ID literal in any diff added-line) or `unresolved` (no diff added-line references it). Writes `<project-root>/.claude/state/drift/<slug>.md` with a `| kind | id | verdict | evidence |` markdown table per item. Exit 0 on zero-unresolved, exit 1 on `≥ 1 unresolved`, exit 2 on tool error. Special case: spec absent → "no spec; skipped" on stdout, exit 0, no report file (chore-track support per AC-011 of the wf-loop-closing-hygiene spec).
- Verified-at: 5a79b1c
- Last-touched: 2026-05-17
- Caveat: the workflow that first shipped drift_check.py (workflow-loop-closing-hygiene) did NOT exercise the harness's drift-check-tick path at runtime — the harness instance in flight predated the tdd/SKILL.md update and could not inline the helper. Unit-tested via `.claude/skills/tdd/tests/drift_check_test.sh` (4 scenarios covering all-resolved / one-unresolved / no-spec / *(none)*-design-calls). Live runtime exercise begins in the next spec-track workflow after the shipping commit. Path-traversal LOW finding on the `--slug` argument is non-blocking (operator trust model) — see `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md` Finding #1.

## .claude/hooks/tests/fixtures/regenerate-ac008.sh:1

- Role: regenerator for the AC-008 byte-equality fixture (`.claude/hooks/tests/fixtures/ac008_byte_equal_reference.txt`). Runs `memory_session_start.sh` against the live `.claude/memory/` tree, extracts the "## Project memory" header through the "| `pending-questions.md`" row, normalizes captured HEAD short SHA to the literal sentinel `n/a`, overwrites the fixture. Idempotent: same tree state → identical bytes. Re-run whenever the canonical memory tree drifts in per-file entry counts. The matching test in `memory_session_start_test.sh` AC-008 case applies the same HEAD normalization to the live capture before byte-comparing — the helper and the test share the extraction shape.
- Verified-at: 5a79b1c
- Last-touched: 2026-05-17
- Caveat: HEAD-sentinel normalization is option (i) from the wf-loop-closing-hygiene research memo — keeps the fixture byte-stable across commits. The extraction cutoff (`| \`pending-questions.md\``) is a hidden coupling between the helper and the test; if memory_session_start.sh ever reorders or renames pending-questions.md, both files need updating in lockstep.

## .claude/memory/backlog.md:1

- Role: The seventh canonical memory file. Captures future-work intent extracted automatically from user prompts (`source: user-instruction`) and assistant text (`source: assistant-deferral`) by `memory_stop.sh:1`'s anchored line-start intent regex. Stable-key shape: `<8-word-kebab-slug>-<4-char-sha256-suffix>`. Body schema: required verbatim blockquote, `source`, `status: open|picked-up|dropped`, `raised-on`, `raised-in-context`, optional `estimated-effort`, optional `depends-on: [[other-backlog-key]]` links. Closure via `superseded-at:` (same register as the other five non-pending canonical files); body `status:` field disambiguates `picked-up` (taken into a workflow) vs `dropped` (decided not to do). Auto-deletes on the next `/memory-flush` Step 0a sweep once a valid `superseded-at:` lands.
- Companion: `.claude/hooks/memory_stop.sh:1` (the producer), `.claude/skills/memory-flush/SKILL.md:1` (the curator), `.claude/skills/memory-flush/sweep.py:1` (the closure actuator; `STALE_EXEMPT_FILES = {'backlog'}` makes backlog entries decay-exempt), `.claude/hooks/memory_session_start.sh:1` (the SessionStart index emitter; same stale-exempt carve-out so backlog never shows up in stale counts).
- Verified-at: HEAD
- Last-touched: 2026-05-17
- Caveat: backlog is **stale-exempt** — `verified-at:` distance is meaningless for intent (it's not a verifiable fact about code state). The 30-commit / 30-day decay predicates in `memory_session_start.sh:_is_stale` and `sweep.py:is_stale` both early-return False for `name == 'backlog'`. Pruning still happens via `last-touched` ordering when the 500-entry size-cap is hit. The bootstrap entry that shipped with this file (`## bootstrap`, `superseded-at: 2026-05-17`) auto-deleted on the first Phase 10.6 invocation post-install — confirmed end-to-end in the backlog-memory-bucket workflow (archive: `docs/archive/2026-05-17/backlog-memory-bucket/`).

## .claude/skills/tdd/SKILL.md:1

- Role: Phase 6 TDD coordinator. Thin orchestrator — decides scenario recipe + implementation contract in main context, writes state at `.claude/state/tdd/<slug>.json`, seeds per-worker tasks (scenario, implement, verify-tick, design-ui-tick, drift-check-tick, tdd-finalize) into the TaskList, yields with `harness_state.continue` so the harness invokes each worker as its own tick. No subagent delegation; no nested Skill calls. The harness inlines verify-tick mechanically rather than invoking the (contract-only) verify skill.
- Companion: `.claude/skills/scenario/SKILL.md` (worker that writes failing tests), `.claude/skills/implement/SKILL.md` (worker that makes them pass), `.claude/skills/design-ui/SKILL.md:1` (UI surface worker per `## Design calls` row), `.claude/skills/tdd/drift_check.py:1` (drift-check-tick actuator).
- Verified-at: bfad579
- Last-touched: 2026-05-17
- Caveat: prereq is approved-spec OR `entry_phase == tdd` (quickfix/bugfix). The seeded worker chain is one Skill call per tick — the coordinator does NOT loop internally over workers (that would violate Article II's "decisions in main context, workers execute pre-decided recipes" rule). drift-check-tick fires before tdd-finalize so the spec-to-implementation cross-check happens while the harness is still in the TDD phase rather than as a sibling phase.

## .claude/skills/tdd/tests/drift_check_test.sh:1

- Role: Fixture-based integration tests for `.claude/skills/tdd/drift_check.py:1`. 4 scenarios covering AC-002 (all-resolved → exit 0, table marks every AC `resolved`), AC-003 (one-unresolved → exit 1, evidence column names the missing AC ID), AC-011 (no-spec → exit 0, stdout `no spec; skipped`, no report file), and the `*(none)`-Design-calls case (spec present but Design calls table absent → exit 0 over ACs only). Builds tempdir project roots with synthetic spec files + `--diff` override fixtures, invokes the helper, asserts on the markdown report at `<project-root>/.claude/state/drift/<slug>.md` and the exit code.
- Companion: `.claude/skills/tdd/drift_check.py:1` (the helper under test), `.claude/skills/tdd/tests/run.sh:1` (the aggregate runner that picks this up).
- Verified-at: bfad579
- Last-touched: 2026-05-17
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline`); run manually during /tdd, /simplify, /integrate. The test scenarios encode the contract documented in `docs/specs/workflow-loop-closing-hygiene.md` ACs — adding behaviors to `drift_check.py` requires extending this suite in lockstep, or the next drift-check-tick will go unverified.

## .claude/skills/tdd/tests/run.sh:1

- Role: Aggregate test runner for `.claude/skills/tdd/`. Iterates over sibling `*_test.sh` files (currently just `drift_check_test.sh`), invokes each via bash, exits 1 if any fail. Mirrors `.claude/skills/memory-flush/tests/run.sh:1` and `.claude/hooks/tests/run.sh` shape.
- Verified-at: bfad579
- Last-touched: 2026-05-17
- Caveat: not invoked by `project.json → test.cmd` — surfaced manually in /integrate's optional test surface. New `*_test.sh` files in the same directory are picked up automatically by the glob; no runner edit needed.

## .claude/hooks/tests/regenerate_ac008_test.sh:1

- Role: Integration test for `.claude/hooks/tests/fixtures/regenerate-ac008.sh:1`. Covers AC-001 from `workflow-loop-closing-hygiene`: runs the regenerator, then invokes the AC-008 byte-equality case inside `memory_session_start_test.sh` and asserts both PASS. Validates the regen → test loop end-to-end so future fixture drift is fixable by one bash invocation.
- Companion: `.claude/hooks/tests/fixtures/regenerate-ac008.sh:1` (the helper under test), `.claude/hooks/tests/memory_session_start_test.sh:1` (the downstream test that consumes the regenerated fixture).
- Verified-at: bfad579
- Last-touched: 2026-05-17
- Caveat: depends on the live `.claude/memory/` tree matching the fixture shape at regen time. Re-run after any canonical-file entry count change. Bash dynamic-scoping gotcha applies — declare loop variables `local` or rename them (see `preamble_check_test.sh` caveat) so the parent `run()`'s `local name="$1"` is not clobbered by `for name in …`.

## .claude/skills/changelog/SKILL.md:1

- Role: Workflow Phase 11.5 owner. Pre-commit changelog curation per [keepachangelog 1.0.0](https://keepachangelog.com/en/1.0.0/). Reads the staged git history + commit_consent freshness; classifies commits into Added/Changed/Deprecated/Removed/Fixed/Security; appends entries under `## [Unreleased]` in `CHANGELOG.md`; writes ChangelogState to `.claude/state/changelog/<slug>.json`. Authorized by the same `commit_consent` token as `/commit` — no new gate. Also supports `--preview-only` for ad-hoc projected-version preview outside a workflow.
- Companion: `.claude/skills/changelog/changelog.mjs:1` (the CLI actuator the SOP invokes), `.claude/skills/commit/SKILL.md:1` (Phase 11 sibling whose prereq line now requires `changelog` alongside `archive` and `memory-flush`), `.claude/skills/harness/SKILL.md:1` (ordering text updated to insert changelog between /grant-commit and /commit), `.claude/skills/triage/SKILL.md:1` (four task-seeding templates updated + non-git auto-except list grew).
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: TTL-sensitive — the skill must complete inside the 300 s `consent.commit_ttl_seconds` window so downstream `/commit` finds a valid token. Typical runtime under 5 s (calls semantic-release JS API in dryRun mode + parses git log). The release-time `@semantic-release/changelog` plugin (`.releaserc.json:20`) does NOT preserve `## [Unreleased]` heading position when prepending a release block — the actuator's `unreleased-writer.mjs` exports `reinsertUnreleasedHeading` as a release-time fallback that lifts the heading back to canonical top position. Bootstrap: this workflow's own commit ran the OLD chain (skill didn't exist on disk yet); future workflows use the new ordering.

## .claude/skills/changelog/changelog.mjs:1

- Role: Phase 11.5 CLI actuator (Node ESM). Two modes: (1) active mode — verifies commit_consent freshness via mtime comparison against `consent.commit_ttl_seconds` (default 300s); reads commits since last tag; classifies via classifier.mjs; writes entries under `## [Unreleased]` in CHANGELOG.md; writes ChangelogState. (2) `--preview-only` mode — calls semantic-release JS API dryRun; prints projected version + draft fragment to stdout; no writes, no consent required. CLI: `--slug <slug>` (required), `--preview-only`, `--project-root <path>`. Exit codes: 0 success; 1 consent expired / file error / runtime error; 2 bad arguments.
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: The TTL check reads filesystem mtime, NOT the epoch written inside the consent file. Reason: `/grant-commit` writes the epoch as content for human readability, but the structural freshness signal is mtime (which matches when the file was written). If `touch -d` is used to backdate the file (as in `consent-expired_test.sh`), the mtime is what matters.

## .claude/skills/changelog/classifier.mjs:1

- Role: Conventional-commit type → keepachangelog 1.0.0 section mapping. Default mapping: feat→Added, fix→Fixed, perf/refactor→Changed, revert→Removed, docs/style/test/build/ci/chore→null (no entry). Breaking commits (subject suffix `!:` or body `BREAKING CHANGE:`) force section to Changed regardless of base type AND set `breaking: true` on the entry (rendered with `**BREAKING:**` prefix in CHANGELOG.md). Exports `classify(commit)` returning `{section, breaking}` or `null`. Also exports `KEEPACHANGELOG_SECTIONS` (canonical-order frozen array of the six section names).
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: Skipping `docs/style/test/build/ci/chore` matches the `.releaserc.json` releaseRules' "no release" carve-outs at the type level (the scope carve-outs `release/site/ci/actions` are NOT mirrored here because at this level we only see commit type, not scope-filtered release decisions). The hybrid auto-derive default (per spec OQ-2 decision) is the auto-derivation half; the user-confirmation half is implemented in changelog.mjs (currently auto-applies with no prompt; spec's hybrid model is intended for future interactive workflow integration).

## .claude/skills/changelog/version-preview.mjs:1

- Role: Projected-version preview via semantic-release JS API. Exports `previewProjectedVersion(cwd)` returning `{version, type, commits}`. Strategy: (1) shell `git describe --tags --abbrev=0` for the last tag; (2) shell `git log <lastTag>..HEAD --format=%H%x09%s%x09%b%x00` for commits, parse subjects via conventional-commit regex; (3) call `semantic-release` JS API with `{dryRun: true, ci: false, branches: ['main','master']}` for the projection; (4) fallback to a local releaseRules-mimicking computation if semantic-release rejects the run (no .releaserc.json, no remote, etc.).
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: The local fallback applies a simplified version-bump rule (breaking→minor under the project's alpha cap; feat→minor; fix/perf/refactor→patch). This intentionally does NOT mirror the full `.releaserc.json` releaseRules — the fallback exists for tempdir test environments where semantic-release can't analyze. In production, the semantic-release JS API result is authoritative.

## .claude/skills/changelog/state-writer.mjs:1

- Role: Idempotent writer for `.claude/state/changelog/<slug>.json`. Exports `writeState(projectRoot, slug, state)`. Creates the directory if absent; writes pretty-JSON with trailing newline. Re-invocation on the same slug overwrites the file; `idempotent-reentry_test.sh` confirms content excluding `generated_at` and `unreleased_inserted_at` is byte-equal across re-invocations.
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: The state file shape is the `ChangelogState` class from the spec — `slug`, `source_commit_sha`, `projected_version`, `projected_type`, `entries[]`, `generated_at`, `unreleased_inserted_at`. Pretty-JSON (`null, 2`) is deliberate — the file is human-readable; the archive bundle includes it; a tempting "optimize storage" pass should resist minifying.

## .claude/skills/changelog/unreleased-writer.mjs:1

- Role: CHANGELOG.md curation under `## [Unreleased]`. Two exports: (1) `appendUnderUnreleased(changelogPath, entries)` performs an RMW — reads CHANGELOG.md, ensures `# Changelog` + `## [Unreleased]` headings exist (inserts if absent), groups entries by keepachangelog section in canonical order (Added/Changed/Deprecated/Removed/Fixed/Security), writes the section bodies between the Unreleased heading and the next `##` heading. (2) `reinsertUnreleasedHeading(changelogPath)` is the AC-013 fallback — after `@semantic-release/changelog` prepends release notes ABOVE the file's existing headings (empirically confirmed during scenario tick), this lifts `## [Unreleased]` back to the canonical top position.
- Verified-at: bfad579
- Last-touched: 2026-05-18
- Caveat: The release-time integration path (releaserc post-prepare hook calling `reinsertUnreleasedHeading`) is OUT OF SCOPE of this skill's introduction workflow — it's left to a follow-up chore once the AC-013 fallback test confirms the export shape. For now the export exists; wiring it into the release pipeline is the next ticket.

## .claude/skills/changelog/tests/run.sh:1

- Role: Aggregate test runner for `.claude/skills/changelog/`. Loops sibling `*_test.sh` files (bash) AND `*_test.mjs` files (`node --test`); exits non-zero if any suite fails. Mirrors the runner-shape precedent at `.claude/skills/memory-flush/tests/run.sh:1` and `.claude/skills/tdd/tests/run.sh:1`.
- Verified-at: 25d9eb4
- Last-touched: 2026-05-18
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline`). Run manually during `/tdd`, `/simplify`, `/integrate` to exercise the changelog skill's contract. New `*_test.sh` or `*_test.mjs` siblings are picked up automatically; no runner edit needed.

## .claude/skills/changelog/tests/keepachangelog-unreleased-preserved_test.mjs:1

- Role: Node ESM integration test for `@semantic-release/changelog@6.0.3` plugin behavior. Two `test()` blocks: (1) AC-013 empirical contract — documents that the plugin prepends `nextRelease.notes` ABOVE the file's existing `# Changelog` and `## [Unreleased]` headings (does NOT preserve top-of-file position); asserts the heading survives in the body but appears AFTER the new versioned block. (2) AC-013 fallback — exercises `reinsertUnreleasedHeading` from `unreleased-writer.mjs:1` and asserts the canonical top position is restored.
- Companion: `.claude/skills/changelog/unreleased-writer.mjs:1` (the fallback under test), `libraries.md → @semantic-release/changelog@6.0.3` (where the empirical behavior is documented).
- Verified-at: 25d9eb4
- Last-touched: 2026-05-18
- Caveat: test (1) is a regression-trap that documents undocumented plugin behavior. If a future plugin version DOES preserve top-of-file position, test (1) will fail unexpectedly — that's the contract: the test name reads "leaves Unreleased in file but displaces it", so a failure means the plugin behavior CHANGED, not that the code broke. The fallback's wiring into `.releaserc.json` as a post-prepare step is out of scope of the workflow that introduced this test; deferred to a follow-up chore.

## src/cli/tui/install.js:1

- Role: Domain — branded install flow. Exports `run({target, opts, prompts})`; composes `freshInstall` / `forceInstall` from `src/cli/install.js` and `fetchPlantumlIfMissing` from `src/cli/plantuml.js` behind a clack-style intro / spinner / outro presentation seam. Writes `renderBrandStrip({version, subtitle: 'install'})` from `src/cli/tui/splash.js:1` to stdout ABOVE the clack intro so the BASELINE wordmark identity carries onto the install surface. The `prompts` parameter defaults to `@clack/prompts` and is injected in tests.
- Companion: `src/cli/tui/splash.js:1` (brand strip renderer), `src/cli/tui/tokens.js:1` (brand colors), `tests/tui-install.test.mjs` (unit tests with `prompts` stub), `bin/cli.js → dispatchInstall` (router that picks tui vs plain).
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: never invoked from the non-TTY path. The router's `process.stdout.isTTY` check decides; if you add a new install entry point, route the same way or clack output will land in CI logs. The brand strip write happens BEFORE `prompts.intro(...)` so the strip sits above clack's framing characters; reordering hides the wordmark beneath the clack box.

## src/cli/tui/upgrade.js:1

- Role: Domain — interactive upgrade flow that replaces the retired `--merge`. Plan/apply split: (1) dry-run `threeWayMerge` to enumerate `SKIP_CUSTOMIZED` conflicts, (2) `prompts.select` per conflict (keep-mine / take-theirs / abort), (3) on cancel/abort bail before any write, (4) real `threeWayMerge` with `onSkipCustomized` callback backed by the user's choices Map. Writes `renderBrandStrip({version, subtitle: 'upgrade'})` from `src/cli/tui/splash.js:1` above the clack intro. `listShippedFiles` filters `COPY_EXCLUDE` (imported from `src/cli/install.js`) so `manifest.json` is never sent into `threeWayMerge` as an ADD candidate — single source of truth shared with fresh-install. Cancel sentinel: `Symbol.for('clack:cancel')`.
- Companion: `src/cli/install.js` (`COPY_EXCLUDE` source-of-truth), `src/cli/tui/splash.js:1` (brand strip), `src/cli/merge.js → threeWayMerge` (data layer with `{dryRun, onSkipCustomized}` opts), `bin/cli.js → dispatchUpgrade` (router), `tests/upgrade.test.mjs`.
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: `bin/cli.js`'s non-TTY upgrade path is a separate code branch (`runPlainUpgrade`) that calls `threeWayMerge` directly without the onSkipCustomized callback. Both branches use the COPY_EXCLUDE-filtered `listShippedFiles`. If you change the apply logic or the exclude set in one branch, mirror the change in the other or the two paths diverge.

## src/cli/tui/doctor.js:1

- Role: Domain — branded sectioned doctor renderer. Exports `render(report)`; consumes the structured `DoctorReport` from `src/cli/doctor.js` (unchanged) and writes a colorized, sectioned rendering to stdout. The non-TTY plain path stays on `doctor.js`'s `formatReport`; the renderer is invoked only when `process.stdout.isTTY && !values.json`.
- Error path: when `report.error` is set (e.g., manifest-missing), renders the same `Baseline doctor` brand frame (accent header, muted target line) followed by the error message with a red `doctor:` marker. The router no longer short-circuits errors to `formatReport` in TTY mode.
- Companion: `bin/cli.js → dispatchDoctor` routes between `tui/doctor.render(report)`, `JSON.stringify(report)` (when `--json`), and `formatReport(report)` (non-TTY default). `brandHeader(target, manifestInfo)` is a private helper inside the module — extract pattern for any future renderer that needs the same banner.
- Verified-at: 2c1527a
- Last-touched: 2026-05-18
- Caveat: do not couple the renderer to the doctor data layer; the two-way separation (data in `src/cli/doctor.js`, presentation in `src/cli/tui/doctor.js`) is what makes `--json` a trivial rider. The error-path brand frame is intentional: even unhappy outcomes carry the brand surface.

## src/cli/tui/meta.js:1

- Role: Domain — branded renderers for the meta commands (`--help`, `--version`) AND for usage-class errors. Three exports: `renderHelp(helpText, _version)`, `renderVersion(version)`, `renderUsageError(msg, helpText, version)`. `renderHelp` in TTY prepends the full splash marquee from `src/cli/tui/splash.js:1` (wordmark + tagline + commands + try line + discover URL) before the canonical HELP_TEXT body; non-TTY emits HELP_TEXT byte-clean. `renderVersion` in TTY prints the wordmark + version marquee; non-TTY emits the bare version string. `renderUsageError` writes to stderr (banner + `Error: <msg>` + HELP_TEXT) so every parseArgs/usage-class exit ships brand-framed guidance.
- Companion: `src/cli/tui/splash.js:1` (wordmark + brand strip + marquee renderers), `src/cli/tui/tokens.js:1` (colors), `bin/cli.js` (every non-success return path routes through `usageError(msg)` which delegates here).
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: the non-TTY branch emits a BARE version (no `baseline v` prefix) on purpose — script consumers running `$(create-baseline --version)` expect a parseable version string. `renderHelp` deliberately ignores its `version` parameter (renamed `_version`) because the splash no longer renders a version line; version lives on `--version` only. Restoring version to the splash would force the docs-site cli-splash.png to re-render every release.

## src/cli/tui/tokens.js:1

- Role: Foundation — ANSI brand-color helpers translating Friedbot Studio's oklch tokens (from `site-src/assets/site.css :root`) to 24-bit truecolor escape sequences. Exports named helpers (`accentShadow`, `accent`, `accentLight`, `muted`, `success`, `warn`, `error`, `rule`), plus the raw `paintRGB(rgb, text)` function and a frozen `PALETTE` map used by `src/cli/tui/splash.js:1` to paint the wordmark row-by-row (bevel banding: shadow / mid / highlight / mid / shadow). Respects `NO_COLOR` env var and `process.stdout.isTTY`; falls back to plain when either disables color.
- Companion: `src/cli/tui/splash.js:1` (consumes `paintRGB` + `PALETTE.accentShadow/accent/accentLight`), `src/cli/tui/{install,upgrade,doctor,meta}.js` (consume named helpers), `site-src/assets/site.css` (the canonical brand palette these tokens approximate).
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: the RGB triples are oklch-to-sRGB *approximations*; exact perceptual match is impossible across terminal palettes. The new `accentShadow` triple (122,41,7 ≈ #7a2907) approximates `oklch(35% 0.15 41.5)` — keep it in sync with both the docs-site value and the wordmark's outer bevel bands. If you add another paint helper, also add the matching `PALETTE.<name>` key so splash.js can reach it without importing every helper individually.

## src/cli/merge.js:1

- Role: Domain — three-way merge engine used by the `upgrade` subcommand. Exports `threeWayMerge(templateDir, target, oldManifest, newManifest, opts)` and the `ACTION_KINDS` enum (ADD / OVERWRITE / NOOP / SKIP_CUSTOMIZED / PRUNE / PRUNE_SKIPPED_CUSTOMIZED / NEVER_TOUCH_PRESERVE / NEVER_TOUCH_ADD / SPECIAL_MERGE). Supports `{dryRun, onSkipCustomized}` opts: dry-run returns a planned-actions list without writing; `onSkipCustomized` is the per-conflict callback the TUI uses to ask the user keep-mine / take-theirs / abort.
- Companion: `src/cli/install.js` defines `NEVER_TOUCH` + `SPECIAL_MERGE` path sets that this module imports; `src/cli/manifest.js` supplies `hashFile` + `saveManifest`; `src/cli/mcp.js` supplies `deepMergeMcpServers` for the .mcp.json special-merge case; `src/cli/tui/upgrade.js` is the interactive consumer; `bin/cli.js → dispatchUpgrade` is the non-TTY consumer (`runPlainUpgrade`).
- Verified-at: 2c1527a
- Last-touched: 2026-05-18

## site-src/_includes/install-pill.njk:1

- Role: Domain — compact click-to-copy install-command pill, quieter cousin of `.cli-strip`. Single `<button data-copy="…">` with monospaced command, prompt glyph, and copy/check icon pair. Reuses the existing `[data-copy]` handler at `site-src/assets/site.js:244` (Clipboard API + execCommand fallback; flips `.is-copied` for ~1.8s). Feedback IS the icon swap (copy → check) — no hint-text element by design.
- Companion: `site-src/assets/site.css` `.install-pill` block defines the dark terminal aesthetic at compact scale; `site-src/_data/site.cjs` is unrelated but the sister `site.byline` field shipped in the same workflow. Consumers: `site-src/index.njk` (hero, wrapped in `.hero-install`) and `site-src/install.njk` (page top, wrapped in `.page-install`).
- Verified-at: 2c1527a
- Last-touched: 2026-05-18
- Caveat: the existing loud `.cli-strip` above the footer of `index.njk` stays unchanged — pill and strip serve different placements (header-adjacent vs. final CTA). Do not collapse them into a shared base class; the duplication is intentional system-kinship at different scales.

## src/cli/upgrade-tiers.js:1

- Role: Domain — three-tier upgrade dispatch + BASE-content recovery + semantic-merge staging. Exports `dispatchByTier(rel, tier, ctx)` (routes BINARY_PROMPT → SKIP_CUSTOMIZED for caller to prompt, MECHANICAL → `git merge-file --diff3` via spawnSync, SEMANTIC → stage BASE+INCOMING+manifest under `.claude/state/upgrade/<ts>/`), `resolveBase(rel, baseline_version, target, {oldManifest, pack})` (hybrid resolver: cache-first read from `.claude/.baseline-prior/<rel>` → sha256-verify against oldManifest → fall back to npm `libnpmpack.pack('@friedbotstudio/create-baseline@<v>')` → sha256-verify → write-through cache), `writeStage(ctx, rel, baseBuf, incomingBuf, localBuf)` (per-run shared `ctx.stageRunTs` initialized lazily; appends entries to stage manifest with status PENDING), `findPendingStage(target)` (idempotency precondition — returns first stage_ts with PENDING entries OR null when all RECONCILED). `NoBaseError extends Error` with `kind` enum (`cache_sha_mismatch` / `legacy_manifest` / `npm_fetch_failed` / `npm_sha_mismatch` / `npm_missing_file` / `tarball_path_traversal`).
- Companion: `src/cli/merge.js → dispatchCustomized` is the only caller — it routes the customized-file branch (target hash ≠ old hash) through dispatchByTier when the manifest entry carries `{sha256, tier}`. On `NoBaseError`, dispatchCustomized falls back to `fallbackToBinaryPrompt` which surfaces SKIP_CUSTOMIZED for user choice (never uses LOCAL as BASE — security AC-008 hard rule). `src/cli/tui/upgrade.js → findPendingStage` checked at start of run() short-circuits with exit 5 when a stage is pending (idempotency AC-007). `src/cli/install.js → writeBaselinePriorMirror` seeds `.claude/.baseline-prior/` at fresh install (mirror + `*\n` gitignore).
- Verified-at: e2927c7
- Last-touched: 2026-05-20
- Caveat: production tarball extraction uses `spawnSync('tar', ['-xz', '-C', tmp, '-f', '-'])` with defense-in-depth path-traversal check (resolved candidate must startsWith tmpRoot+sep) — both BSD tar (macOS default) and GNU tar reject absolute paths and `..` by default, but the explicit check guards against future tar-binary changes (security report 2026-05-20). The `pack` option in `resolveBase` is a DI seam: tests pass a `Map<rel, Buffer>` stub; production calls `libnpmpack.default` lazily so tests don't force the import. `ctx.stageRunTs` is initialized inside `writeStage` on first SEMANTIC dispatch and shared across the same merge run so all SEMANTIC files land in one stage_ts dir — never mutate it externally.

## src/cli/diff-render.js:1

- Role: Foundation — pure-function unified-diff renderer used by the upgrade TUI's "Show diff" prompt. Single export `renderUnifiedDiff(localText, incomingText, {colorize})` that splits both inputs by `\n`, builds an LCS-based diff, and emits lines prefixed by ` ` (context), `-` (removed from local), `+` (added in incoming). Colorize-true wraps removes in ANSI red (`\x1b[31m`) and adds in ANSI green (`\x1b[32m`) with `\x1b[0m` resets. No IO, no filesystem, no clack dependency — composable from any caller.
- Companion: `src/cli/tui/upgrade.js → renderConflictDiff` calls this with `{colorize: process.stdout.isTTY === true}` and emits the result via `prompts.log.info`. Tests at `tests/diff-render.test.mjs` cover three branches: marker prefixes, ANSI presence under colorize, ANSI absence without.
- Verified-at: e2927c7
- Last-touched: 2026-05-20
- Caveat: the LCS algorithm is O(m*n) memory; fine for upgrade-flow files (hooks, skills, configs — all under a few KB) but would be inappropriate for large file pairs. If a future caller needs to diff large texts, switch to Myers diff or stream-based approach. The renderer treats inputs as byte-equal text — no whitespace normalization or smart-quote handling.

## .claude/skills/upgrade-project/SKILL.md:1

- Role: Maintenance skill (NOT a workflow phase) — invoked reactively when `create-baseline upgrade` exits 5 with a "Pending semantic-merge stage" pointer. Reads `.claude/state/upgrade/<ts>/manifest.json` (shape: `stage_version: 1`, `slug`, `created_at`, `baseline_version_from`, `baseline_version_to`, `files[]` with per-entry `{rel, base_sha256, incoming_sha256, local_sha256, status: PENDING|RECONCILED|NEEDS_USER_INPUT}`). Per file: reads BASE + INCOMING + LOCAL, reasons in main context, writes reconciled bytes to LOCAL, updates stage entry status. On all-RECONCILED, deletes stage dir. Supports `args=dry-run` (emits unified diff, no writes, no stage delete). Fallback: when LLM cannot disambiguate, sets status: NEEDS_USER_INPUT, leaves staging intact, surfaces targeted question, exits clean.
- Companion: stage is written by `src/cli/upgrade-tiers.js → writeStage`. Stage manifest read by `findPendingStage` (idempotency check) and by this skill. The CLI's terminal pointer is emitted by `src/cli/tui/upgrade.js → run` (TTY path) and `bin/cli.js → dispatchUpgrade` (non-TTY path) when findPendingStage returns non-null. Article XI / shipped manifest `owners.skills.upgrade-project` registers this skill as baseline-owned (audit-baseline enforces).
- Verified-at: e2927c7
- Last-touched: 2026-05-20
- Caveat: skill body declares the **zero-drift renumbering rule** (binding per AC-006): when both BASE→INCOMING and BASE→LOCAL add structural entries at the same anchor (e.g. both add a new Article XI), shift user content to the NEXT AVAILABLE slot (XII), never fold. Recursive: if a later baseline adds XII, shift user to XIII. The payoff: a subsequent upgrade against the reconciled file produces zero new staging entries. Also: skill body declares the **path-validation constraint** — before writing reconciled bytes, verify `path.resolve(target, rel)` is a descendant of target; escapes route to NEEDS_USER_INPUT with reason `path-traversal-rejected` (security defense-in-depth against tampered stage manifests).

## src/cli/tui/splash.js:1

- Role: Domain — branded splash surfaces. Holds the BASELINE wordmark (ANSI-Shadow style, 5 letter rows + 1 outline trace row in `▔`) and exports four renderers: `renderWordmark()` (paints each row with `SHADES[i]` from `PALETTE` in bevel order shadow/mid/highlight/mid/shadow + outline in accentShadow), `renderSplash({tagline, tryLine, discoverUrl})` (full marquee for `--help` and no-arg TTY landing — intentionally version-LESS so the docs-site PNG doesn't go stale every release), `renderBrandStrip({version, subtitle})` (slim two-row strip used by install / upgrade intros), and `renderVersionMarquee(version)` (wordmark + version line for `--version`). Also exports `wordmarkFits(columns)` which treats falsy columns (0 under `script(1)` pty) as wide-enough so the marquee still renders.
- Companion: `src/cli/tui/tokens.js:1` (`paintRGB` + `PALETTE` source), `src/cli/tui/meta.js:1` (consumer for `--help` and `--version`), `src/cli/tui/install.js:1` and `src/cli/tui/upgrade.js:1` (consumers for the brand strip), `bin/cli.js` no-arg landing (TTY branch consumes `renderSplash`), `tests/splash.test.mjs` (structural assertions on rows, banding, outline trace, command table, brand strip composition), `site-src/assets/cli-splash.png` (frozen PNG rendered with freeze on `#080b12` background to match the site's `--code-bg`).
- Verified-at: 0d4f8c8
- Last-touched: 2026-05-20
- Caveat: the wordmark width is 60 cols. Narrow terminals (< 60 cols) fall through to the plain HELP_TEXT body via `wordmarkFits()`. If you change the WORDMARK array, update WORDMARK_WIDTH (auto-derived) and re-render `site-src/assets/cli-splash.png` with `freeze --background "#080b12"` so the docs preview stays in sync. The version is intentionally absent from `renderSplash` — restoring it would regress the docs-PNG-staleness fix; version belongs to `renderVersionMarquee` and `renderBrandStrip` only.

## src/cli/workflows-validator.js:1

- Role: Orchestration — top-level workflows.jsonl validator. Loads `.claude/workflows.jsonl`, parses each line, runs Article IV invariants I1..I11 via `workflows-validator-invariants.js`. Returns `{ ok, tracks | errors }`. Consumed by `triage/seed-tasklist.mjs` (validate + materialize modes), `audit-baseline/audit.sh` (post-§18 hook), `commands/init-project-doctor.md`.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/workflows-validator-predicates.js:1`, `.claude/schemas/workflow-track.v1.json`.
- Verified-at: b327071
- Last-touched: 2026-05-21

## src/cli/workflows-validator-invariants.js:1

- Role: Domain — Article IV invariants I1..I11. Each `check*` returns `[{invariant, track_id, node_id, message}, ...]`; empty = holds. I1 unique track_ids; I2 selectable→entry node; I3 skill XOR sub_track (selector exempt with non-empty alternates); I4 depends_on/blocks resolve; I5 DAG; I6 commit tracks include `/grant-commit` before commit; I7 needs_user→consent command; I8 every skill/sub_track/command resolves on disk; I9 can_parallel siblings share blockedBy; I10 selector alternates share downstream contract; I11 predicates use v1 vocabulary.
- Companion: `src/cli/workflows-validator.js:1`, `src/cli/workflows-validator-predicates.js:1`.
- Verified-at: b327071
- Last-touched: 2026-05-21

## src/cli/workflows-validator-predicates.js:1

- Role: Foundation — closed v1 predicate vocabulary for Track/selector preconditions. Five predicates: `requires_git` (work-tree), `requires_user_override` (force-flag), `requires_min_components` (spec count ≥ N), `requires_phase_completed`, `requires_skill_present`. Each `evaluate<Name>(arg, ctx)` returns boolean; caller passes `ctx = {workflow, project, slug}`. Adding a predicate: implement here, add to `KNOWN_PREDICATES`, update I11, note in seed.md §18.4.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/track-tasklist-materializer.js:1`.
- Verified-at: b327071
- Last-touched: 2026-05-21

## src/cli/workflow-migrator.js:1

- Role: Foundation — one-shot in-place migrator for pre-§18 `workflow.json` (`entry_phase`, no `track_id`) → post-§18 shape. Derives `track_id` via `ENTRY_PHASE_TO_TRACK_ID` (intake→intake-full, spec→spec-entry, tdd→tdd-quickfix, chore→chore), remaps `completed[]` to node-ids, inits `skipped_alternates: []`, removes `entry_phase`. Idempotent. Unmapped `entry_phase` throws. Invoked by `harness/SKILL.md` preflight Step 3a. Reverse-map mirrored in `track_guard.sh` + `lib/resume_writer.py` for both-shape runtime acceptance.
- Companion: `.claude/skills/harness/SKILL.md`, `.claude/hooks/track_guard.sh:1`, `.claude/hooks/lib/resume_writer.py:1`, `tests/workflow-migrator.test.mjs`.
- Verified-at: b327071
- Last-touched: 2026-05-21
- Caveat: non-atomic write — backlog `workflow-migrator-write-not-atomic-power-loss-corruption-3e91`.

## src/cli/track-tasklist-materializer.js:1

- Role: Foundation — Track → canonical TaskList JSON (subjects, activeForms, metadata.phase, needs_user, blockedBy ordinals). Selector nodes via `evaluateAlternates(node, ctx)` (filter by `preconditions[]`; first qualifying alternate wins). Sub-tracks via `expandSubTrack` (inline nodes; propagate parent `depends_on` to entry nodes so the chain links cleanly). Used by `triage/seed-tasklist.mjs` and `tests/track-tasklist-materializer.test.mjs` against golden fixtures (byte-equivalent migration coverage).
- Companion: `.claude/skills/triage/seed-tasklist.mjs`, `tests/fixtures/golden-tasklists/*.golden.json`, `src/cli/workflows-validator-predicates.js:1`.
- Verified-at: b327071
- Last-touched: 2026-05-21

## src/.claude/workflows.template.jsonl:1

- Role: Pristine `.claude/workflows.jsonl` shipped by the baseline. Six lines: four selectable tracks (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`) + two sub-tracks (`swarm-implementation`, `tdd-worker-chain`). Each line conforms to `.claude/schemas/workflow-track.v1.json`. Byte-equivalent to pre-§18 hardcoded triage templates per spec AC-016 (`tests/byte-equivalent-migration.test.mjs`). Copied to `<target>/.claude/workflows.jsonl` by `build-template.sh` Stage 2 and CLI install. NEVER_TOUCH at upgrade time.
- Companion: `.claude/workflows.jsonl`, `src/cli/install.js:79`, `scripts/build-manifest.mjs`, `.claude/schemas/workflow-track.v1.json`.
- Verified-at: b327071
- Last-touched: 2026-05-21

## .claude/skills/triage/seed-tasklist.mjs:1

- Role: Foundation helper for `triage` (post-§18). Node ESM CLI; two modes — `--validate-only` (validate via `workflows-validator.js`; non-zero on first invariant violation) and `<track_id> <slug>` (materialize via `track-tasklist-materializer.js`; print TaskList JSON for triage's `TaskCreate` loop). Slug regex `^[a-z0-9][a-z0-9-]{0,63}$` (backlog `triage-helper-slug-interpolation-into-bash-subprocess-a720`).
- Companion: `.claude/skills/triage/SKILL.md:1`, `src/cli/workflows-validator.js:1`, `src/cli/track-tasklist-materializer.js:1`.
- Verified-at: b327071
- Last-touched: 2026-05-21
