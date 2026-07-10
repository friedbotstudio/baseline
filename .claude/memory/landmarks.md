---
owners: [scout]
category: codebase landmarks
size-cap: 700
key: path:line
verifies-against: git
---

# Codebase landmarks

Where things live in this repo. The `scout` skill cites these and re-verifies before use; failed verifications are corrected or deleted in the same run.

Each entry's stable key is `path:line`.

---

## bin/cli.js:1

- Role: `create-baseline` CLI entrypoint — argv routing, mode dispatch (fresh / `--force` / `upgrade` subcommand / `doctor` subcommand / `--dry-run`), exit codes 0/1/2/3/4.
- TTY routing: `dispatchInstall`, `dispatchUpgrade`, `dispatchDoctor` each branch on `process.stdout.isTTY` and dynamic-import the matching `src/cli/tui/*.js` module on the TTY path; non-TTY falls through to the plain path so clack never loads in CI. The `--help` and `--version` branches do the same against `src/cli/tui/meta.js` (TTY → brand banner, non-TTY → bare body).
- `--merge` flag removed in branded-cli-tui; passing it now exits 2 with stderr line pointing to `create-baseline upgrade <target>`. The router catches `parseArgs`'s unknown-option throw and emits the migration message before exit.
- Doctor adds `--json` flag: emits `JSON.stringify(report)` on stdout with the same exit codes; `--strict` still escalates customizations to exit 1. Error reports (no-manifest) also route through the TUI renderer when `process.stdout.isTTY` — no more short-circuit to the plain text formatter.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: depends on every src/cli/*.js module + needs `obj/template/` to exist (run `npm pack` or `bash scripts/build-template.sh` first). Tests can override the template dir via `CREATE_BASELINE_TEMPLATE_DIR=<path>` env var without running the full build (read at `bin/cli.js:73`).

## src/cli/plantuml.js:1

- Role: always-fetch logic for the upstream PlantUML jar (sha256-pinned, redirect-handling, mock-friendly via `opts.fetch`) PLUS `runJavaPreflight()` — a Foundation primitive that spawnSync-probes `java -version` for the install-time preflight in bin/cli.js + src/cli/tui/install.js. Honors `CREATE_BASELINE_JAVA_PROBE_OVERRIDE` env override (values `present` / `missing`) for deterministic testing, same pattern as `CREATE_BASELINE_TEMPLATE_DIR`. Detection of system plantuml on PATH was removed 2026-05-27 (workflow plantuml-jar-always-download) — the pinned jar is now the sole runtime target, invoked via `java -jar` by .claude/hooks/plantuml_syntax_guard.sh and .claude/skills/spec-render/render.mjs.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: pinned constants (`PINNED_SHA256`, `UPSTREAM_URL`, `PINNED_SIZE`) must update in lockstep with `.claude/bin/NOTICE` when the upstream PlantUML version bumps

## .claude/skills/audit-baseline/audit.mjs:1

- Role: drift-check between this repo's implementation and the constitution + seed.md. Verifies hook/agent/skill/command names + counts, settings.json wiring, project.json key presence, .mcp.json servers, vendored license files, helper script presence, and per-file memory-shape canonical preamble via the `isValidPreamble(text)` helper (strict opener `^# `, full preamble must include a closing `---` separator; `_pending` and `_resume` get the same shape check). Skill-ownership drift uses `loadManifest()` which tries `<root>/.claude/manifest.json` first (consumer projects) and falls back to `<root>/obj/template/.claude/manifest.json` (dev repo) — keep both paths in mind when reasoning about why the audit found or didn't find the manifest. **Consumer-mode fork (audit.mjs:415, audit.mjs:704):** when `<root>/.claude/manifest.json` is present AND `<root>/src/` is absent, the audit sets `SKIP_SRC = true`, marks `src templates: directory` PASS with reason "consumer install ... — src/ checks skipped", and bypasses every per-template assertion plus the `src/CLAUDE.template.md` Article X.2 mirror check. The §4.3 skills names check passes an empty set as `additions` (NOT `add_skills`) because the disk set is `disk_baseline_skills` (filtered to `owner: baseline`); project additions are out-of-scope per CLAUDE.md Article XI #5. Hooks/agents/commands DO accept additions there because their disk sets are unfiltered. Exit 0 PASS / 1 FAIL. Wired as the binding `project.json → test.cmd` for this project, so every `verify` stamp at `.claude/state/last_test_result` is grounded in this script's verdict.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- Caveat: the script's `EXPECTED_*` count constants are load-bearing — any chore that adds/removes a hook, skill, or command bumps the counts here AND in CLAUDE.md/seed.md/README.md. The `isValidPreamble` helper allows preamble-only files (empty body after the closing separator) so a freshly-emptied `_pending.md` still PASSes; opener-only files without a closing separator FAIL (regression trap). When the manifest is missing from BOTH lookup paths (e.g. fresh clone before `npm run build`), the audit emits a WARN-level "skill ownership: manifest" line and falls back to frontmatter scanning — drift detection is degraded but not failing. **Editing audit.mjs in flight breaks the manifest hash check until `npm run build` Stage 3 regenerates `obj/template/.claude/manifest.json`** — the dogfood flow is: edit, `npm run build`, verify PASS, commit. Stage 4 of build re-runs the audit AFTER the manifest refresh so the build is self-validating.

## .claude/hooks/consent_gate_grant.mjs:1

- Role: UserPromptSubmit hook that parses `/approve-spec` / `/approve-swarm` / `/grant-commit` / `/grant-push` in the user's raw prompt **before Claude is invoked**, derives the canonical slug via `lib/common.mjs → canonicalSlug`, and writes a short-lived consent marker at `.claude/state/.<gate>_grant`. The corresponding PreToolUse approval guard (spec/swarm/commit/push) then allows Claude's approval-token write only when the marker is present, fresh (TTL = `consent.gate_marker_ttl_seconds`, default 120s), and slug-matched. Single-use; deleted on the allowed write.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: this hook is what makes Article IV consent gates structurally un-forge-able. Runs OUTSIDE Claude's tool boundary — Claude cannot reach the UserPromptSubmit code path, so it cannot mint the marker. The matching write-time `.<gate>_grant` Write/Edit/MultiEdit block lives in each PreToolUse approval guard, not here.

## src/seed.template.md:1

- Role: pristine ship-time template for the project's genesis prompt (`docs/init/seed.md`). `npx @friedbotstudio/create-baseline` overlays this onto a fresh target tree; `scripts/build-template.sh` regenerates `obj/template/` from it. Per Article I.4 precedence, this template is the source of truth for the baseline's shape — any drift between `docs/init/seed.md` and this file means the genesis is out of step with what ships.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: byte-equal mirroring obligations apply only to specific sections, not the whole file. §17 (manifest provenance) must carry the same manifest paths in both files — `obj/template/.claude/manifest.json` for the shipped manifest and `<target>/.claude/manifest.json` for the consumer install location. The §16 (project-specific configuration) section MUST stay pristine in the template (no `Generated:` stamp, no detected-stack table); the audit emits `seed.template.md: §16 has been populated` if it drifts from the placeholder. Touch the template and `docs/init/seed.md` in the same commit but never bulk-cp from live seed.md to template — the live seed.md has §16 populated and would contaminate the template. Edit §17 by hand in both files.

## src/CLAUDE.template.md:1

- Role: pristine ship-time template for the in-session constitution (`CLAUDE.md`). Per Article XI, this file SHALL remain byte-equal to `CLAUDE.md` for the Article XI block; `audit-baseline` enforces `CLAUDE.md missing Article XI citation` on drift. Article XI carries the manifest-path contract: shipped manifest at `obj/template/.claude/manifest.json`, consumer install at `<target>/.claude/manifest.json`, runtime hash table separately at `<target>/.claude/.baseline-manifest.json`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: touch this and `CLAUDE.md` in the same commit. The byte-mirror test (`tests/template-drift.test.mjs`) flips to failure when CLAUDE.md and src/CLAUDE.template.md diverge. The audit hashes every file under tracked skill paths against `manifest.files`, but the constitution mirror is verified via citation-presence checks, not hash equality — that's why the byte-equal obligation lives in this caveat rather than in a hash entry. Pre-existing drift between the two files (e.g., Phase 11.5 changelog row missing from one side) is OUT of scope for the splash workflow but breaks the `tests/template-drift.test.mjs` invariant; fix in its own chore.

## .claude/skills/triage/SKILL.md:1

- Role: workflow entry point. Selects `entry_phase` (intake / spec / tdd / chore), writes `.claude/state/workflow.json`, seeds the `TaskCreate` checklist for every non-excepted phase + consent-gate placeholders (with `metadata.needs_user: true`). Auto-adds `swarm-plan`, `approve-swarm`, `swarm-dispatch`, `grant-commit`, `commit` to `exceptions` when the project is non-git.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the canonical task templates that the harness re-seeds from on every tick live inside this SKILL.md. Article V's "task discipline" rule depends on those templates being authoritative; if you change a phase's task shape, update the template here so harness re-seeding stays reconciled with `workflow.json → completed`.

## src/cli/doctor.js:46

- Role: `runDoctor(target, options={})` — read-only drift check against `<target>/.claude/.baseline-manifest.json`. Returns `{exitCode, strict, matched, customized, missing, added, tampered}`. With `options.strict: true`, any `customized` entry promotes exitCode to 1 and populates `tampered[]` with `{path, shipped, observed}` sha256 hex triples. Without `--strict`, customized is informational (legacy default exitCode 0). `formatReport(report)` at `src/cli/doctor.js:114` renders `TAMPERED: <path>  shipped=<sha256>  observed=<sha256>` lines when `tampered[]` is populated.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `--strict` is the post-install supply-chain tampering detector for the AC-006 contract (supply-chain-hardening workflow, 2026-05-13). `bin/cli.js` routes the flag via `parseArgs` and passes it as `{strict: !!values.strict}` to `runDoctor`. The `tampered[]` array exists ONLY when `customized.length > 0`; downstream consumers should `Array.isArray(report.tampered) && report.tampered.length > 0` before reading.

## src/cli/install.js:79

- Role: `freshInstall(templateDir, target)` — bulk `cp -r templateDir target` with a filter that skips `SPECIAL_MERGE` paths (`.mcp.json` → deep-merge) and `COPY_EXCLUDE` paths; then applies `NEVER_TOUCH` (preserve user's `.claude/project.json` if present) and `SPECIAL_MERGE`; then `materializeNpmrc(target)` writes `<target>/.npmrc` from `src/.npmrc.template`; finally writes `<target>/.claude/.baseline-manifest.json` as the runtime hash table. `forceInstall` parallels the shape but with `force: true` and `skipNeverTouch: true`. The shipped sha256 manifest at `obj/template/.claude/manifest.json` (with `owners.skills`) is delivered to `<target>/.claude/manifest.json` by the recursive cp itself — no special-case step — because it lives inside the `.claude/` subtree of the template; `COPY_EXCLUDE` is empty since path-level exclusion is no longer needed.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `materializeNpmrc` reads `NPMRC_TEMPLATE_PATH` (resolved relative to `import.meta.url` → package root → `src/.npmrc.template`) — it's a no-op when the template path doesn't exist (fixture / dev tree without the file) AND when `target/.npmrc` already exists (never overwrite operator config). This indirection exists because npm pack mechanically drops top-level `.npmrc` files from published tarballs (see landmines.md → `npm-pack-excludes-dotnpmrc`), so the bytes ship under a non-excluded basename in `src/` and are materialized at install time. The runtime `<target>/.claude/.baseline-manifest.json` and the shipped `<target>/.claude/manifest.json` are two distinct files: shipped is frozen at release time and carries `owners.skills`; runtime is built from `buildManifestFromDir(target, listFiles(target))` post-install and is hash-only. `writeBaselineManifest` excludes `.claude/.baseline-manifest.json` from its own hash table to avoid the self-reference, but DOES hash `.claude/manifest.json` so `upgrade`'s threeWayMerge tracks it as a normal file.

## src/.npmrc.template:1

- Role: pristine ship-time bytes for the target project's `.npmrc`. Contents are exactly `ignore-scripts=true\nmin-release-age=7\n` (38 bytes). Materialized into `<target>/.npmrc` by `src/cli/install.js → materializeNpmrc()` during freshInstall/forceInstall.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: this file is NOT overlaid into `obj/template/` by `scripts/build-template.sh` — npm pack drops `.npmrc` from published tarballs regardless of `package.json → files`. The bytes ship in `src/.npmrc.template` (non-excluded basename) and `install.js` reads them at install time. The `ignore-scripts=true` default protects downstream consumers from postinstall-script supply-chain attacks; `min-release-age=7` (npm 11+) refuses to install registry versions younger than 7 days. AC-007 of the supply-chain-hardening workflow asserts these bytes are byte-identical end-to-end. Tied to runbook §Pre-publish hygiene sweep `~/.npmrc` operator defaults.

## .claude/skills/memory-flush/sweep.mjs:1

- Role: deterministic actuator for /memory-flush Step 0 AND for /commit Step 6. Four modes via `--mode {auto-close, prose-scan, stale-sweep, stamp-closure}` + `--memory-dir`. auto-close deletes blocks carrying valid `resolved-at:` (pending-questions) or `superseded-at:` (other five canonical files) and flags malformed dates + per-file invariant violations. prose-scan surfaces entries whose body matches R1/R2/R3 (Resolution path/Superseded by/Resolved by, anchored, case-insensitive) and applies stdin replies (y deletes, n keeps, skip defers). stale-sweep re-derives the stale set with the same predicate as `memory_session_start.mjs:1` and applies stdin replies (re-verify / delete / mark-closed / skip). stamp-closure (non-interactive) takes `--backlog-keys <csv>` and writes `status: picked-up` + `superseded-at: <today>` to each named backlog.md entry; invoked by /commit Step 6 when workflow.json → source_backlog_keys is populated; report shape `{stamped, missing, already_closed}`. Emits JSON action report on stdout.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the stale predicate's non-git threshold (30 days) MUST stay in sync with `memory_session_start.mjs:1`'s `STALE_DAYS` — they re-derive the same set. Spec design diagram says 90 days; the 30-day choice matches the test plan AC-003 row and the index header label `stale (>=30 commits old)`. The helper trusts argv strings reaching `git rev-list` (e.g., the verified-at value as `<stamp>..HEAD`); a malicious memory file could feed a `--exec`-style argv flag — low risk because filesystem write to `.claude/memory/` already implies broader compromise. See `docs/archive/2026-05-13/memory-lifecycle-closure/security.md` LOW finding. stamp-closure has its own LOW finding (CWE-22 path traversal via slug; CWE-78 shell quoting of backlog-keys CSV) — see `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md`; mitigations are non-blocking carve-outs for a future hardening workflow.

## .claude/skills/chore/SKILL.md:1

- Role: alternate workflow track for tasks that need no TDD — documentation edits, governance count bumps, vendored-skill content updates, configuration tweaks, formatting, typo fixes, dependency bumps where no project code changes, skill consolidations. Skips `/scenario` and `/implement` (no failing test to drive); runs the edits directly; conditionally routes through `simplify` / `integrate` / `document` based on diff triggers. `verify`, `archive`, `/grant-commit`, `/commit` remain mandatory. Selected at `/triage` time when the request matches the chore predicate; recorded as `track_id: chore` in `.claude/state/workflow.json` (post-§18; legacy `entry_phase: chore` accepted on pre-§18 workflows).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: chore is a stripped-down pipeline, not a bypass — silently skipping a triggered conditional phase (e.g., `document` when prose was touched) violates Article IV. The conditional-phase trigger predicates live inside this SKILL.md body and are the authoritative list; the `triage` skill mirrors them when routing.

## src/cli/conflict.js:1

- Role: `SENTINEL_PATHS` (frozen array of 5 install-marker paths: `.claude`, `.claude/.baseline-manifest.json`, `CLAUDE.md`, `.mcp.json`, `docs/init/seed.md`) + `scanSentinels(target)` async helper. Returns the subset of sentinels found in the target tree; `bin/cli.js` uses the non-empty result to short-circuit fresh-install mode with a "prior baseline detected" message and the `--force` / `--merge` / `--dry-run` mode hint.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `.claude/.baseline-manifest.json` is the strongest "previously installed by create-baseline" signal because its presence implies a successful install; the file header comment in conflict.js explains why the older `README.md` sentinel was dropped (the allowlist build ships no README.md, so users keep their own). Update both `SENTINEL_PATHS` and `bin/cli.js`'s conflict-handling branch in lockstep if the install layout changes.

## .claude/hooks/lib/common.mjs:1

- Role: shared Node ESM helpers imported by EVERY hook (all 26 `.claude/hooks/*.mjs`; breaking changes cascade). Exports `readPayload`, `payloadGet`, `projectGet`, `emitBlock` / `emitAllow` / `emitAsk` / `emitInfo`, `logLine`, `canonicalRel`, `canonicalSlug`, `writeMarkerAtomic`, `validateConsentMarker`, `blockMarkerSelfWrite`, the consent-marker path constants (`CONSENT_MARKER_{SPEC,SWARM,COMMIT,PUSH}` plus `_REL` siblings), `matchAnyGlob(name, globs)` (shell-glob matcher for branch policy), `cmdMatchesAny(cmd, patterns)` (regex set for destructive-cmd guard), `computeProposedContent(tool, payload, filePath)` (post-write content reconstruction for content-aware guards like artifact_template_guard / spec_diagram_presence_guard / spec_design_calls_guard / plantuml_syntax_guard), and the branch-topology primitives `resolveWorkflowModel` / `isPrimaryWorkTree` / `currentBranch` (shared by `git_commit_guard` topology + `branch_guard` so the work-start gate cannot drift from the commit gate). Also hosts the **wrapper/quote-aware shell-command classifier** (added 2026-05-31): exported `gitSubcommandInvoked(cmd, sub)` + `gitSegments(cmd)`, backed by internal `executedFragments` / `shellTokens` / `extractSubstitutions` — used by `git_commit_guard` to detect real `git commit`/`git push` (including wrapped forms) without false-positiving on data. See landmine `shell-command-guards-must-classify-wrapper-and-quote-aware`.
- Verified-at: cb390e5
- Last-touched: 2026-07-04

## .claude/hooks/git_commit_guard.mjs:1

- Role: PreToolUse hook with two matcher legs. (1) Bash leg enforces branch-aware policy: `git commit` on a protected branch (per `project.json → git.protected_branches` glob; `null` = every branch protected) requires fresh `commit_consent` (`/grant-commit`, 5-min TTL); `git push` on a protected branch requires fresh `push_consent` (`/grant-push`, 5-min TTL); both proceed without consent on non-protected branches. `git.branch_pattern` regex (optional) gates commits on branch-name conformance. Detached HEAD denies both with explicit error. The Bash leg ALSO enforces **branch topology** (added 2026-06-04, commit 0e2fc79): `project.json → git.workflow_model` (`direct-to-main | github-flow | gitflow | trunk | ask`) declares where commits may land, and the guard blocks a commit whose current branch contradicts the model (direct-to-main + feature branch → "commit belongs on main"; github-flow + on main → "create a feature branch first"); `ask` passes (nothing declared). Topology enforces on the PRIMARY working tree only — swarm dispatch worktrees are exempt (worktree-aware carve-out). Hard-blocks remaining forbidden flags (`--amend`, `--no-verify`, `reset --hard`, `clean -f`, `checkout --`, `branch -D`, `config`, `rebase -i`, `add -A|.`). (2) Write leg gates Claude's writes to the consent files: blocks direct writes to the `.commit_consent_grant` and `.push_consent_grant` markers, and only allows writes to `commit_consent` / `push_consent` when a fresh marker is on disk (single-use, consumed on success). Completes the symmetry with `spec_approval_guard.sh` (gate A) and `swarm_approval_guard.sh` (gate B).
- Verified-at: cb390e5
- Last-touched: 2026-07-04
- Caveat: the Bash-leg FORBIDDEN_RE is a raw regex over the command string, not a tokenized argv inspection — commit messages that legitimately mention forbidden git ops need the `git commit -F <file>` workaround. Push is not in FORBIDDEN_RE; it's governed by the branch-aware policy.

## .claude/hooks/epic_approval_guard.mjs:1

- Role: the 23rd hook (added 2026-06-10, commit 121078f). PreToolUse(Write|Edit|MultiEdit) guard enforcing seed §18.9. Makes the epic `approved: true` flip un-forgeable: ALLOWS a false→true transition of `approved` in `.claude/state/epic/<slug>.json` only when the persistent token `.claude/state/spec_approvals/<slug>.approval` exists. That token is itself unforgeable (only `spec_approval_guard` permits its creation, and only on a fresh consent marker Claude cannot write), so authorization derives from the same forge-proof root as gate A — no new command, no new marker, no second human approval (spec: Candidate B).
- Companion: `.claude/hooks/spec_approval_guard.mjs` (produces the token this guard requires), `.claude/hooks/track_guard.mjs` (reads `approved` to let an epic-child skip mandatory discovery).
- Verified-at: 01ce882
- Last-touched: 2026-06-22
- Caveat: scope is deliberately narrow — fires ONLY on `.claude/state/epic/<slug>.json` writes, gates ONLY the false→true `approved` transition. Children[] appends, status flips, and idempotent re-writes of an already-approved epic pass through ungated (the `currentApproved` short-circuit at line 68). Existence + slug match only, NO TTL (an approved spec stays approved). The Bash write surface is now closed in parallel by `destructive_cmd_guard` via `lib/common.mjs → writesEpicApproval` (workflow `epic-approved-bash-surface`, backlog `-abad`); a residual `cd`/`pushd`-into-dir bypass remains (see backlog `residual-cd-into-epic-dir-bypass-...`). The durable fix is read-side derivation in `track_guard` (eliminate the trusted boolean).

## src/settings.template.json:1

- Role: pristine ship-time template for `.claude/settings.json` — the hook wiring + permissions file that `/init-project` copies (or merges) into a target repo. Declares all 22 baseline hooks across PreToolUse / PostToolUse / SessionStart / Stop / PreCompact / UserPromptSubmit events, plus `permissions.allow`/`deny` for tool gating. The overlay source for `npx @friedbotstudio/create-baseline`.
- Companion: `src/project.template.json:1` (the per-project config it pairs with), `src/CLAUDE.template.md:1` (the constitution template).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: adding a new hook requires touching this file AND the matching Article VIII row in `src/CLAUDE.template.md` AND `docs/init/seed.md` §4.1 — the audit cross-checks all three. `$CLAUDE_PROJECT_DIR` is the only valid path prefix for hook commands; absolute paths leak the author's home directory into installed projects.

## src/project.template.json:1

- Role: pristine ship-time template for `.claude/project.json` — the per-project config the CLI installs with `configured: false`, then `/init-project` populates after running the recommender. Declares `test`/`lint` runners, `tdd` source/test/ui globs, `destructive` Bash patterns, `swarm` config (`min_tasks_worth_swarming`, `isolation`, `exempt_path_prefixes`), `git` branch policy (`protected_branches`, `branch_pattern`), and the consent gate TTL.
- Companion: `src/settings.template.json:1` (hook wiring), `src/cli/install.js:79` (CLI overlay logic).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `configured: false` is the project-agnostic operating state (Art. III). `setup_guard` surfaces a one-shot reminder when it sees this; other guards bind regardless. `git.protected_branches: null` (the default) means every branch is consent-gated — set explicitly to `["main", "release/*"]` to loosen.

## .claude/skills/commit/SKILL.md:1

- Role: Phase 11 workflow skill. Stages the diff and runs `git commit` with the message via HEREDOC; the `git_commit_guard` Bash-time hook enforces consent independently. Prereq line 8: BOTH `archive` AND `memory-flush` in `workflow.json → completed` (or in `exceptions`). Step 1 archives `workflow.json` into the slug bundle as the first move; Step 2 verifies memory-flush is the final non-commit entry; Steps 3–7 stage named paths, draft message (humanizer pass on the body), and commit. Non-git projects auto-except this skill at triage time.
- Companion: `.claude/hooks/git_commit_guard.mjs:1` (consent enforcement at the Bash boundary), `.claude/skills/archive/SKILL.md:1` (Phase 10.5 sibling), `.claude/skills/memory-flush/SKILL.md:1` (Phase 10.6 sibling whose completion this skill's prereq depends on).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: never `git add -A` / `git add .` (seed.md Pillar 5 forbids both); always stage named paths. Never `git commit --amend` or pass `--no-verify`/`--no-gpg-sign` unless the user explicitly named the operation in their current request. The phase-prereq tightening to require `memory-flush` (added 2026-05-17 with the Phase 10.6 wiring) is structurally enforced by this skill's prose — `git_commit_guard` does not duplicate the check.

## .claude/skills/memory-flush/SKILL.md:1

- Role: Workflow Phase 10.6 owner + ad-hoc curation entry point. Runs between `/archive` (Phase 10.5) and `/grant-commit` (Phase 11) on every track (intake / spec / tdd / chore). The skill SOP composes three `sweep.mjs` modes (auto-close / prose-scan / stale-sweep) for canonical-file closure (Step 0), then triages `_pending.md` candidates through promote / discard / defer (Steps 1–5), then resets `_pending.md` to skeleton (Step 5), then emits a Step 6 report. On **empty `_pending.md` body** (zero `## CANDIDATE:` blocks) the skill fast-paths: Step 0 sweeps still run unconditionally, Steps 1–5 are skipped, Step 6 emits a one-line "no pending candidates" report. Empty-pending fast-path still appends `"memory-flush"` to `workflow.json → completed` so `/commit`'s prereq is satisfied either way.
- Companion: `.claude/skills/memory-flush/sweep.mjs:1` (the deterministic actuator the SOP invokes), `.claude/hooks/memory_session_start.mjs:1` (the debt-mode session-start nag that signals when ad-hoc invocation is needed outside a workflow), `.claude/skills/commit/SKILL.md:1` (Phase 11 sibling whose prereq depends on this skill's completion).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the empty-pending fast-path skips Steps 1–5 but NOT Step 0 — auto-close on `pending-questions.md` entries carrying `resolved-at:` runs regardless of pending body state. This is how Q-001's resolution propagated in the meta-bootstrap workflow that introduced Phase 10.6. The session-start nag in `memory_session_start.mjs` fires only on K>0 AND `workflow.json` absent (debt-mode); during an active workflow the nag stays silent because this skill's Phase 10.6 invocation handles flushing.


## .claude/skills/tdd/drift_check.mjs:1

- Role: spec-to-implementation drift analysis helper. Invoked by the harness as a drift-check-tick inside /tdd's seeded worker chain (between the last design-ui-tick / verify-tick and tdd-finalize). CLI: `--slug <slug>` (required), `--project-root <path>` (default `.`), `--diff <path>` (override of `git diff <merge-base>..HEAD`). Parses numbered AC IDs from the spec's ## Acceptance criteria table (regex on `| AC-NNN |` rows) and row-slugs from the ## Design calls table; scores each as `resolved` (item ID literal in any diff added-line) or `unresolved` (no diff added-line references it). Writes `<project-root>/.claude/state/drift/<slug>.md` with a `| kind | id | verdict | evidence |` markdown table per item. Exit 0 on zero-unresolved, exit 1 on `≥ 1 unresolved`, exit 2 on tool error. Special case: spec absent → "no spec; skipped" on stdout, exit 0, no report file (chore-track support per AC-011 of the wf-loop-closing-hygiene spec).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the workflow that first shipped drift_check.mjs (workflow-loop-closing-hygiene) did NOT exercise the harness's drift-check-tick path at runtime — the harness instance in flight predated the tdd/SKILL.md update and could not inline the helper. Unit-tested via `.claude/skills/tdd/tests/drift_check_test.sh` (4 scenarios covering all-resolved / one-unresolved / no-spec / *(none)*-design-calls). Live runtime exercise begins in the next spec-track workflow after the shipping commit. Path-traversal LOW finding on the `--slug` argument is non-blocking (operator trust model) — see `docs/archive/2026-05-17/workflow-loop-closing-hygiene/security.md` Finding #1.

## .claude/memory/backlog.md:1

- Role: The seventh canonical memory file. Captures future-work intent extracted automatically from user prompts (`source: user-instruction`) and assistant text (`source: assistant-deferral`) by `memory_stop.mjs:1`'s anchored line-start intent regex. Stable-key shape: `<8-word-kebab-slug>-<4-char-sha256-suffix>`. Body schema: required verbatim blockquote, `source`, `status: open|picked-up|dropped`, `raised-on`, `raised-in-context`, optional `estimated-effort`, optional `depends-on: [[other-backlog-key]]` links. Closure via `superseded-at:` (same register as the other five non-pending canonical files); body `status:` field disambiguates `picked-up` (taken into a workflow) vs `dropped` (decided not to do). Auto-deletes on the next `/memory-flush` Step 0a sweep once a valid `superseded-at:` lands.
- Companion: `.claude/hooks/memory_stop.mjs:1` (the producer), `.claude/skills/memory-flush/SKILL.md:1` (the curator), `.claude/skills/memory-flush/sweep.mjs:1` (the closure actuator; `STALE_EXEMPT_FILES = {'backlog'}` makes backlog entries decay-exempt), `.claude/hooks/memory_session_start.mjs:1` (the SessionStart index emitter; same stale-exempt carve-out so backlog never shows up in stale counts).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: backlog is **stale-exempt** — `verified-at:` distance is meaningless for intent (it's not a verifiable fact about code state). The 30-commit / 30-day decay predicates in `memory_session_start.mjs:_is_stale` and `sweep.mjs:is_stale` both early-return False for `name == 'backlog'`. Pruning still happens via `last-touched` ordering when the 500-entry size-cap is hit. The bootstrap entry that shipped with this file (`## bootstrap`, `superseded-at: 2026-05-17`) auto-deleted on the first Phase 10.6 invocation post-install — confirmed end-to-end in the backlog-memory-bucket workflow (archive: `docs/archive/2026-05-17/backlog-memory-bucket/`).

## .claude/skills/tdd/SKILL.md:1

- Role: Phase 6 TDD coordinator. Thin orchestrator — decides scenario recipe + implementation contract in main context, writes state at `.claude/state/tdd/<slug>.json`, seeds per-worker tasks (scenario, implement, verify-tick, design-ui-tick, drift-check-tick, tdd-finalize) into the TaskList, yields with `harness_state.continue` so the harness invokes each worker as its own tick. No subagent delegation; no nested Skill calls. The harness inlines verify-tick mechanically rather than invoking the (contract-only) verify skill.
- Companion: `.claude/skills/scenario/SKILL.md` (worker that writes failing tests), `.claude/skills/implement/SKILL.md` (worker that makes them pass), `.claude/skills/design-ui/SKILL.md:1` (UI surface worker per `## Design calls` row), `.claude/skills/tdd/drift_check.mjs:1` (drift-check-tick actuator).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: prereq is approved-spec OR `entry_phase == tdd` (quickfix/bugfix). The seeded worker chain is one Skill call per tick — the coordinator does NOT loop internally over workers (that would violate Article II's "decisions in main context, workers execute pre-decided recipes" rule). drift-check-tick fires before tdd-finalize so the spec-to-implementation cross-check happens while the harness is still in the TDD phase rather than as a sibling phase.

## .claude/skills/tdd/tests/drift_check_test.sh:1

- Role: Fixture-based integration tests for `.claude/skills/tdd/drift_check.mjs:1`. 4 scenarios covering AC-002 (all-resolved → exit 0, table marks every AC `resolved`), AC-003 (one-unresolved → exit 1, evidence column names the missing AC ID), AC-011 (no-spec → exit 0, stdout `no spec; skipped`, no report file), and the `*(none)`-Design-calls case (spec present but Design calls table absent → exit 0 over ACs only). Builds tempdir project roots with synthetic spec files + `--diff` override fixtures, invokes the helper, asserts on the markdown report at `<project-root>/.claude/state/drift/<slug>.md` and the exit code.
- Companion: `.claude/skills/tdd/drift_check.mjs:1` (the helper under test), `.claude/skills/tdd/tests/run.sh:1` (the aggregate runner that picks this up).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: not invoked by `project.json → test.cmd` (which runs only `audit-baseline`); run manually during /tdd, /simplify, /integrate. The test scenarios encode the contract documented in `docs/specs/workflow-loop-closing-hygiene.md` ACs — adding behaviors to `drift_check.mjs` requires extending this suite in lockstep, or the next drift-check-tick will go unverified.

## src/cli/tui/upgrade.js:1

- Role: Domain — interactive upgrade flow that replaces the retired `--merge`. Plan/apply split: (1) dry-run `threeWayMerge` to enumerate `SKIP_CUSTOMIZED` conflicts (including tier-2/3 customized files when `canRecoverBase` reports BASE unrecoverable — see [[src/cli/merge.js:1]]), (2) `prompts.select` per conflict with `CHOICE_OPTIONS` = four entries `keep-mine / take-theirs / merge / abort` (post tier1-merge-option workflow 2026-05-22; `show-diff` and the cap-at-2 loop are removed), (3) on cancel/abort bail before any write, (4) real `threeWayMerge` with `onSkipCustomized` callback backed by the user's choices Map. The `merge` pick routes through `src/cli/merge.js → fallbackToBinaryPrompt`'s new branch and calls `writeStageBaseless` to stage incoming bytes under `.claude/state/upgrade/<ts>/`. Per-file action lines render `ACTION_LABELS[action.kind]` padded to `ACTION_LABEL_WIDTH` (single source of truth from `src/cli/merge.js`). Pending-stage timestamp is rendered via `formatStageTimestamp` (from `src/cli/upgrade-tiers.js:59`) so users see `2026-05-21 11:45 UTC` instead of the raw `2026-05-21T11-45-00-000Z`. Writes `renderHeader({version, subtitle: 'upgrade'})` from `src/cli/tui/splash.js:1` above the clack intro (changed from `renderBrandStrip` on 2026-05-23 per cli-wordmark-on-all-commands; narrow terminals fall back to the slim strip automatically). The legacy-manifest warning also revised that day to name `/upgrade-project` + the marker's silent-skip behavior. `listShippedFiles` filters `COPY_EXCLUDE` (imported from `src/cli/install.js`) so `manifest.json` is never sent into `threeWayMerge` as an ADD candidate. Cancel sentinel: `Symbol.for('clack:cancel')`.
- Companion: `src/cli/install.js` (`COPY_EXCLUDE` source-of-truth), `src/cli/tui/splash.js:1` (brand strip), `src/cli/merge.js → threeWayMerge` + `ACTION_LABELS` + `fallbackToBinaryPrompt` (data layer with `{dryRun, onSkipCustomized}` opts; `'merge'` branch added in tier1-merge-option), `src/cli/upgrade-tiers.js → formatStageTimestamp` + `findPendingStage` + `writeStageBaseless`, `bin/cli.js → dispatchUpgrade` (router), `tests/upgrade.test.mjs`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `bin/cli.js`'s non-TTY upgrade path is a separate code branch (`runPlainUpgrade`) that calls `threeWayMerge` directly without the onSkipCustomized callback. Both branches use the same `ACTION_LABELS` render and the COPY_EXCLUDE-filtered `listShippedFiles`. The non-TTY path NEVER reaches the Merge choice (no interactive prompt) — customized files default to keep-mine with exit 3, by design (spec AC-006). If you change the apply logic or the exclude set in one branch, mirror the change in the other or the two paths diverge.

## src/cli/tui/meta.js:1

- Role: Domain — branded renderers for the meta commands (`--help`, `--version`) AND for usage-class errors. Three exports: `renderHelp(helpText, _version)`, `renderVersion(version)`, `renderUsageError(msg, helpText, version)`. `renderHelp` in TTY prepends the full splash marquee from `src/cli/tui/splash.js:1` (wordmark + tagline + commands + try line + discover URL) before the canonical HELP_TEXT body; non-TTY emits HELP_TEXT byte-clean. `renderVersion` in TTY prints the wordmark + version marquee; non-TTY emits the bare version string. `renderUsageError` writes to stderr (banner + `Error: <msg>` + HELP_TEXT) so every parseArgs/usage-class exit ships brand-framed guidance.
- Companion: `src/cli/tui/splash.js:1` (wordmark + brand strip + marquee renderers), `src/cli/tui/tokens.js:1` (colors), `bin/cli.js` (every non-success return path routes through `usageError(msg)` which delegates here).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the non-TTY branch emits a BARE version (no `baseline v` prefix) on purpose — script consumers running `$(create-baseline --version)` expect a parseable version string. `renderHelp` deliberately ignores its `version` parameter (renamed `_version`) because the splash no longer renders a version line; version lives on `--version` only. Restoring version to the splash would force the docs-site cli-splash.png to re-render every release.

## src/cli/tui/tokens.js:1

- Role: Foundation — ANSI brand-color helpers translating Friedbot Studio's oklch tokens (from `site-src/assets/site.css :root`) to 24-bit truecolor escape sequences. Exports named helpers (`accentShadow`, `accent`, `accentLight`, `muted`, `success`, `warn`, `error`, `rule`), plus the raw `paintRGB(rgb, text)` function and a frozen `PALETTE` map used by `src/cli/tui/splash.js:1` to paint the wordmark row-by-row (bevel banding: shadow / mid / highlight / mid / shadow). Respects `NO_COLOR` env var and `process.stdout.isTTY`; falls back to plain when either disables color.
- Companion: `src/cli/tui/splash.js:1` (consumes `paintRGB` + `PALETTE.accentShadow/accent/accentLight`), `src/cli/tui/{install,upgrade,doctor,meta}.js` (consume named helpers), `site-src/assets/site.css` (the canonical brand palette these tokens approximate).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the RGB triples are oklch-to-sRGB *approximations*; exact perceptual match is impossible across terminal palettes. The new `accentShadow` triple (122,41,7 ≈ #7a2907) approximates `oklch(35% 0.15 41.5)` — keep it in sync with both the docs-site value and the wordmark's outer bevel bands. If you add another paint helper, also add the matching `PALETTE.<name>` key so splash.js can reach it without importing every helper individually.

## src/cli/merge.js:1

- Role: Domain — three-way merge engine used by the `upgrade` subcommand. Exports `threeWayMerge(templateDir, target, oldManifest, newManifest, opts)`, the `ACTION_KINDS` enum (ADD / OVERWRITE / NOOP / **MARKER_MATCHED** / SKIP_CUSTOMIZED / PRUNE / PRUNE_SKIPPED_CUSTOMIZED / NEVER_TOUCH_PRESERVE / NEVER_TOUCH_ADD / SPECIAL_MERGE / MECHANICAL_MERGE_CLEAN / MECHANICAL_MERGE_CONFLICTED / SEMANTIC_MERGE_STAGED), and the `ACTION_LABELS` + `ACTION_LABEL_WIDTH` user-facing render map consumed by both CLI paths. Per-file branch order in the loop: NEVER_TOUCH → SPECIAL_MERGE → tgtHash===newHash NOOP → tgtHash===oldHash OVERWRITE → **marker-consult `matchesReconciledHash(marker, rel, newHash)` MARKER_MATCHED** → dispatchCustomized → upstream-removed prune. Marker is loaded once via `await readMarker(target)` at the top of threeWayMerge. Supports `{dryRun, onSkipCustomized, pack}` opts: dry-run returns planned actions without writing; `onSkipCustomized` is the per-conflict callback (keep-mine / take-theirs / merge / abort). `dispatchCustomized` dry-run branch calls `canRecoverBase` and downgrades tier MECHANICAL/SEMANTIC to SKIP_CUSTOMIZED when BASE is unrecoverable. `fallbackToBinaryPrompt`'s `'merge'` branch calls `writeStageBaseless` for exit-code-5 routing.
- Companion: `src/cli/install.js` defines `NEVER_TOUCH` (expanded 2026-05-23 to include `.claude/memory/_pending.md` + `.claude/memory/_resume.md`) + `SPECIAL_MERGE`; `src/cli/manifest.js` supplies `hashFile` + `saveManifest`; `src/cli/mcp.js` supplies `deepMergeMcpServers`; `src/cli/upgrade-tiers.js` supplies `dispatchByTier` + `NoBaseError` + `canRecoverBase` + `writeStageBaseless`; **`src/cli/reconciliation-marker.js` supplies `readMarker` + `matchesReconciledHash` (added 2026-05-23 per upgrade-no-replay-prompts spec)**; `src/cli/tui/upgrade.js` + `bin/cli.js → dispatchUpgrade` are the TTY / non-TTY consumers.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## site-src/_includes/install-pill.njk:1

- Role: Domain — compact click-to-copy install-command pill, quieter cousin of `.cli-strip`. Single `<button data-copy="…">` with monospaced command, prompt glyph, and copy/check icon pair. Reuses the existing `[data-copy]` handler at `site-src/assets/site.js:244` (Clipboard API + execCommand fallback; flips `.is-copied` for ~1.8s). Feedback IS the icon swap (copy → check) — no hint-text element by design.
- Companion: `site-src/assets/site.css` `.install-pill` block defines the dark terminal aesthetic at compact scale; `site-src/_data/site.cjs` is unrelated but the sister `site.byline` field shipped in the same workflow. Consumers: `site-src/index.njk` (hero, wrapped in `.hero-install`) and `site-src/install.njk` (page top, wrapped in `.page-install`).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the existing loud `.cli-strip` above the footer of `index.njk` stays unchanged — pill and strip serve different placements (header-adjacent vs. final CTA). Do not collapse them into a shared base class; the duplication is intentional system-kinship at different scales.

## src/cli/upgrade-tiers.js:1

- Role: Domain — three-tier upgrade dispatch + BASE-content recovery + semantic-merge staging (three-way + two-way). Exports `dispatchByTier(rel, tier, ctx)` (routes BINARY_PROMPT → SKIP_CUSTOMIZED for caller to prompt, MECHANICAL → `git merge-file --diff3` via spawnSync, SEMANTIC → stage BASE+INCOMING+manifest under `.claude/state/upgrade/<ts>/`), `resolveBase(rel, baseline_version, target, {oldManifest, pack})` (hybrid resolver: cache-first read from `.claude/.baseline-prior/<rel>` → sha256-verify against oldManifest → fall back to npm `libnpmpack.pack('@friedbotstudio/create-baseline@<v>')` → sha256-verify → write-through cache), `writeStage(ctx, rel, baseBuf, incomingBuf, localBuf)` (three-way; per-run shared `ctx.stageRunTs` initialized lazily; appends entries to stage manifest with status PENDING + `base_sha256` as 64-hex), `writeStageBaseless(ctx, rel, incomingBuf, localBuf)` (two-way, added in tier1-merge-option 2026-05-22; same stage dir layout but no `<rel>.baseline-base` artifact, manifest entry carries `base_sha256: null` — the discriminator `/upgrade-project` reads to route to two-way reconciliation), `findPendingStage(target)` (idempotency precondition — returns first stage_ts with PENDING entries OR null when all RECONCILED). `NoBaseError extends Error` with `kind` enum (`cache_sha_mismatch` / `legacy_manifest` / `npm_fetch_failed` / `npm_sha_mismatch` / `npm_missing_file` / `tarball_path_traversal`). Shared `ensureStageDir(ctx)` helper extracted as a private foundation for both writers.
- Companion: `src/cli/merge.js → dispatchCustomized` calls dispatchByTier when the manifest entry carries `{sha256, tier}`; on `NoBaseError` or tier-1 user-pick-Merge, `fallbackToBinaryPrompt` calls `writeStageBaseless` (never uses LOCAL as BASE — security AC-008 hard rule). `src/cli/tui/upgrade.js → findPendingStage` checked at start of run() short-circuits with exit 5 when a stage is pending (idempotency AC-007). `.claude/skills/upgrade-project/SKILL.md` reads the stage manifest, branches on `base_sha256 === null` for two-way vs three-way reconciliation. `src/cli/install.js → writeBaselinePriorMirror` seeds `.claude/.baseline-prior/` at fresh install (mirror + `*\n` gitignore).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: production tarball extraction uses `spawnSync('tar', ['-xz', '-C', tmp, '-f', '-'])` with defense-in-depth path-traversal check (resolved candidate must startsWith tmpRoot+sep) — both BSD tar (macOS default) and GNU tar reject absolute paths and `..` by default, but the explicit check guards against future tar-binary changes (security report 2026-05-20). The `pack` option in `resolveBase` is a DI seam: tests pass a `Map<rel, Buffer>` stub; production calls `libnpmpack.default` lazily so tests don't force the import. `ctx.stageRunTs` is initialized inside `ensureStageDir` on first SEMANTIC/Merge dispatch and shared across the same merge run so all staged files land in one stage_ts dir — never mutate it externally. `appendToStageManifest` accepts a nullable `baseBuf`; passing `null` (from `writeStageBaseless`) writes `base_sha256: null` to the manifest entry.

## src/cli/reconciliation-marker.js:1

- Role: Foundation — per-target reconciliation marker. Writes `<target>/.claude/.baseline-reconciliations.json` (schema_version: 1, body shape `{reconciliations: {rel: {baseline_version, reconciled_against_template_sha, reconciled_at}}}`) recording which template hash each customized file was reconciled against by `/upgrade-project`. Exports: `readMarker(target)` → `ReconciliationsFile | null` (ENOENT → null silently; malformed JSON / future schema_version → null with stderr warning), `recordReconciliation(target, rel, baseline_version, template_sha)` → `void` (atomic write-then-rename via `randomUUID` tmpfile; throws typed `MarkerWriteError` on filesystem failure), `matchesReconciledHash(marker, rel, template_sha)` → `boolean` (pure string equality; null marker → false), `MARKER_PATH_REL` constant, `MarkerWriteError` class. Consumed by `src/cli/merge.js → threeWayMerge` (marker-consult branch between unchanged-since-install and dispatchCustomized: matched newHash → MARKER_MATCHED NOOP) and by `src/cli/doctor.js` (MARKER_PATH_REL exclusion in the `added` scan parallel to MANIFEST_REL).
- Companion: in-process CLI library; consumed only inside the create-baseline CLI process. **Post marker-helper-shipped-instead-of-dev-import (2026-05-27): `recordReconciliation`'s write side has a byte-parity peer at `.claude/skills/upgrade-project/marker.mjs:1` — that file is the shipped CLI helper invoked by `/upgrade-project` in consumer installs (which don't receive `src/cli/`).** Test coverage at `tests/reconciliation-marker.test.mjs` (15 scenarios). Spec history: `docs/specs/upgrade-no-replay-prompts.md` §Behavior #2/#4/#5/#6 introduced the module; `docs/specs/marker-helper-shipped-instead-of-dev-import.md` AC-002 added the shipped-peer parity contract.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: `rel` parameter is stored as a JSON object key only — NOT used to construct a filesystem path (no path-traversal vector through rel). The only filesystem path constructed is `<target>/.claude/.baseline-reconciliations.json` (fixed shape; `target` comes from CLI argv). Atomic write requires the `.claude/` parent dir writable — readonly parent throws `MarkerWriteError`; the caller (`/upgrade-project`) is responsible for surfacing without rolling back the LOCAL bytes (LOCAL is already on disk and is the user-visible outcome of reconciliation). v1 schema does NOT validate that `template_sha` is a 64-char hex (trust-the-caller per spec NEW-2 resolution). **The shipped-peer at `.claude/skills/upgrade-project/marker.mjs` is a deliberate small duplication (~30 lines of write-side logic) rather than a re-export — the CLI ships under `src/` while `.claude/` ships separately, so cross-tree imports break the dev→prod path. Keep marker shape changes synchronized across both files; the byte-parity test `test_when_helper_and_lib_invoked_with_same_args_then_produce_byte_equal_markers_modulo_timestamp` enforces drift detection.**

## .claude/skills/upgrade-project/SKILL.md:1

- Role: Maintenance skill (NOT a workflow phase) — invoked reactively when `create-baseline upgrade` exits 5 with a "Pending semantic-merge stage" pointer OR when the SessionStart hook surfaces a pending-stage nag. Reads `.claude/state/upgrade/<ts>/manifest.json` (shape: `stage_version: 1`, `slug`, `created_at`, `baseline_version_from`, `baseline_version_to`, `files[]` with per-entry `{rel, base_sha256: <64-hex>|null, incoming_sha256, local_sha256, status}`). Procedure: step 2 classification preamble branches on `base_sha256`; step 3 three-way reconciliation (zero-drift renumbering rule); step 4 two-way reconciliation (renumbering rule disclaimed); **step 5 record reconciliation marker** (rewritten 2026-05-27 per marker-helper-shipped-instead-of-dev-import spec): invokes `node .claude/skills/upgrade-project/marker.mjs record <target> <rel> <baseline_version_to> <incoming_sha256>` for every per-file RECONCILED transition (NOT NEEDS_USER_INPUT, NOT dry-run); step 6 shared finalize (delete stage dir when all-RECONCILED). Supports `args=dry-run` (emits unified diff, no writes, no stage delete, **no marker write** — would lie to next upgrade). Fallback: NEEDS_USER_INPUT preserves stage. The SHALL NOT constraint at the constraints section narrowly permits writes to `.claude/.baseline-reconciliations.json` via the shipped helper (atomic write-then-rename); `.baseline-prior/` and `.baseline-manifest.json` remain forbidden.
- Companion: stage written by `src/cli/upgrade-tiers.js → writeStage` / `writeStageBaseless`; stage manifest read by `findPendingStage` (idempotency check) and by this skill. CLI's pointer emitted by `src/cli/tui/upgrade.js → run` and `bin/cli.js → dispatchUpgrade` when findPendingStage returns non-null. `.claude/hooks/memory_session_start.mjs:1` scans `.claude/state/upgrade/*/manifest.json` for `status: PENDING` and emits a one-line nag. **The shipped marker helper at `.claude/skills/upgrade-project/marker.mjs:1` is the post-RECONCILED writer (replaced the v0.8.1 `node -e "import('./src/cli/reconciliation-marker.js')..."` invocation that broke in consumer installs because `src/cli/` doesn't ship); `src/cli/merge.js → threeWayMerge` remains the next-upgrade consumer via `src/cli/reconciliation-marker.js`.**
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: skill body declares the **zero-drift renumbering rule** (binding per AC-006 of the upgrade-flow-rework spec, AND per AC-003 of the tier1-merge-option spec): when both BASE→INCOMING and BASE→LOCAL add structural entries at the same anchor (e.g. both add a new Article XI), shift user content to the NEXT AVAILABLE slot (XII), never fold. Recursive: if a later baseline adds XII, shift user to XIII. The payoff: a subsequent upgrade against the reconciled file produces zero new staging entries. THE RULE APPLIES TO THREE-WAY ONLY — two-way reconciliation (BASE-less) has no BASE anchor to shift against, and the SKILL.md body explicitly disclaims it in the two-way sub-procedure. Also: skill body declares the **path-validation constraint** — before writing reconciled bytes, verify `path.resolve(target, rel)` is a descendant of target; escapes route to NEEDS_USER_INPUT with reason `path-traversal-rejected` (security defense-in-depth against tampered stage manifests).

## src/cli/tui/splash.js:1

- Role: Domain — branded splash surfaces. Holds the BASELINE wordmark (ANSI-Shadow style, 5 letter rows + 1 outline trace row in `▔`) and exports five renderers: `renderWordmark()` (paints each row with `SHADES[i]` from `PALETTE` in bevel order shadow/mid/highlight/mid/shadow + outline in accentShadow), `renderSplash({tagline, tryLine, discoverUrl})` (full marquee for `--help` and no-arg TTY landing — intentionally version-LESS so the docs-site PNG doesn't go stale every release), **`renderHeader({subtitle, version, columns})`** (wordmark + tagline header used by install/upgrade/doctor command intros, added 2026-05-23 per cli-wordmark-on-all-commands; falls back to `renderBrandStrip` when `wordmarkFits(columns)` is false), `renderBrandStrip({version, subtitle})` (slim two-row strip used by `--version`, the usage-error renderer in meta.js, and as `renderHeader`'s narrow-terminal fallback), and `renderVersionMarquee(version)` (wordmark + version line for `--version`). Also exports `wordmarkFits(columns)` which treats falsy columns (0 under `script(1)` pty) as wide-enough so the marquee still renders.
- Companion: `src/cli/tui/tokens.js:1` (`paintRGB` + `PALETTE` source), `src/cli/tui/meta.js:1` (consumer for `--help` and `--version`), `src/cli/tui/{install,upgrade,doctor}.js:1` (consumers for `renderHeader` since 2026-05-23), `bin/cli.js` no-arg landing (TTY branch consumes `renderSplash`), `tests/splash.test.mjs` (structural assertions on rows, banding, outline trace, command table, brand strip composition, renderHeader + narrow-fallback), `site-src/assets/cli-splash.png` (frozen PNG rendered with freeze on `#080b12` background).
- Verified-at: 01ce882
- Last-touched: 2026-06-22
- Caveat: the wordmark width is 60 cols. Narrow terminals (< 60 cols) fall through via `wordmarkFits()` — for `renderHeader` this means returning the slim `renderBrandStrip` output instead. If you change the WORDMARK array, update WORDMARK_WIDTH (auto-derived) and re-render `site-src/assets/cli-splash.png` with `freeze --background "#080b12"` so the docs preview stays in sync. The version is intentionally absent from `renderSplash` and `renderHeader` — restoring it would regress the docs-PNG-staleness fix; version belongs to `renderVersionMarquee` and `renderBrandStrip` only.

