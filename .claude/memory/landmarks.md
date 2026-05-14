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

## .claude/hooks/consent_gate_grant.sh:1

- Role: UserPromptSubmit hook that parses `/approve-spec` / `/approve-swarm` / `/grant-commit` in the user's raw prompt **before Claude is invoked**, derives the canonical slug via `lib/common.sh → canonical_slug`, and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (spec/swarm/commit) then allows Claude's approval-token write only when the marker is present, fresh (TTL = `consent.gate_marker_ttl_seconds`, default 120s), and slug-matched. Single-use; deleted on the allowed write.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: this hook is what makes Article IV consent gates structurally un-forge-able. Runs OUTSIDE Claude's tool boundary — Claude cannot reach the UserPromptSubmit code path, so it cannot mint the marker. The matching write-time `.<gate>_grant` Write/Edit/MultiEdit block lives in each PreToolUse approval guard, not here.

## .claude/hooks/spec_approval_guard.sh:1

- Role: PreToolUse hook on Edit/Write/MultiEdit enforcing Article IV gate A. Validates that a fresh `.spec_approval_grant` marker exists before allowing approval-token writes to `.claude/state/spec_approvals/<slug>.approval`; blocks self-approval inside spec markdown bodies; blocks direct writes to the marker file itself.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: pair this with `swarm_approval_guard.sh` and `git_commit_guard.sh` — the three approval guards share the same marker-validation pattern and `lib/common.sh → canonical_slug` is the single source of slug derivation across all three.

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

- Role: Stop hook that auto-resumes the harness across non-gated phase boundaries. Three-rung gate: (1) `stop_hook_active` absent on payload, (2) `.claude/state/.harness_active` marker exists, (3) `harness_state.state == "continue"`. Emits `{"decision":"block","reason":"…invoke Skill(harness)…"}` only when all three pass; silent otherwise.
- Verified-at: HEAD
- Last-touched: 2026-05-12
- Caveat: sanity rail logs WARN to `.claude/state/harness/harness_continuation.log` on marker-slug vs `workflow.json` slug mismatch but does NOT change the decision — intentional, so a stale marker doesn't strand the user. Never writes consent markers; structurally cannot reach `consent_gate_grant`'s code path.

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

## .claude/hooks/git_commit_guard.sh:1

- Role: PreToolUse hook with two matcher legs. (1) Bash leg gates `git commit` invocations on a fresh `commit_consent` token at `.claude/state/commit_consent` (default TTL 5 min, written by `/grant-commit` → `consent_gate_grant.sh`) and hard-blocks forbidden git operations (`git push`, `--force`, `--amend`, `--no-verify`, `reset --hard`, etc.) per CLAUDE.md Article VII regardless of consent. (2) Write leg gates Claude's writes to the consent files themselves: blocks direct writes to the `.commit_consent_grant` marker, and only allows writes to `commit_consent` when a fresh marker is on disk (single-use, consumed on success). Completes the symmetry with `spec_approval_guard.sh` (gate A) and `swarm_approval_guard.sh` (gate B).
- Verified-at: 1feee24
- Last-touched: 2026-05-14
- Caveat: the Bash-leg FORBIDDEN_RE is a raw regex over the command string, not a tokenized argv inspection — Q-003 (pending-questions.md) tracks the trade-off and the documented `-F /tmp/msg.txt` workaround for commit messages that legitimately mention forbidden git ops. The push-leg hard-block disagrees with CLAUDE.md Article VII's user-named-operation carve-out — Q-004 tracks the resolution (push consent gate vs. status quo `! git push` shell escape).
