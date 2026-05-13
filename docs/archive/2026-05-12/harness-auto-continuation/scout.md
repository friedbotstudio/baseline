# Codebase Scout Report — harness-auto-continuation

Phase 2 scout for the harness auto-continuation refactor (intake at `docs/intake/harness-auto-continuation.md`, Q-003 root cause). Maps the files, hook infrastructure, audit-baseline contract, and test surface the work touches or constrains.

## Primary touchpoints

**Harness skill (frontmatter flip + SOP rewrite + state-file writes):**
- `.claude/skills/harness/SKILL.md:1` — frontmatter currently carries `disable-model-invocation: true` (line 4); SOP body declares "User-invokable only" (line 10). Both lines change.
- `.claude/skills/harness/SKILL.md:24` — "Task discipline (the running checklist)" section. The auto-continuation handshake needs a new sub-step that writes `.claude/state/harness_state` before the turn-ending message of every tick.

**New Stop hook:**
- `.claude/hooks/harness_continuation.sh` (new file) — Stop-event hook, sources `lib/common.sh`, reads `.claude/state/harness_state`, validates "last assistant turn invoked `Skill(harness)`" via the transcript_path, decides whether to emit additionalContext re-firing harness.
- `.claude/settings.json:hooks.Stop` — current Stop wiring lists only `memory_stop.sh`. New hook appends after `memory_stop.sh` (order matters: memory extraction first, continuation decision after, since the continuation decision should fire after memory_stop's transcript walk is complete and no longer holds the file).

**Verify inlining (workers that currently nest `Skill(verify)`):**
- `.claude/skills/integrate/SKILL.md:13` — Step 2 currently `Invoke verify`; becomes inlined Bash + statefile write.
- `.claude/skills/simplify/SKILL.md:51` — Step 5 `Invoke Skill(verify) to re-stamp`; same inlining.
- `.claude/skills/chore/SKILL.md:78` — Step 4 `Invoke Skill(verify) — mandatory`; same.
- `.claude/skills/tdd/SKILL.md:62` — Step 6 `Invoke verify`; becomes a hoisted-into-harness phase tick under option α (see TDD decomposition below).
- `.claude/skills/verify/SKILL.md:1` — becomes a contract-only doc describing the `last_test_result` format (4-line shape). Still listed in EXPECTED_SKILLS for audit-baseline; description rewritten.

**TDD decomposition (option α):**
- `.claude/skills/tdd/SKILL.md:43` Step 3 `Invoke scenario`, `:58` Step 5 `Invoke implement`, `:62` Step 6 `Invoke verify`, `:66` Step 7 `Invoke design-ui per Design-calls row`. Under α: `/tdd` writes its recipe + contract + design-calls rows to a state file (`.claude/state/tdd/<slug>.json`) and returns. Harness's next ticks invoke `scenario`, `implement`, `verify`, and `design-ui` as separate task entries.

**Constitutional / governance updates:**
- `CLAUDE.md:Article V` (lines ~95–130 in the live file, harness-orchestration section) — wording change from "user-only" to "auto-continued by Stop hook between non-gated phases."
- `CLAUDE.md:Article VIII` — hook table grows by one row (`harness_continuation` / Stop / Art. V).
- `docs/init/seed.md:139` `### §4.1 Hooks (21 total — ...)` — header count bumps to 22; new row added to the table with the same Article mapping; the lifecycle-hooks count parenthetical updates (3 → 4 lifecycle hooks).
- `README.md:14` — "21 baseline hooks — 17 write/run-boundary guards plus 3 lifecycle hooks plus 1 input-boundary hook" → "22 baseline hooks — 17 + 4 + 1" (lifecycle bump).
- `README.md:308` — second occurrence of the same count in the layout-tree comment.

**Audit-baseline (count enforcement):**
- `.claude/skills/audit-baseline/audit.sh:23` `EXPECTED_HOOKS = {…}` — add `harness_continuation` to the set; bump the count in the section comment from `(3)` to `(4)` for "Lifecycle hooks for project memory + cross-session continuity."
- `.claude/skills/audit-baseline/audit.sh:WORDS` map — already supports up to "forty"; bumping "21 → 22" word forms is covered.

**State files (new, contract-only):**
- `.claude/state/harness_state` (new) — written by every harness tick before turn-ending. Proposed shape (research will finalize): `{state: "continue"|"yielded"|"done", reason: "<text>", written_at: <epoch>, slug: "<slug>"}`. Single-file, overwritten each tick.
- `.claude/state/tdd/<slug>.json` (new, conditional on α) — written by `/tdd`'s coordinator step, read by harness on the next tick. Carries `recipe`, `contract`, `design_calls_rows`.

## Entry points that reach this code

- **User invocations.** `/harness` (the slash command alias); `/integrate`, `/simplify`, `/chore`, `/tdd` direct invocations. After the refactor, `/harness` is also model-invokable, so the harness can re-enter itself.
- **Stop event.** Every assistant turn end. The new Stop hook fires here.
- **UserPromptSubmit event.** `consent_gate_grant.sh` already runs here; the new hook does NOT add wiring here (the gates stay structurally separate).
- **PreToolUse event.** `verify_pass_guard.sh`, `track_guard.sh` — unchanged but verify the inlined writers continue to satisfy them.
- **SessionStart event.** `memory_session_start.sh` injects the resume snapshot — unchanged; the harness continuation context arrives separately via the Stop hook on the prior turn.
- **Bash test command.** `bash .claude/skills/audit-baseline/audit.sh` — wired as `project.json → test.cmd`. Every `verify` call (now inlined) invokes this.

## Existing tests

- `tests/cli.test.mjs` — covers `bin/cli.js` argv routing and exit codes. Not directly affected, but the `--merge` mode in `src/cli/merge.js` does ship `.claude/skills/harness/` and `.claude/hooks/`; new hook adds a path the merge-conflict resolver may need to recognize. Worth a regression check.
- `tests/template-drift.test.mjs` — verifies `.claude/hooks/` and `.claude/skills/` shipped in the npm tarball match the live tree. Adding `harness_continuation.sh` must reflect in this expected set.
- `tests/manifest.test.mjs` — checks the shipped file manifest. Same lockstep requirement.
- `tests/install.test.mjs` — end-to-end install validation. Likely passes if manifest is current.
- `tests/tdd-step-6.test.mjs` — covers TDD Step 6 (the design-ui per-row invocation). Becomes the canonical regression test if `/tdd` decomposes; the test will need to be rewritten or kept as a smoke test for the post-decomposition behavior.
- `tests/spec-lint-design-calls.test.mjs` — tests the `## Design calls` parsing; unaffected unless the design-calls schema changes (no plan to change).
- `tests/render-swarm-worker.test.mjs` — covers `src/agents/swarm-worker.template.md` rendering. Unaffected (swarm worker is out of scope).
- `tests/build-audit-gate.test.mjs` — runs the audit script during npm pack; will fail until `EXPECTED_HOOKS` and the count constants are updated in the same change.
- `tests/build-template.test.mjs` — covers `scripts/build-template.sh`. The new hook script ships via rsync (no per-file overlay), so this should pass without code changes.

No skipped or `xfail` tests touch the relevant surface as of `last_test_result`'s most recent PASS (2026-05-12T06:36:24Z, audit run).

## Constraints and co-changes

- **`.claude/state/last_test_result` format is byte-identical-preserving.** Current content (4 lines):
  ```
  PASS
  2026-05-12T06:36:24Z
  bash .claude/skills/audit-baseline/audit.sh
  0
  ```
  `verify_pass_guard.sh` reads only line 1. The inlined writers in `integrate`, `simplify`, `chore`, and the hoisted-verify phase tick MUST emit this exact 4-line shape (verdict / ISO timestamp / exact command / exit code), with a single trailing newline. The `verify/SKILL.md` contract doc names this shape as the binding format.

- **`.claude/hooks/lib/common.sh` is the shared substrate.** Functions available: `read_payload`, `payload_get '.path'`, `project_get '.key'`, `emit_block`, `emit_ask`, `emit_allow`, `emit_info`, `log_line`, `path_matches_globs`, `cmd_matches_any`, `canonical_rel`, `canonical_slug`, `block_marker_self_write`, `validate_consent_marker`. The new Stop hook uses `read_payload`, `payload_get`, `log_line` at minimum. Dependencies: bash ≥ 4, python3, no jq.

- **Stop hook contract (from `memory_stop.sh`):** the payload includes `.transcript_path`, an absolute path to the session JSONL. Each line in that file is one event; assistant messages carry `message.content[].type == "tool_use"` with `name` and `input` fields. The new hook walks the transcript backward from EOF to find the most recent assistant message and inspects its tool_use blocks. This is the mechanism to detect "did Skill(harness) just run."

- **Hook ordering inside `Stop`.** `memory_stop.sh` does its transcript walk and writes `_pending.md` + `_resume.md`. The new `harness_continuation.sh` should run AFTER so it sees the final `_resume.md` shape (in case it ever needs to read it). Settings.json wiring appends the new hook to the existing Stop list.

- **`audit-baseline/audit.sh` counts.** `EXPECTED_HOOKS` is a Python set; adding `"harness_continuation"` is a one-line change. The audit script also enforces that section comments naming counts match — the "(3)" → "(4)" comment update is needed inside the same set definition.

- **`docs/init/seed.md §4.1` table.** Currently lists 21 rows. New row format must match: `| harness_continuation | Stop | <one-line behavior> |`. The section header `### §4.1 Hooks (21 total — 17 write/run-boundary guards + 3 lifecycle hooks + 1 input-boundary hook)` updates to `(22 total — 17 + 4 + 1)`.

- **`CLAUDE.md` Article VIII hook table.** Same row addition pattern. The Article currently lists 21 hooks; the new row maps to "Art. V" (harness orchestration).

- **`README.md` count references.** Two occurrences of "21 baseline hooks". Both update in lockstep.

- **`project.json` may grow a `harness.state_ttl_seconds` key** (research decides). The schema currently has top-level keys `test`, `lint`, `tdd`, `destructive`, `workflow`, `artifacts`, `consent`, `swarm`, `additions`. A new `harness` block would slot between `swarm` and `additions`.

- **Article IV consent gates are inviolate.** The new Stop hook MUST NOT write `.spec_approval_grant`, `.swarm_approval_grant`, or `.commit_consent_grant`. The hook's only writes are to `.claude/state/logs/` (log line) and stdout (additionalContext JSON). When `workflow.json → completed` indicates a consent gate is the next pending task, the hook reads `.claude/state/harness_state == "yielded"` and stays silent.

- **`track_guard.sh` phase ordering.** Currently enforces an 11-phase canonical order from `project.json → workflow.phases`. If `/tdd` decomposes into `scenario`/`implement`/`verify`/`design-ui` ticks visible in `workflow.json → completed`, the phase ordering needs to either (a) accept the new sub-phase names or (b) keep recording only `tdd` in completed (sub-phases are TaskList-only). Decision for spec.

- **`src/` template overlay.** Hooks and skills are NOT shipped via per-file `src/` overlays; they're shipped wholesale from `.claude/` via `scripts/build-template.sh` rsync. The four shipped overlays are `CLAUDE.template.md`, `seed.template.md`, `project.template.json`, `settings.template.json` — all four are touched by this refactor (settings adds the Stop hook wiring; the three docs reflect the count bumps and Article wording).

## Patterns in use here

- **Hook scripts are independent bash files.** Each `~80–200` lines, sources `lib/common.sh` first, reads JSON via `payload_get`, emits decisions via `emit_*` helpers. The new hook follows this exact shape. Reference implementation: `memory_stop.sh` for transcript walking, `consent_gate_grant.sh` for the "fast-path-then-parse" pattern, `verify_pass_guard.sh` for "advisory but binding" enforcement.

- **State files are flat JSON with a small fixed schema.** `workflow.json` (request, slug, entry_phase, exceptions, completed, created_at, updated_at) is the existing model. `harness_state` follows the same single-file, overwrite-each-write pattern.

- **Skill SOPs are markdown with numbered steps.** Each phase skill's body is `Prereq` + `Steps` + `Constraints`. The harness SOP follows the same convention with extra sections (`Preflight`, `Task discipline`, `Pillar 1–4`, `Integrate-failure decision tree`, `State machine`). Edits stay within these sections.

- **Article-prefixed enforcement.** Every behavioral rule maps to a CLAUDE.md Article. The new hook gets a mapping to Article V (harness orchestration) — same row format used for `memory_*` hooks (Art. III, IX).

- **`/triage` seeds the TaskList; `/harness` re-seeds if empty.** Both invocations use TaskCreate + TaskUpdate. The new "hoisted worker" tasks (if `/tdd` decomposes) are created mid-workflow by `/tdd`'s coordinator step, then consumed by harness ticks. This mirrors triage's pattern.

## Risks / landmines

- **Stop hook contract gaps.** The Claude Code Stop-hook decision protocol — whether returning `decision: "block"` re-opens the same turn, and whether `additionalContext` on stdout reliably injects into Claude's next turn — is not documented in this repo. Research phase must confirm against Claude Code's hook documentation (or via behavioral test) before the spec commits to a specific signaling mechanism. Q-003's intake OQ-1 names this as the primary research item.

- **Transcript walk performance.** `memory_stop.sh` already walks the full transcript on every turn. The new hook walks the same file again. For long sessions (the 2026-05-12 transcript is 15MB), back-to-back walks could add latency. Mitigation: read backward from EOF and stop at the first assistant message; the new hook only needs the most recent assistant turn's tool_use blocks.

- **`Skill(harness)` detection ambiguity.** If the user invokes another skill (e.g., `/intake` directly) and Claude legitimately exits without further work, the Stop hook must NOT mistake that for "harness should re-fire." The detection rule "last assistant tool_use was Skill(harness)" handles this — but a phase skill invoked from inside `/harness` (e.g., `/intake` running inside a harness tick) WILL show `Skill(intake)` as the last tool_use, not `Skill(harness)`. The hook needs a different detection: look for `Skill(harness)` anywhere in the LAST turn's tool_use blocks, OR check `.claude/state/harness_state.written_at` is recent. The recency check is simpler and more robust.

- **Harness re-fire loop risk.** If `harness_state` says `continue` but harness on the next tick decides to yield (e.g., user typed something between turns that doesn't match the expected resume pattern), harness must overwrite `harness_state` immediately on entry. Otherwise the Stop hook could keep re-firing indefinitely. Mitigation: harness writes `state: "yielded"` as its FIRST action on every yield path before its terminal message.

- **`/tdd` decomposition cascade.** Hoisting scenario/implement/verify/design-ui into harness ticks is the largest scope item. It changes `tdd-step-6.test.mjs`, possibly `track_guard.sh`'s acceptable phase names, and likely `project.json → workflow.phases`. Spec must lay out the decomposition contract precisely before implement runs.

- **Article IX vendored-skill calls remain in scope.** `prose → humanizer`, `design-ui → impeccable`, `scenario/implement → code-structure`. These nest `Skill(...)` and are NOT subject to the "skills independent, harness chains" rule (they're sub-skills used as helpers, not phase-chain links). The intake explicitly carves them out as out-of-scope. Implementation must preserve them untouched.

- **`commit/SKILL.md` is git-only and excepted here.** Not part of this scope but worth noting: the same harness auto-continuation mechanism will eventually need a git-aware variant; for non-git projects the workflow ends at `/archive`, so the Stop hook must read the workflow's exception list before deciding to continue past archive.

- **Eat-your-own-dogfood.** This refactor's own integrate-phase run will be the strongest test of the new mechanism. Plan: AC-001 + AC-009 evidence comes from observing this slug's workflow on the post-refactor harness.

- **Audit-baseline ordering during the refactor.** The audit script will fail intermediate states (new hook added but `EXPECTED_HOOKS` not yet updated; or vice versa). The implementation order matters: add hook script + update `EXPECTED_HOOKS` + update count comments + update seed.md/CLAUDE.md/README.md in the same commit boundary. The `chore` track is too narrow for this work; the spec-track gives us the structure to land it atomically.