## src/cli/workflows-validator.js:1

- Role: Orchestration — top-level workflows.jsonl validator. Loads `.claude/workflows.jsonl`, parses each line, runs Article IV invariants I1..I11 via `workflows-validator-invariants.js`. Returns `{ ok, tracks | errors }`. Consumed by `triage/seed-tasklist.mjs` (validate + materialize modes), `audit-baseline/audit.mjs` (post-§18 hook), `commands/init-project-doctor.md`.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/workflows-validator-predicates.js:1`, `.claude/schemas/workflow-track.v1.json`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## src/cli/workflows-validator-invariants.js:1

- Role: Domain — Article IV invariants I1..I11. Each `check*` returns `[{invariant, track_id, node_id, message}, ...]`; empty = holds. I1 unique track_ids; I2 selectable→entry node; I3 skill XOR sub_track (selector exempt with non-empty alternates); I4 depends_on/blocks resolve; I5 DAG; I6 commit tracks include `/grant-commit` before commit; I7 needs_user→consent command; I8 every skill/sub_track/command resolves on disk; I9 can_parallel siblings share blockedBy; I10 selector alternates share downstream contract; I11 predicates use v1 vocabulary.
- Companion: `src/cli/workflows-validator.js:1`, `src/cli/workflows-validator-predicates.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## src/cli/workflows-validator-predicates.js:1

