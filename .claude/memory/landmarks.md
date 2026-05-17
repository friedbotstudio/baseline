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

- Role: `create-baseline` CLI entrypoint — argv routing, mode dispatch (fresh / `--force` / `--merge` / `--dry-run`), exit codes 0/1/2/3/4
- Verified-at: HEAD
- Last-touched: 2026-04-29
- Caveat: depends on every src/cli/*.js module + needs `template/` to exist (run `npm pack` or `bash scripts/build-template.sh` first)

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

- Role: drift-check between this repo's implementation and the constitution + seed.md. Verifies hook/agent/skill/command names + counts, settings.json wiring, project.json key presence, .mcp.json servers, vendored license files, helper script presence. Exit 0 PASS / 1 FAIL. Wired as the binding `project.json → test.cmd` for this project, so every `verify` stamp at `.claude/state/last_test_result` is grounded in this script's verdict.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: the script's `EXPECTED_*` count constants are load-bearing — any chore that adds/removes a hook, skill, or command bumps the counts here AND in CLAUDE.md/seed.md/README.md.

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

- Role: pristine ship-time template for the project's genesis prompt (`docs/init/seed.md`). `npx @friedbotstudio/create-baseline` overlays this onto a fresh target tree; `scripts/build-template.sh` regenerates `template/` from it. Per Article I.4 precedence, this template is the source of truth for the baseline's shape — any drift between `docs/init/seed.md` and this file means the genesis is out of step with what ships.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: byte-equal mirroring obligations: §17 (Article XI provenance citation) must match the corresponding section in `docs/init/seed.md`; the audit (`.claude/skills/audit-baseline/audit.sh`) reports `seed.md missing §17 citation` on absence. Touch this and `docs/init/seed.md` in the same commit.

## src/CLAUDE.template.md:1

- Role: pristine ship-time template for the in-session constitution (`CLAUDE.md`). Per Article XI, this file SHALL remain byte-equal to `CLAUDE.md` for the Article XI block; `audit-baseline` enforces `CLAUDE.md missing Article XI citation` on drift.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: touch this and `CLAUDE.md` in the same commit. The audit hashes every file under tracked skill paths against `manifest.files`, but the constitution mirror is verified via citation-presence checks, not hash equality — that's why the byte-equal obligation lives in this caveat rather than in a hash entry.

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

- Role: `freshInstall(templateDir, target)` — bulk `cp -r templateDir target` with a filter that skips `SPECIAL_MERGE` paths (`.mcp.json` → deep-merge); then applies `NEVER_TOUCH` (preserve user's `.claude/project.json` if present) and `SPECIAL_MERGE`; then `materializeNpmrc(target)` (line 71) writes `<target>/.npmrc` from `src/.npmrc.template`; finally writes the baseline manifest. `forceInstall` parallels the shape but with `force: true` and `skipNeverTouch: true`.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: `materializeNpmrc` reads `NPMRC_TEMPLATE_PATH` (resolved relative to `import.meta.url` → package root → `src/.npmrc.template`) — it's a no-op when the template path doesn't exist (fixture / dev tree without the file) AND when `target/.npmrc` already exists (never overwrite operator config). This indirection exists because npm pack mechanically drops top-level `.npmrc` files from published tarballs (see landmines.md → `npm-pack-excludes-dotnpmrc`), so the bytes ship under a non-excluded basename in `src/` and are materialized at install time.

## src/.npmrc.template:1

- Role: pristine ship-time bytes for the target project's `.npmrc`. Contents are exactly `ignore-scripts=true\nmin-release-age=7\n` (38 bytes). Materialized into `<target>/.npmrc` by `src/cli/install.js → materializeNpmrc()` during freshInstall/forceInstall.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: this file is NOT overlaid into `obj/template/` by `scripts/build-template.sh` — npm pack drops `.npmrc` from published tarballs regardless of `package.json → files`. The bytes ship in `src/.npmrc.template` (non-excluded basename) and `install.js` reads them at install time. The `ignore-scripts=true` default protects downstream consumers from postinstall-script supply-chain attacks; `min-release-age=7` (npm 11+) refuses to install registry versions younger than 7 days. AC-007 of the supply-chain-hardening workflow asserts these bytes are byte-identical end-to-end. Tied to runbook §Pre-publish hygiene sweep `~/.npmrc` operator defaults.

## .claude/skills/memory-flush/sweep.py:1

- Role: deterministic Step 0 actuator for /memory-flush. Three modes via `--mode {auto-close, prose-scan, stale-sweep}` + `--memory-dir`. auto-close deletes blocks carrying valid `resolved-at:` (pending-questions) or `superseded-at:` (other five canonical files) and flags malformed dates + per-file invariant violations. prose-scan surfaces entries whose body matches R1/R2/R3 (Resolution path/Superseded by/Resolved by, anchored, case-insensitive) and applies stdin replies (y deletes, n keeps, skip defers). stale-sweep re-derives the stale set with the same predicate as `memory_session_start.sh:1` and applies stdin replies (re-verify / delete / mark-closed / skip). Emits JSON action report on stdout.
- Verified-at: HEAD
- Last-touched: 2026-05-13
- Caveat: the stale predicate's non-git threshold (30 days) MUST stay in sync with `memory_session_start.sh:1`'s `STALE_DAYS` — they re-derive the same set. Spec design diagram says 90 days; the 30-day choice matches the test plan AC-003 row and the index header label `stale (>=30 commits old)`. The helper trusts argv strings reaching `git rev-list` (e.g., the verified-at value as `<stamp>..HEAD`); a malicious memory file could feed a `--exec`-style argv flag — low risk because filesystem write to `.claude/memory/` already implies broader compromise. See `docs/archive/2026-05-13/memory-lifecycle-closure/security.md` LOW finding.

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

## .claude/memory/backlog.md:1

- Role: The seventh canonical memory file. Captures future-work intent extracted automatically from user prompts (`source: user-instruction`) and assistant text (`source: assistant-deferral`) by `memory_stop.sh:1`'s anchored line-start intent regex. Stable-key shape: `<8-word-kebab-slug>-<4-char-sha256-suffix>`. Body schema: required verbatim blockquote, `source`, `status: open|picked-up|dropped`, `raised-on`, `raised-in-context`, optional `estimated-effort`, optional `depends-on: [[other-backlog-key]]` links. Closure via `superseded-at:` (same register as the other five non-pending canonical files); body `status:` field disambiguates `picked-up` (taken into a workflow) vs `dropped` (decided not to do). Auto-deletes on the next `/memory-flush` Step 0a sweep once a valid `superseded-at:` lands.
- Companion: `.claude/hooks/memory_stop.sh:1` (the producer), `.claude/skills/memory-flush/SKILL.md:1` (the curator), `.claude/skills/memory-flush/sweep.py:1` (the closure actuator; `STALE_EXEMPT_FILES = {'backlog'}` makes backlog entries decay-exempt), `.claude/hooks/memory_session_start.sh:1` (the SessionStart index emitter; same stale-exempt carve-out so backlog never shows up in stale counts).
- Verified-at: HEAD
- Last-touched: 2026-05-17
- Caveat: backlog is **stale-exempt** — `verified-at:` distance is meaningless for intent (it's not a verifiable fact about code state). The 30-commit / 30-day decay predicates in `memory_session_start.sh:_is_stale` and `sweep.py:is_stale` both early-return False for `name == 'backlog'`. Pruning still happens via `last-touched` ordering when the 500-entry size-cap is hit. The bootstrap entry that shipped with this file (`## bootstrap`, `superseded-at: 2026-05-17`) auto-deleted on the first Phase 10.6 invocation post-install — confirmed end-to-end in the backlog-memory-bucket workflow (archive: `docs/archive/2026-05-17/backlog-memory-bucket/`).