- Role: Foundation — closed v1 predicate vocabulary for Track/selector preconditions. Five predicates: `requires_git` (work-tree), `requires_user_override` (force-flag), `requires_min_components` (spec count ≥ N), `requires_phase_completed`, `requires_skill_present`. Each `evaluate<Name>(arg, ctx)` returns boolean; caller passes `ctx = {workflow, project, slug}`. Adding a predicate: implement here, add to `KNOWN_PREDICATES`, update I11, note in seed.md §18.4.
- Companion: `src/cli/workflows-validator-invariants.js:1`, `src/cli/track-tasklist-materializer.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## src/cli/workflow-migrator.js:1

- Role: Foundation — one-shot in-place migrator for pre-§18 `workflow.json` (`entry_phase`, no `track_id`) → post-§18 shape. Derives `track_id` via `ENTRY_PHASE_TO_TRACK_ID` (intake→intake-full, spec→spec-entry, tdd→tdd-quickfix, chore→chore), remaps `completed[]` to node-ids, inits `skipped_alternates: []`, removes `entry_phase`. Idempotent. Unmapped `entry_phase` throws. Invoked by `harness/SKILL.md` preflight Step 3a. Reverse-map mirrored in `track_guard.sh` + `lib/resume_writer.py` for both-shape runtime acceptance.
- Companion: `.claude/skills/harness/SKILL.md`, `.claude/hooks/track_guard.sh:1`, `.claude/hooks/lib/resume_writer.py:1`, `tests/workflow-migrator.test.mjs`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: non-atomic write — backlog `workflow-migrator-write-not-atomic-power-loss-corruption-3e91`.

## src/cli/track-tasklist-materializer.js:1

- Role: Foundation — Track → canonical TaskList JSON (subjects, activeForms, metadata.phase, needs_user, blockedBy ordinals). Selector nodes via `evaluateAlternates(node, ctx)` (filter by `preconditions[]`; first qualifying alternate wins). Sub-tracks via `expandSubTrack` (inline nodes; propagate parent `depends_on` to entry nodes so the chain links cleanly). Used by `triage/seed-tasklist.mjs` and `tests/track-tasklist-materializer.test.mjs` against golden fixtures (byte-equivalent migration coverage).
- Companion: `.claude/skills/triage/seed-tasklist.mjs`, `tests/fixtures/golden-tasklists/*.golden.json`, `src/cli/workflows-validator-predicates.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## src/.claude/workflows.template.jsonl:1

- Role: Pristine `.claude/workflows.jsonl` shipped by the baseline. Six lines: four selectable tracks (`intake-full`, `spec-entry`, `tdd-quickfix`, `chore`) + two sub-tracks (`swarm-implementation`, `tdd-worker-chain`). Each line conforms to `.claude/schemas/workflow-track.v1.json`. Byte-equivalent to pre-§18 hardcoded triage templates per spec AC-016 (`tests/byte-equivalent-migration.test.mjs`). Copied to `<target>/.claude/workflows.jsonl` by `build-template.sh` Stage 2 and CLI install. NEVER_TOUCH at upgrade time.
- Companion: `.claude/workflows.jsonl`, `src/cli/install.js:79`, `scripts/build-manifest.mjs`, `.claude/schemas/workflow-track.v1.json`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/skills/triage/seed-tasklist.mjs:1

- Role: Foundation helper for `triage` (post-§18). Node ESM CLI; two modes — `--validate-only` (validate via `workflows-validator.js`; non-zero on first invariant violation) and `<track_id> <slug>` (materialize via `track-tasklist-materializer.js`; print TaskList JSON for triage's `TaskCreate` loop). Slug regex `^[a-z0-9][a-z0-9-]{0,63}$` (backlog `triage-helper-slug-interpolation-into-bash-subprocess-a720`).
- Companion: `.claude/skills/triage/SKILL.md:1`, `src/cli/workflows-validator.js:1`, `src/cli/track-tasklist-materializer.js:1`.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/skills/upgrade-project/marker.mjs:1

- Role: Foundation — **shipped** CLI helper for `/upgrade-project`'s marker write. Subcommand `record <target> <rel> <baseline_version> <template_sha>` writes `<target>/.claude/.baseline-reconciliations.json` atomically (write-then-rename via `randomUUID` tmpfile). Stdlib only (`node:fs/promises`, `node:path`, `node:crypto`). Exit codes: 0 success, 1 on filesystem error (stderr names `cannot write .claude/.baseline-reconciliations.json: <reason>`), 2 on bad args (stderr names `usage:` line + first missing field or unknown subcommand).
- Companion: byte-parity peer of `src/cli/reconciliation-marker.js → recordReconciliation` (test `test_when_helper_and_lib_invoked_with_same_args_then_produce_byte_equal_markers_modulo_timestamp` enforces drift detection). Invoked from `.claude/skills/upgrade-project/SKILL.md:1` Procedure step 5. Tests at `tests/upgrade-project-marker.test.mjs` (8 scenarios: empty target, append, replace, byte parity, missing args, unknown subcommand, readonly target, sequential records).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: This file exists because the CLI's `src/cli/reconciliation-marker.js` does NOT ship to consumer installs (the npm package's `src/` is for the CLI process itself, not the target's `.claude/`). The v0.8.1 SKILL.md invoked `node -e "import('./src/cli/reconciliation-marker.js')..."` which hit ERR_MODULE_NOT_FOUND on every consumer `/upgrade-project` run. Spec `docs/specs/marker-helper-shipped-instead-of-dev-import.md` (approved 2026-05-26) chose the self-contained shipped-helper pattern over alternatives (build-time symlink, npx-invoked subcommand, inlined `node -e` shell string). Keep marker shape changes synchronized with `src/cli/reconciliation-marker.js`.

## .claude/skills/spec-shippability-review/analyzer.mjs:1

- Role: Domain — shared shippability checks for C1 (`DEV_TREE_RUNTIME_REF`) + C3 (`UNSHIPPED_MODULE_IMPORT`). Pure functions, no I/O. Exports: `collectShellFences(text)` → `[{startLine, body}]` (handles BOTH column-0 tagged fences AND indented bash/sh/shell fences — the latter is the typical SKILL.md numbered-list shape that the original column-0-only regex missed), `runDevTreeAndUnshippedChecks(fences, manifest, sourcePath)` → `findings[]` (combined C1+C3 walk; dedupes per `line:refPath`). Static patterns `RUNTIME_INVOCATION_PATTERNS` (import/require, node/python/bash invocation, bare `./dev-prefix/` reference).
- Companion: consumed by `.claude/skills/spec-shippability-review/check.mjs:1` (per-spec drafts) AND `.claude/skills/spec-shippability-review/scan-shipped-skills.mjs:1` (aggregate shipped-SKILL.md scan). C2 (`DEV_HELPER_EXTENSION`) stays in check.mjs because it scans write_set lines, not shell fences. Tests indirectly via consumer tests at `tests/spec-shippability-review.test.mjs` (6 fixtures preserved byte-equal after refactor → AC-007 satisfied) and `tests/shipped-skill-md-shippability.test.mjs`. Extracted per spec `docs/specs/marker-helper-shipped-instead-of-dev-import.md` (approved 2026-05-26).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: This skill is dev-only (no `owner: baseline` frontmatter on the parent SKILL.md → pruned by build-template.sh Stage 1.5). The analyzer.mjs file lives inside that dev-only skill dir and is itself never shipped to consumers — it runs at spec-draft time AND build time only, both in the dev tree.

## .claude/skills/spec-shippability-review/scan-shipped-skills.mjs:1

- Role: Orchestration — aggregate scanner for shipped SKILL.md prose. CLI: `[--root <skills-dir>] [--report-root <project-root>] [--manifest <path> | --shipped-tree <dir>]`. Walks `<root>/<slug>/SKILL.md` (immediate children only, NOT recursive into `*/tests/fixtures/...`), extracts shell fences via analyzer.mjs's `collectShellFences`, runs `runDevTreeAndUnshippedChecks` per file, aggregates findings into `<report-root>/.claude/state/spec-shippability/shipped-skills.json`. Exit 0 CLEAN / 1 NEEDS_REVIEW / 2 BLOCKED / 3 missing root. The `--shipped-tree <dir>` mode (Stage 1.6 usage) derives the shipped-files set from a directory walk instead of reading manifest.json — sidesteps the chicken-egg dependency on build-template.sh Stage 3 (manifest is stamped AFTER Stage 1.6).
- Companion: wired into `scripts/build-template.sh` Stage 1.6 (between Stage 1.5 prune and Stage 2 overlay; build aborts on exit 2/3). Tests at `tests/shipped-skill-md-shippability.test.mjs` (5 scenarios incl. clean tree, planted dev-tree ref, planted unshipped import, missing root, whole-file regression on `upgrade-project/SKILL.md`) and `tests/build-shipped-skills-gate.test.mjs` (3 scenarios incl. structural ordering + behavioral planted-blocker). Spec: `docs/specs/marker-helper-shipped-instead-of-dev-import.md` AC-004 / AC-005 / AC-006.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: The aggregate report at `.claude/state/spec-shippability/shipped-skills.json` uses `slug: "shipped-skills"` as a sentinel key, distinct from per-spec reports at `.claude/state/spec-shippability/<slug>.json`. `spec_approval_guard.sh` reads per-slug paths only and is unaffected (AC-007). Symlink behavior: `readdir(..., { withFileTypes: true })` reports symlinks via `isSymbolicLink()` and `isDirectory()`/`isFile()` reflect the symlink itself (not target), so symlinked dirs are skipped by recursion and symlinked files are skipped by the `isFile()` check in `findSkillMds`. Don't change to follow-links without an explicit `lstat` guard.

## .claude/hooks/lib/memory_stop.mjs:1

- Role: Stop-event transcript walker — invoked by `.claude/hooks/memory_stop.mjs` (the hook). Walks the per-turn JSONL transcript, extracts three candidate kinds (Edit/Write/MultiEdit → `landmark` candidates with path-touch + suggested-role bullet; `context7` MCP queries → `library` candidates; user/assistant text-block intent phrasings → `backlog` candidates with role-tagged provenance + verbatim + slug+4char-sha256 stable key + active-workflow context), and appends `## CANDIDATE:` blocks to `.claude/memory/_pending.md`. Exports `runMemoryStop({ transcript, pending, projectRoot })`. Pure passive collector — never writes to canonical memory files.
- Companion: `.claude/hooks/lib/resume_writer.mjs:1` (text-block walker the intent extraction mirrors), `.claude/memory/backlog.md:1` (canonical destination after `/memory-flush` promotion), `.claude/skills/memory-flush/SKILL.md:1` (curator that drains `_pending.md`), `tests/memory-stop-recall.test.mjs:1` (recall + ReDoS-guard tests for the marker path).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: TWO intent-match channels. (1) `INTENT_TRIGGERS` — line-start-anchored, role-scoped, precision-tuned (CLAUDE.md X.1); mid-sentence anchored triggers MUST NOT emit. (2) `BACKLOG_MARKER_RE` / `BACKLOG_MARKER_BODY` — UNANCHORED explicit backlog-routing markers ("add to/for/into (the) backlog", "backlog this/it/that", "for the backlog", "(in/for) (the) next session", "in a later/future session") that fire anywhere in a line for BOTH roles (added 2026-06-01 to fix recall miss on `(add to backlog)`-style phrasings). `matchesIntent` ORs the two. `normalizeIntent` strips marker phrases (+ wrapping parens/"too"/punctuation) via `MARKER_STRIP_GLOBAL` so the slug is the payload, NOT the marker; the stored verbatim keeps the full line. ReDoS guard: `normalizeIntent` caps its working string to `MAX_INTENT_TEXT_LEN` (240) before the global strip — without it a crafted ~10KB marker-matching line backtracked 12s+ (CWE-1333, security report archived 2026-06-01). Adding a trigger/marker requires re-running the byte-parity fixture + `tests/memory-stop-recall.test.mjs`. Noise filters must mirror `resume_writer.mjs`.

## .claude/hooks/lib/memory_session_start.mjs:1

- Role: SessionStart memory-index builder — invoked by `.claude/hooks/memory_session_start.mjs` (the hook). Reads the seven canonical memory files, counts entries + stale entries (verified-at ≥ 30 commits behind HEAD in git, last-touched ≥ 30 days in non-git), counts pending candidates in `_pending.md`, scans `.claude/state/upgrade/*/manifest.json` for entries with `status: PENDING`, composes the additionalContext JSON envelope including index table, top-5 stale-entries block, pending-flush nag (debt-mode only when no active workflow), pending-stage nag, and resume-snapshot injection from `_resume.md` when fresh. Exports `buildIndex({ memDir, projectRoot, sessionSource })`.
- Companion: `.claude/hooks/memory_session_start.mjs` (the hook that invokes this), `.claude/skills/memory-flush/sweep.mjs:1` (Step 0c stale-sweep re-derives the same predicate), `.claude/hooks/lib/resume_writer.mjs:1` (writes the `_resume.md` this builder injects).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: ported byte-for-byte from `lib/memory_session_start.py` (2026-05-27 perf pass). Stale predicate duplicated with `sweep.mjs` Step 0c — keep in lockstep. Total context capped at ~10KB.

## .claude/hooks/lib/resume_writer.mjs:1

- Role: Continuity-snapshot writer — composes `.claude/memory/_resume.md` from the per-turn transcript JSONL + `.claude/state/workflow.json` + harness logs. Walks the transcript for last-K user prompts, last-K file writes, last-K Skill invocations, last-K Bash commands; merges with workflow state (slug, entry phase, last completed, next phase due); writes a markdown snapshot consumed by the next SessionStart's memory-index injection. Shared by `memory_pre_compact.mjs` (PreCompact event) and `memory_stop.mjs` (Stop event). Exports `composeSnapshot(...)` (pure) and `writeSnapshot(...)` (file I/O).
- Companion: `.claude/hooks/lib/memory_session_start.mjs:1` (consumes the snapshot at session start), `.claude/hooks/lib/memory_stop.mjs:1` (its intent-extractor mirrors the same text-block walk + noise filters).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: ported byte-for-byte from `lib/resume_writer.py` (2026-05-27 perf pass). Best-effort: every failure path returns null silently.

## src/cli/project-json-merge.js:1

- Role: structural 3-way JSON merge for `.claude/project.json` on upgrade — promoted from NEVER_TOUCH to SPECIAL_MERGE tier during the 2026-05-27 perf pass. For each leaf field K, if local equals base (user never customized) → take incoming; else keep local. Nested objects recurse; arrays treated atomically. New fields in incoming added; user-removed fields stay removed; user-added fields preserved. Exports pure `structuralMerge3Way(base, incoming, local)` plus file I/O wrappers `computeMergedProjectJson({...})` and `mergeProjectJsonFile({...})`. BASE recovery via `src/cli/upgrade-tiers.js → resolveBase`; falls back to LOCAL preservation (NEVER_TOUCH semantics) when BASE unavailable.
- Companion: `src/cli/merge.js` → `applyProjectJsonMerge` (the SPECIAL_MERGE registry handler that calls this module), `src/cli/mcp.js` (sibling registry handler for `.mcp.json`), `src/cli/install.js → SPECIAL_MERGE` + `scripts/build-manifest.mjs → SPECIAL_MERGE_PATHS` (kept in sync via `tests/never-touch-sync.test.mjs`).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: arrays are atomic. Future refinement: set-union for known list-shaped fields. Unit-tested in `tests/project-json-merge.test.mjs` (15 scenarios).

## .claude/hooks/destructive_cmd_guard.mjs:1

- Role: PreToolUse(Bash) guard. Two tiers from `project.json → destructive.{hard_block_patterns, ask_patterns}` (regex over the whole command; `mode: ask|block`): hard-block catastrophic ops (rm -rf /, fork bomb, dd of=/dev/sd, mkfs, shutdown), ask on risky ones (rm -rf, git reset --hard, git clean -f, drop table, npm publish…). PLUS a **Bash consent-write block** (added 2026-05-31, Finding B): denies any Bash command writing a consent path under `.claude/state/` (`commit_consent`, `push_consent`, `.*_grant` markers, `spec_approvals/**`, `swarm_approvals/**`) via redirect (`>`/`>>`/`>|`), write-verb (tee/cp/mv/install/dd/ln), `sed -i`, or a program write (JS `writeFileSync`… or python/ruby/perl `open(...,'w')`). Closes the gap that the four approval guards only match Write/Edit/MultiEdit — a Bash-written token bypassed them. PLUS a sibling **epic-approval-write block** (`lib/common.mjs → writesEpicApproval`, added 2026-06-21, backlog `-abad`): denies any Bash command that sets `approved: true` on a path under `.claude/state/epic/`, parity with the consent block — content-scoped so children/status/timestamp writes and reads pass; closes the same-class bypass of `epic_approval_guard` (which only matches Write/Edit/MultiEdit).
- Verified-at: HEAD
- Last-touched: 2026-06-21
- Caveat: best-effort defense-in-depth behind the Write-matcher approval guards (the primary structural control). `$VAR`-indirected paths are now handled (expansion before scan). Residual: the epic block misses a `cd`/`pushd`-into-`.claude/state/epic` write with a generic filename (the discriminator is the directory, not a self-identifying basename) — tracked in backlog; durable fix is read-side approval derivation in `track_guard`.

## .claude/hooks/lib/thread_store.mjs:1

- Role: Foundation helper for the durable local conversation-thread trail (`.claude/memory/_thread.md`, Article IX clause 8). Reads/writes shelved-thread sections; entry JSON is **base64-encoded** inside an HTML-comment data block so verbatim cues round-trip even when they contain the `-->` close delimiter (a security MEDIUM fixed during the feature). Exports include `readMostRecentMarkdown({memDir})` used by `memory_session_start` to inject only the most-recent section at SessionStart. **Bounded** (2026-06-01): `appendEntry` calls `pruneTrail` after each shelve, evicting oldest sections so at most `THREAD_MAX_SECTIONS` (default 20) remain. `pruneTrail` parses sections via the base64 data block (`parseSections`) — NOT the `## SHELVED` heading, which a multi-line verbatim cue can spoof (a security MEDIUM: phantom-heading wrongful eviction, fixed in this change) — and rebuilds the trail under an atomic temp+rename so survivors stay byte-identical.
- Companion: `.claude/hooks/lib/shelve_detect.mjs`, `shelve_capture.mjs`, `resume_transform.mjs` (the shelve/resume pipeline); folded detector in `memory_stop.mjs`. Tests: `tests/thread-trail-rolloff.test.mjs` (cap + phantom-heading guard), `tests/thread-shelving.test.mjs`.
- Caveat: `readMostRecentMarkdown` still slices on the `## SHELVED` heading and would mis-slice if the newest section's cue contains a phantom heading line — read-only, no data loss; the authoritative resume path (`readMostRecent`/`parseSections`) is unaffected. Flagged for future hardening (security report archived 2026-06-01).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/hooks/lib/resume_transform.mjs:1

- Role: transforms a shelved thread's verbatim cues into a surfaced resume summary, run inline in main context (keeps judgment in main context per Article II) and TTL-cached. Part of the conversation-thread-shelving pipeline ([[thread_store.mjs]]).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/skills/whatsnew/SKILL.md:1

- Role: On-demand "what's new" generator (NOT a workflow phase; replaced the former Phase 11.5 `changelog` skill). Main context writes keepachangelog-style entries; the generator emits a structured fragment to `.claude/state/whatsnew/<slug>.json` (gitignored, transient). Optional `project.json -> whatsnew.route_workflow` names a per-project routing workflow that consumes the fragment. Never writes `CHANGELOG.md` (owned solely by `@semantic-release/changelog` at release time).
- Companion: `.claude/skills/whatsnew/fragment-writer.mjs:1`, `.claude/skills/whatsnew/route-resolver.mjs:1`, `.claude/skills/whatsnew/whatsnew.mjs:1` (entrypoint), `.claude/skills/whatsnew/classifier.mjs:1` (now only the KEEPACHANGELOG_SECTIONS constant). Category: `generators` (the 13th SKILL_CATEGORIES bucket; phases dropped 11->10).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23
- Caveat: the skill dir was `git mv`d from `changelog`; the manifest owners.skills key is `whatsnew`. CHANGELOG.md is no longer touched by any skill. The bootstrapping commit that introduced this (slug changelog-generator-routing) self-excepted its own `changelog` workflow node.

## .claude/skills/whatsnew/fragment-writer.mjs:1

- Role: Foundation. Exports `writeFragment({repoRoot, slug, entries, now})` -> writes `.claude/state/whatsnew/<slug>.json` as `{slug, generated_at, entries[{category,title,body,highlight?}]}` (NO version field). Validates non-empty entries, each with category (in KEEPACHANGELOG_SECTIONS) + title + body. `requireSafeSlug` rejects slugs not matching `^[a-z0-9][a-z0-9-]*$` (path-traversal guard, CWE-22). Never touches CHANGELOG.md.
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/skills/whatsnew/route-resolver.mjs:1

- Role: Foundation. Exports `resolveRouteWorkflow(project)` -> `project.whatsnew?.route_workflow ?? null`; throws naming `whatsnew.route_workflow` on a non-string non-null value. Only resolves/returns the name; does NOT invoke it (a future routing-workflow consumer must allow-list the value before any dispatch).
- Verified-at: 8e6f904
- Last-touched: 2026-06-23

## .claude/skills/memory-flush/route.mjs:1

- Role: Foundation — pure deterministic route classifier for `/memory-flush` (Tier 3, shipped in `memory-capture-tier2-tier3`). Exports `suggestRoutes(candidates)` returning one `{key, suggested_bucket, weight, evidence}` per pending candidate. `classify` is first-match-wins over four anchored regexes in priority order: PATH_RE → `landmark`, trailing `?` → `open-question`, FUTURE_RE (`TODO|backlog|follow-up|later|next we|defer`) → `backlog`, DECISION_RE (`decided to|the plan/approach/fix is|going to|chose|will use`) → `decision`, else `backlog`. `salience` returns 0.1 for chatter/short (<25 chars, no cue), 0.5 for backlog, 0.7 otherwise. PURE: no filesystem/network/model call. Per Article IX.3 the output only SUGGESTS an accept/override default — promotion to canonical stays human-only at `/memory-flush` Step 2.
- Companion: `.claude/skills/memory-flush/SKILL.md:1` (Step 2 optional route-suggestion aid), `.claude/hooks/lib/memory_stop.mjs:1` (writes the capture-time `route`/`weight` hints this refines), `tests/memory-flush-routing.test.mjs:1`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09

## .claude/skills/code-browser/SKILL.md:1

- Role: The navigation skill, rewritten (`code-browser-primary-navigation`, 2026-06-04) so the language-agnostic **universal walk** (entry → imports → IO boundary) is the PRIMARY, framework-independent path and the JS/TS `walk.mjs`/`discover.mjs` are an OPTIONAL accelerator (not a precondition). The frontmatter `description:` is the auto-invoke trigger — now language-agnostic (frontend or backend) and names the `Explore` agent alongside grep. Grep carve-outs preserved: pure full-text search + direct type/util definition lookups stay grep's domain (not navigation). Bound by CLAUDE.md Article X.5.
- Companion: CLAUDE.md Article X.5 (the binding rule), `docs/init/seed.md §4.3` + `.claude/CONSTITUTION.md` Appendix B (deframed narration + mirrors), `.claude/skills/code-browser/walk.mjs` + `discover.mjs` (the optional JS/TS accelerator — UNCHANGED, byte-identical), `.claude/skills/scout/SKILL.md:28` (sole workflow invocation site), `tests/code-browser-primary-navigation.test.mjs`. Decision: `decisions.md → navigation-routing-code-browser-primary-2026-06-04`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- caveat: Per-language fast-path adapters (Python/Go/Rust) are DEFERRED — `walk.mjs` resolves only `.ts/.js/.tsx/.jsx`, not `.mjs`, so on non-JS/TS repos code-browser uses the manual universal walk. "Primary" is doctrine (binding prose), not a structural hook; no test gates the model's actual tool choice.

## scripts/build-lock-dir.mjs:1

- Role: Foundation helper that derives the build-mutex lock dir for `scripts/build-template.sh`. Takes `argv[2]` = build target dir, prints `${TMPDIR:-/tmp}/create-baseline-build.<sha256(target)[:16]>.lock.d`. Keying the mkdir-mutex on the TARGET (instead of the prior single global `create-baseline-build.lock.d`) lets isolated tmpdir builds (`tests/helpers/clone-and-build.mjs`) run concurrently while same-target builds (npm pack prepack + a live-tree build) still serialize, so the original `obj/template` rebuild race stays fixed. Measured: 3 concurrent isolated builds ~2s per-target vs ~8s global.
- Companion: `scripts/build-template.sh:29` (the LOCK_DIR call site), `tests/build-lock-dir.test.mjs` (4 property tests: distinct→distinct, same→stable, under-TMPDIR/.lock.d, live-target-stable), `docs/testing.md` ("The build lock is keyed per target"). Cross-ref landmine `live-objtemplate-rebuild-races-parallel-test-readers`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09

## .claude/hooks/lib/closure-check.mjs

- Path: `.claude/hooks/lib/closure-check.mjs`
- Role: Foundation module — pure backlog-closure stamp reader + staged-tree obligation evaluator. Exports `unsatisfiedKeys(backlogText, keys)` and `evaluateClosure({stagedPaths, readStaged})`; no git, no I/O (callers inject staged content). Single source of truth (spec D3) imported by BOTH `git_commit_guard.mjs` (the atomic-closure hard-block leg) and `.claude/skills/commit/closure-precommit-check.mjs` (the `/commit` SOP preflight + `Closes <key>` reconciliation).
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- caveat: MUST stay shipped in `obj/template/.claude/manifest.json` — if dropped, `git_commit_guard`'s import crashes and the guard fails OPEN (consent bypass). Defended by `audit-baseline` + `tests/closure-amendment-governance.test.mjs`. See landmine `guard-new-lib-dep-breaks-sandbox-copy-tests`. Behavior documented in seed.md §4.1 + CLAUDE.md Art VIII + annex; RCA `docs/rca/2026-06-06-backlog-closure-stamp-stranded-post-commit.md`.

## .claude/hooks/lib/timing.mjs

- Path: `.claude/hooks/lib/timing.mjs`
- Role: Foundation module for per-phase workflow timing + token capture (velocity Lever 0). Pure functions over `.claude/state/`: `stampFromWorkflow({rootDir, now})` appends `{phase,event:"completed",ts}` JSONL lines to `.claude/state/timing/<slug>.jsonl` for every phase newly present in `workflow.json → completed[]`, ALSO diffs `workflow.json → tdd_ticks[]` into `{phase:"tdd:<tick>",event:"sub"}` rows (sub-tick stamping, `tdd-subtick-stamping`), and captures cumulative output/input/cache-read tokens from the session transcript anchored on a `run-start` baseline (entries timestamped at/before `workflow.created_at`) (`phase-token-instrumentation`). Idempotent; `{appended:[]}` on absent/malformed workflow.json, never throws. `renderTable({rootDir, slug})` joins stamps + consent-token mtimes + token deltas into a markdown table with Model(ms)/Human-wait(ms) AND per-phase output/input/cache-read token columns; `tdd:<tick>` sub-rows nest under the `tdd` rollup (Option A; sum-of-subs == rollup), gated by `project.json → artifacts.subtick_timing.enabled`. Gate phases excluded as rows; approve-spec wait folds into first post-spec phase; negatives clamp to 0; missing → `n/a`. CLI: `node .claude/hooks/lib/timing.mjs render <slug> [bundleDir]` writes `timing.md`.
- Companion: `.claude/hooks/phase_timer.mjs` (the hook that calls `stampFromWorkflow`, incl. its Bash leg), `.claude/skills/archive/SKILL.md` Step 2 (invokes the render CLI before `archive.sh` moves the approval token), `.claude/skills/tdd/SKILL.md` + `harness/SKILL.md` (worker ticks append to `tdd_ticks[]`).
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- caveat: human-wait derives from consent-token mtimes, so it resolves only once the token exists; a hook shipped mid-run backfills pre-existing `completed[]` phases at one timestamp (no retroactive per-phase split). The `/archive` render must run BEFORE `archive.sh` or the moved `spec_approvals/<slug>.approval` makes approve-spec read `n/a`. Token deltas only fire when phase-state writes go through tracked tools (Write/Edit) OR Bash (via phase_timer's Bash leg) — a pure-fs write that bypasses both captures no timing.

## .claude/hooks/phase_timer.mjs

- Path: `.claude/hooks/phase_timer.mjs`
- Role: PostToolUse observe-only hook (the 25th hook) with two legs. Write|Edit|MultiEdit leg: no-ops unless `basename(tool_input.file_path) === 'workflow.json'`, then calls `stampFromWorkflow`. **Bash leg** (`phase-timer-bash-trigger`): on `tool_name === 'Bash'` it skips the basename check and unconditionally calls the idempotent `stampFromWorkflow`, so Bash-driven `workflow.json` mutations (the manual-harness `>`/node-fs/jq path) also stamp — closing the gap where Write-only matching silently lost timing for human/Bash-driven runs. Try/catch swallowed; never blocks (PostToolUse has no deny path), never mutates the edited file. Wired in `settings.json` + `src/settings.template.json` (a Write/Edit/MultiEdit matcher AND a Bash matcher) beside `lint_runner`/`test_runner`.
- Companion: `.claude/hooks/lib/timing.mjs` (logic), `docs/init/seed.md §4.1` + `CLAUDE.md` Article VIII (governance rows).
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- caveat: fires on EVERY Write/Edit/MultiEdit AND every Bash call in the repo; the basename guard (Write leg) and idempotent `stampFromWorkflow` (both legs) keep the no-op cheap. Covers manual/Bash-driven phase runs too, not just `/harness`.

## .claude/skills/audit-baseline/expected-baseline.mjs

- Path: `.claude/skills/audit-baseline/expected-baseline.mjs`
- Role: SINGLE SOURCE OF TRUTH for the baseline's declared rosters. Exports `EXPECTED_HOOKS`, `EXPECTED_AGENTS`, `EXPECTED_COMMANDS`, `EXPECTED_MEMORY_FILES`, `CANONICAL_MEMORY_FILES` (the non-`_` subset), `EXPECTED_MCP_SERVERS`, `EXPECTED_TRACKS`. `audit.mjs` imports the name rosters (extracted out of it); six governance tests import them so a count assertion is `<roster>.size`, never a literal. Adding a hook/command/agent/mcp-server is a ONE-LINE roster edit that re-aligns audit + the whole suite. Skills count stays sourced from `derive-counts.mjs → SKILL_CATEGORIES` (sum); disk counts come from `deriveCounts()`.
- Companion: `.claude/skills/audit-baseline/audit.mjs`, `.claude/skills/audit-baseline/derive-counts.mjs` (disk deriver), tests: `derive-counts`, `epic-close-governance`, `epic-approval-guard`, `git-topology-guard`, `gitignore-governance-cascade`, `whatsnew-counts`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- caveat: the roster is the *declaration*; `deriveCounts()` reads disk. Tests assert disk === roster (a real drift tripwire, not tautological). Prose count literals (CLAUDE.md/seed/README/CONSTITUTION) stay hand-maintained but are audit-checked against disk, so they track the roster transitively.

## .claude/skills/harness/checker-fanout.mjs

- Path: `.claude/skills/harness/checker-fanout.mjs`
- Role: The §II.A oracle-bound checker machinery (shipped `checker-graduation-fanout` 8f6cfda) + Lever-1 live runner (wired `checker-fanout-live-wiring` 01ce882). Exports `mergeVerdicts` (deterministic, order-independent verdict merge → `BLOCKED` if any `severity:'BLOCKER'`, else `CLEAN`), `assertFanoutAllowed` (the clause-6 gate: mechanical SCRIPT fan-out always allowed since scripts aren't subagents, `mode:'agents'` LLM-agent fan-out throws until the clause-7 amendment lands), and the live `runCheckerFanout({slug,rootDir,enabled,checkers,registry,readFile})` — fail-OPEN (`enabled:false` → `{skipped:true}`, caller falls back to per-skill review) and fail-SAFE (a checker whose input is absent contributes an empty verdict, never throws). **Extension point: `DEFAULT_CHECKER_REGISTRY`** (`name → adapter(ctx) → {findings}`; ships `spec-diagram` + `spec-traceability` + `spec-rollout` — the `-419d` rollout-enforceability oracle, wired into the registry at line 41 / imported line 12 in `0fa7cfa`; `spec-lint`/`spec-shippability` adapters still deferred to backlog `-d186` — add further oracle-bound checkers HERE). CLI `node checker-fanout.mjs run <slug>` reads the `velocity.checker_fanout` flag from project.json, runs the fan-out, prints JSON, exits 0 CLEAN/skipped / 2 BLOCKED. Wired into `harness/SKILL.md` at the spec-review boundary (after `spec`, before `approve-spec`); surfaces BLOCKERs before the gate, never auto-approves. Goes live the first spec-track workflow after 01ce882 (tdd/chore introducing runs have no spec phase).
- Companion: the three oracle-bound spec-review helpers `.claude/skills/spec-diagram-review/oracle.mjs` (DFS-acyclicity BLOCKER + advisory class↔DDL/AC↔seq relief-valves; exports `normalizeFinding`), `.claude/skills/spec-traceability-review/oracle.mjs` (dropped-upstream-AC BLOCKER; imports `normalizeFinding` + `resolveCheckerThreshold` from `hooks/lib/tier-dial.mjs`), and `.claude/skills/spec-rollout-enforceability-review/oracle.mjs` (`runRolloutOracle` — every structured Rollout prerequisite must bind to an enforcement-type AC via `enforced-by:`; missing/dangling → BLOCKER, free-prose prerequisite → ADVISORY) — all BLOCK only with a concrete ArtifactRef AND `mandatory` tier, else ADVISORY (proof-obligation contract). The bounded round-trip trio: `harness/maker-checker.mjs` (`assertBounded` — exactly 1 maker/1 checker), `harness/evidence-ledger.mjs` (append-only governed-round-trip ledger), `harness/graduation-gate.mjs` (fail-CLOSED counts-only clause-7 evaluator: ≥3 round-trips ∧ 0 false-positive blocks ∧ security-clean). Tests: `tests/checker-fanout.test.mjs`, `checker-oracle-diagram.test.mjs`, `checker-oracle-traceability.test.mjs`, `maker-checker-roundtrip.test.mjs`, `evidence-ledger.test.mjs`, `graduation-gate.test.mjs`.
- Verified-at: 0fa7cfa
- Last-touched: 2026-06-22
- caveat: `graduation-gate` fails CLOSED (opposite of `rightsize-gate`'s fail-OPEN) — a malformed/missing ledger yields `pass:false` so the Article II amendment can never ride on bad evidence. The clause-6 → clause-7 lift was granted for the oracle-bound READ-ONLY checker class ONLY (backlog `-9360`); multi-maker / judgment-checker fan-out each needs its own per-class graduation.

## durable-plan-state-subsystem-424f

- Path: `.claude/skills/harness/plan-store.mjs` (+ `plan-frame.mjs`, `plan-diff.mjs`, `replan.mjs`, `plan-wiring.mjs`)
- Role: v1 piece 6 (`-424f`, shipped 2026-06-22) — the durable, append-only, versioned plan object at `.claude/state/plan/<slug>.json` (orchestration spine for spec→approve→plan→execute, vision §1.2). `plan-store` exports `createPlan`/`readPlan`/`recordRevision` (append-only `versions[]`, never in-place mutation)/`getVersion`/`validatePlan` (pure `{ok,errors}`)/`mergeInput` (per-node `{id,mandatory,verdict,findings}` = the `integrate` merge-oracle input) plus the append-only `artifacts.{round_trips,verdicts}` channel (`appendRoundTripArtifact`/`setVerdictArtifact`). `_rootDir` is in-memory persist plumbing — stripped from the serialized JSON, reinjected by `readPlan`. `plan-frame.readFrame(plan,nodeId)` is the η lever (a worker reads only its node frame + deps' results, never `versions[]`/siblings; frame bytes < plan bytes). `plan-diff.diffVersions(plan,a,b)` is the pure visible replan diff `{goal_changed,added,removed,changed}`. `replan.applyReplan(plan,change,meta)` is the RECORD-only primitive (validates+applies+`recordRevision`; throws on invalid and records nothing; does NOT decide *when* to replan — that is `-4c43`). `plan-wiring.mjs` (`isPlanWiringEnabled`/`ensurePlanAtPlanMode`/`recordPhaseTransition`) wires it into the harness loop as **additive Tier-2 state** behind `velocity.durable_plan.enabled` (fail-open). The two prior consumers migrated additively (signatures + on-disk projections preserved): `evidence-ledger.recordRoundTripOnPlan`, `checker-fanout.mirrorVerdictToPlan`.
- Tests: `tests/plan-store.test.mjs`, `plan-frame.test.mjs`, `plan-diff.test.mjs`, `replan.test.mjs`, `plan-harness-wiring.test.mjs`, `evidence-ledger-migration.test.mjs`, `checker-fanout-migration.test.mjs`.
- Verified-at: 765d100
- Last-touched: 2026-06-22
- caveat: Built via a 7-task SHARED-mode swarm — worktree mode was tried first and abandoned: Agent worktrees fork from the stale 0.19.0 release commit (17 behind HEAD) and `swarm_merge` applies to the working tree, so cross-wave dependency propagation breaks (everything imports `plan-store`). The two consumer migrations (T-005/T-006) + harness wiring (T-007) were done in main context, not boundary-only workers, because the plan↔consumer seam is a design decision (Article II). Wiring is additive Tier-2 (Decision D1: no Article II/IV amendment). Next consumer: `-4c43` layers the decide-when-to-replan RALPH loop on `applyReplan`. Goes live the first workflow after commit (introduction pattern).

## .claude/skills/org-dispatch/org-mode.mjs

- Role: org-team (Article X) decision helpers — `isOrgModeEnabled(project)`, `orgDispatchGate({project,isGitRepo})` (refuses unless org_mode on AND git), `toLaneTasks(lanes)` (claim-any lane-tagged tasks), `classifyFork({scope})` → 'decide' for in-lane-impl else 'escalate'.
- Graduated from the retired sprint-dispatch's sprint-mode.mjs. Skill dir `.claude/skills/org-dispatch/` (SKILL.md + org-mode.mjs + peer-select.mjs + yield-arbiter.mjs) is the Phase-6 engine of the selectable `org` track.
- Verified-at: 6abf123
- Last-touched: 2026-06-23

## .claude/hooks/branch_guard.mjs:1

- Role: hook #26 (added 2026-07-03, erp-portables slice B). PreToolUse(Edit|Write|MultiEdit) guard blocking CREATION of `.claude/state/workflow.json` when `project.json → git.workflow_model` is `github-flow` and the current branch matches `git.release_branches` — so a workflow cannot start on `main` under PR-to-main discipline (Art. IV work-start + Art. VII topology). Early-warning at work-start only; `git_commit_guard` is the enforcing backstop at commit time (and catches Bash-driven writes this hook does not see). Composes the topology primitives single-sourced in `lib/common.mjs` (`resolveWorkflowModel` / `matchAnyGlob` / `isPrimaryWorkTree` / `currentBranch`) so the creation-gate cannot drift from the commit-gate. Fail-open on anything ambiguous: not-a-creation (file exists), configured:false, non-github-flow model, linked worktree, non-git, detached HEAD, or any read error — never bricks editing. Tests: `tests/branch-guard.test.mjs`.
- Verified-at: cb390e5
- Last-touched: 2026-07-04

## .claude/hooks/lib/consent-decision.mjs

- Role: Foundation — the commit-consent decision, split out of the hooks so it is import-safe (no `main()`) and unit-testable. Four exports: `parseCommitConsentToken(text)` (accepts both on-disk token shapes — slug-mode `line1=slug, line2=epoch`, and epoch-only `line1=epoch` for ad-hoc/legacy tokens), `decideCommitConsent({token, workflow, now, ttl})`, `buildGrantCommitMarkerLines(slug, now, note)`, `resolveWorkflow(rootDir)`. Resolves three workflow states: **absent** (no `.claude/state/workflow.json`) → classic 900s time-window fallback; **present+slug** → slug-scoped match, so ONE `/grant-commit` authorizes every commit in that workflow's landing and only that workflow; **present+broken** (unreadable / unparseable / no slug) → fail closed.
- Companion: `.claude/hooks/git_commit_guard.mjs` + `.claude/hooks/consent_gate_grant.mjs` (the two importers — the guard reads the decision, the UserPromptSubmit hook writes the marker outside Claude's tool boundary), `.claude/hooks/lib/common.mjs` (`canonicalSlug`). Tests: `tests/consent-decision.test.mjs`, `tests/branch-aware-git-policy.test.mjs`, `tests/git-topology-guard.test.mjs`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- Caveat: generalizes the ERP's ADR-0033, which bound consent to the workflow slug and **failed closed when no workflow was present**. That only stays usable when feature branches are left unprotected, so the slug check never fires on ad-hoc commits; on a project protecting every branch it forbids every ad-hoc commit. The absent→time-window fallback is the fix — do not restore fail-closed-on-absent. Empty slug (`''`) can never satisfy a slug match; `decideCommitConsent` guards it explicitly.

## .claude/skills/power/SKILL.md

- Role: the `power` batch-sprint track (defined in `.claude/workflows.jsonl`), landed `e90bfdc`. Delivers a sprint of related, spec-committed tickets in ONE cycle, reusing the standard phase skills. Hosts exactly the two behaviours that make it a *batch* pipeline: (1) **per-ticket iteration** — `security` runs once PER TICKET over `workflow.json → tickets[]` while the mechanical phases run once for the batch; (2) **commit split** — at the commit phase, group the batch's tree into ordered Conventional Commits via `commit-split.mjs`, closure last. Invoked from within a `power`-track workflow, never standalone.
- Companion: `.claude/skills/power/commit-split.mjs` (the split actuator), `.claude/skills/sprint-planner/SKILL.md` (proposes the ticket set the track consumes), `.claude/workflows.jsonl` (track DAG). Opt-in via `project.json → velocity.power_mode.enabled`; requires git.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09

## .claude/skills/power/commit-split.mjs

- Role: Foundation — plans an ordered series of Conventional Commits from a dirty working tree for the power track's amortized commit phase. Single export `planCommits(entries)` over the dirty-tree array `[{path, status}]`. Composes `.claude/skills/commit-planner/inventory.mjs → groupDirtyTree` for single-concern grouping (**reuse, not reimplement**) and adds only the power-specific concern: ordering. `TYPE_MAP` ranks groupDirtyTree's `{chore, src, test, docs}` types as build/config(0) → implementation(1) → tests(2) → docs(3), mapping `src` to a mechanical `feat` placeholder that main context refines to feat/fix at commit time.
- Companion: `.claude/skills/commit-planner/inventory.mjs` (the grouping it composes on), `.claude/hooks/git_commit_guard.mjs` (the closure-atomicity guard it must satisfy). Tests: `.claude/skills/power/tests/commit-split.test.mjs`.
- Verified-at: 0e5cc8f
- Last-touched: 2026-07-09
- Caveat: `isClosurePath` forces `workflow.json` + `backlog.md` onto the FINAL commit. This is not cosmetic — `git_commit_guard` hard-blocks a closing commit whose staged `backlog.md` lacks the `source_backlog_keys` closure stamp, so a closure split across commits is rejected. Keep closure last.

## .claude/skills/harness/notify.mjs

- Role: Foundation — the CO-D yield notifier. Pings the human when the harness needs attention. Pure decision core (`shouldNotify(state, config)`, `composeNotification`, `chooseDispatch`, `bundleIdFor`) separated from the `deliver`/`probeAvail` edge. Delivery is OS-agnostic and degrades through a probed chain: macOS `terminal-notifier` (clickable — `-activate <bundle-id>` resolved from `$TERM_PROGRAM`) → the platform native notifier (`osascript` / `notify-send` / PowerShell balloon) → a universal terminal fallback (BEL + one-line stderr banner). Stdlib only (U6); never throws, always exits 0, so it can never stall the harness loop.
- Companion: `.claude/skills/harness/SKILL.md` (invokes it via Bash immediately after the `yielded` write, step 91), `tests/harness-notify.test.mjs`. Gated by `project.json → velocity.notifier.enabled` (default on; set false to silence in CI). Baseline-owned and manifest-hashed.
- Verified-at: 7dba960
- Last-touched: 2026-07-10
- Caveat: THREE invocation modes (CLI `argv[0]`). **emit-mode** (`emit --slug`, harness-invoked at a `yielded` write) pings on attention-needed only — `shouldNotify` false for any `state` other than `"yielded"`; NOT presence-gated (rare high-value yield always pings). **stop-mode** (`stop`, 3rd `Stop` hook command since notifier-on-stop) honours `velocity.notifier.on_stop` (`yielded`|`idle`|`always`; default `yielded`, template `idle`): `idle` = inverse of `harness_continuation`'s re-fire (silent when `stop_hook_active`, `state:"continue"`+marker, or already `yielded`; pings on `done`/missing/continue-without-marker). **attention-mode** (`attention`, since notifier-attention-and-presence) fires when the session blocks on the human — wired on the `Notification` event (`permission_prompt`+`idle_prompt` matchers) AND a `PreToolUse` match on `AskUserQuestion` (which does NOT fire `Notification` — confirmed Claude Code gap, so the PreToolUse seam is required); body from `payload.message` or `tool_input.questions[0].header`; gated by `velocity.notifier.attention` (default true). **Presence gate** (`velocity.notifier.presence` `always`|`aware`, default+template `always`, this repo `aware`): stop+attention pings suppressed ONLY when `presenceSuppresses` proves watching — frontmost app == `bundleIdFor($TERM_PROGRAM)` AND HID idle ≤ `present_idle_seconds` (default 60); fail-open on any unknown (probe fail, non-darwin, no `$TERM_PROGRAM`). macOS probe `probePresence` shells to `ioreg`+`lsappinfo`. Exports: `stopModeShouldNotify`/`resolveOnStop`/`composeStopNotification`/`emitStop` (on-stop), `resolvePresence`/`resolvePresentIdleSeconds`/`resolveAttention`/`presenceSuppresses`/`composeAttentionNotification`/`probePresence`/`emitAttention` (attention+presence). `notify.mjs` lives under `.claude/skills/`, not `.claude/hooks/`, so ALL wiring (Stop, Notification, PreToolUse) adds no hook and no count cascade (`derive-counts.mjs:114` counts `.claude/hooks/*.mjs`); the audit's settings-wiring check is one-directional so extra non-hook commands pass.

## .claude/hooks/lib/spec-content-hash.mjs

- Role: Foundation — content-addressed identity for an approved spec, so gate A detects a post-approval amendment even for an untracked (first-time) spec whose git SHA is `N/A`. Single concern: `computeSpecContentHash(bytes)` → sha256 hex over a string or Buffer, throwing on any other type so a caller never silently hashes a coerced value. Pure and stdlib-only (`node:crypto`), so it runs identically in the `/approve-spec` command SOP and in the harness resume path.
- Companion: `.claude/commands/approve-spec.md` (records the hash in the approval token), `.claude/skills/harness/SKILL.md` (recomputes on resume; mismatch → re-yield at gate A), `tests/spec-content-hash.test.mjs`, `tests/gate-a-content-reyield.test.mjs`.
- Verified-at: 212dbd0
- Last-touched: 2026-07-10
