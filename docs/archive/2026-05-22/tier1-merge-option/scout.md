# Codebase Scout Report — tier1-merge-option

Scope: replace tier-1 "Show diff" option with "Merge" (stages BASE-less via existing `.claude/state/upgrade/<ts>/` mechanism), add SessionStart filesystem-scan nag, extend `/upgrade-project` skill with a two-way (LOCAL-vs-INCOMING) reconciliation branch.

## Primary touchpoints

- `src/cli/tui/upgrade.js:29` — `CHOICE_OPTIONS` array literal. Currently 4 entries: `keep-mine` / `take-theirs` / `show-diff` / `abort`. Replace `show-diff` with a new `merge` value. Labels/hints are the user-visible strings.
- `src/cli/tui/upgrade.js:36` — `SHOW_DIFF_CONSECUTIVE_CAP = 2` plus the `consecutiveShowDiff` counter in `pickForFile()` (lines 133-149). Delete in the same patch — with Merge replacing Show diff, there is no looping option to cap.
- `src/cli/tui/upgrade.js:124-131` — `collectUserChoices`: walks `conflicts` array, calls `pickForFile`, stores `choices.set(rel, choice)`. The choice flows to `onSkipCustomized` (line 83) which is consumed by `threeWayMerge`'s `fallbackToBinaryPrompt` in `src/cli/merge.js:187`.
- `src/cli/tui/upgrade.js:151-156` — `renderConflictDiff` (the Show-diff path's only function). Delete; remove the `renderUnifiedDiff` import on line 19.
- `src/cli/merge.js:187` — `fallbackToBinaryPrompt`. Currently handles `'take-theirs'` (overwrite) and default-keep-mine. Needs a third branch for `'merge'`: write a BASE-less stage entry via `upgrade-tiers.writeStage` (or a new `writeStageBaseless` helper) and return `SEMANTIC_MERGE_STAGED` (or a new dedicated action kind) so the exit-code computation routes through `code 5` and the terminal report shows the existing "staged for /upgrade-project" label.
- `src/cli/merge.js:9-22` — `ACTION_KINDS` enum. Decision point: reuse `SEMANTIC_MERGE_STAGED` (one less action kind, terminal copy already says "staged for /upgrade-project") OR add a `BASELESS_MERGE_STAGED` for clarity. `/spec` decides.
- `src/cli/upgrade-tiers.js:88-95` — `writeStage(ctx, rel, baseBuf, incomingBuf, localBuf)`. Currently requires `baseBuf` (writes `<rel>.baseline-base`). Needs to either accept `baseBuf: null` or have a sibling `writeStageBaseless(ctx, rel, incomingBuf, localBuf)`. The stage manifest entry written at line 233-239 carries `base_sha256` as required string today — must change to nullable or carry a discriminator field.
- `src/cli/upgrade-tiers.js:228-241` — `appendToStageManifest` + `newStageManifest`. Adds `{rel, base_sha256, incoming_sha256, local_sha256, status}` to the manifest. Schema shape for BASE-less is the open question deferred to `/research`.
- `src/cli/upgrade-tiers.js:66-77` — `findPendingStage`. Returns `{stage_ts, files}` listing `status: PENDING` entries. Unchanged behavior; the SessionStart nag re-uses this exact function.
- `src/cli/upgrade-tiers.js:79-86` — `dispatchByTier`. Currently routes `BINARY_PROMPT → SKIP_CUSTOMIZED`. The new Merge path is reached **inside the binary-prompt fallback** (`merge.js:187`), not from `dispatchByTier`, because Merge is a user choice on a SKIP_CUSTOMIZED conflict — it doesn't go through tier classification.
- `src/cli/diff-render.js:1` — entire module. Only callers are `tui/upgrade.js:19` (Show-diff path) and its own test at `tests/diff-render.test.mjs`. Delete the module and test together with the Show-diff removal.
- `.claude/hooks/memory_session_start.sh:39-256` — the Python block emitted by the hook. After line 196 (where `pending` candidates nag is appended) is the natural spot for a new "pending upgrade stages" nag block. Budget: index portion is capped at 2048 bytes (line 201); the resume snapshot budgets to 9500 - len(index) - len(framing) - 80 (line 230). Adding ~150 bytes of pending-stage nag is well within budget.
- `bin/cli.js:36` — help-text line. Reads `customized files prompt "Keep your version / Use new baseline / Show diff" in TTY mode (exit 3 on any skipped)`. Update to `... / Use new baseline / Merge / Abort` and clarify that Merge triggers exit 5 (staged for `/upgrade-project`).
- `.claude/skills/upgrade-project/SKILL.md:42-46` — the Inputs section enumerates the three artifacts per entry (`<rel>.baseline-base` + `.baseline-incoming` + LOCAL). The BASE-less branch removes the `.baseline-base` artifact requirement. SKILL.md Procedure section (lines 47-58) needs a per-entry switch: three-way for tier-3 entries (BASE present), two-way for tier-1 Merge entries (BASE absent).

## Entry points that reach this code

- CLI top-level: `bin/cli.js → main → dispatchUpgrade (line 232) → tui.run (line 247)`. TTY path only.
- Non-TTY path: `bin/cli.js → runPlainUpgrade (line 255)`. Has no interactive prompt; the new Merge option is TTY-only by design (intake AC-006).
- `/upgrade-project` skill: invoked reactively by the user typing `/upgrade-project` after the CLI exits with code 5 OR after the SessionStart nag fires. Skill is at `.claude/skills/upgrade-project/SKILL.md`.
- SessionStart hook: registered in `.claude/settings.json:54` → `$CLAUDE_PROJECT_DIR/.claude/hooks/memory_session_start.sh`. Fires once per Claude Code session start.

## Existing tests

- `tests/upgrade.test.mjs:136-184` — three test cases pinned to the current "Show diff" labels and the cap-at-2 loop. These MUST change:
  - line 150-151 (`labels.includes('Show diff')`) → flip to `labels.includes('Merge')`, add a `!labels.includes('Show diff')` assertion;
  - the entire "Show-diff loop (AC-001)" describe block at line 159 (two test cases driving `['show-diff', ...]` answers) → replace with a "Merge pick (AC-002 new)" describe asserting that a `'merge'` answer creates a stage entry, the LOCAL file stays untouched, and the CLI exits with code 5.
- `tests/upgrade.test.mjs:210-233` — tier-3 SEMANTIC staging test (already covers the green-path stage creation). The new tier-1 Merge test can mirror this shape but with a BASE-less fixture.
- `tests/upgrade-tiers.test.mjs:177-210` — SEMANTIC dispatch tests assert `<rel>.baseline-base` + `<rel>.baseline-incoming` both exist. A new test case ("BASE-less stage") asserts that `<rel>.baseline-base` is absent (or the new discriminator is set) while `<rel>.baseline-incoming` is present.
- `tests/upgrade-project.test.mjs:51-73` — the contract-presence test enumerates required body phrases. New phrases (e.g. `BASE-less`, `two-way`) need to be added to the `required` array.
- `tests/diff-render.test.mjs` (entire file) — delete alongside `src/cli/diff-render.js`.
- `tests/upgrade-tiers.test.mjs:107-149` — `findPendingStage` coverage. Unchanged; the SessionStart nag reuses this function with no new branches needed.

## Constraints and co-changes

- **Stage manifest schema is consumed by both the CLI (write) and the `/upgrade-project` skill (read).** Any schema change must land in both places in the same patch.
- **Article XI manifest hash.** Editing `.claude/skills/upgrade-project/SKILL.md` bumps its sha256. The shipped manifest at `obj/template/.claude/manifest.json` must be regenerated via `scripts/build-manifest.mjs`; the audit at `.claude/skills/audit-baseline/audit.sh` enforces. See landmines.md `baseline-skill-edit-needs-manifest-rebuild` for the chicken-and-egg workaround.
- **CHANGELOG.md.** Phase 11.5 `/changelog` skill curates entries automatically from the diff + conventional type. Both the user-facing rename (`### Changed`) and the new staging behavior (`### Added`) need entries.
- **SessionStart hook output budget.** Index portion is capped at 2048 bytes; total `additionalContext` capped at ~9.5KB. Adding ~150 bytes of pending-stage nag is well within budget. No risk of budget overflow.
- **AC-007 idempotency.** A pending stage short-circuits subsequent CLI runs (`tui/upgrade.js:56` `findPendingStage` check). A user who Merges file X, exits, then re-runs upgrade gets the existing "pending stage" pointer and no new prompts — they must run `/upgrade-project` first. AC-005 of the intake (overwrite on re-Merge) means re-Merge can only happen AFTER the user reconciles or deletes the stage manually.
- **Article IV phase ordering.** This change is fully inside Phase 7+ (simplify-onward). All artifact writes routed by `track_guard`.
- **No new hooks.** The SessionStart nag attaches to the existing `memory_session_start.sh` — no new hook script, no new settings.json registration.

## Patterns in use here

- The TUI uses `@clack/prompts` for `select`/`intro`/`outro`/`log.info`/`log.warn`/`cancel`. Tests stub the entire `clackModule` via a `prompts` parameter on `run({prompts})`. The Merge code path lands inside `fallbackToBinaryPrompt` (a pure data-layer function), so the test stub stays at the same level — no new clack surface needed.
- Action-kind labels are centralized in `src/cli/merge.js → ACTION_LABELS` and consumed by both the TTY (`tui/upgrade.js`) and non-TTY (`bin/cli.js → runPlainUpgrade`) paths. Any new action kind needs an entry in both `ACTION_KINDS` and `ACTION_LABELS`; `ACTION_LABEL_WIDTH` is computed automatically.
- Stage-manifest writes are append-only within one run (`writeStage → appendToStageManifest`). `ctx.stageRunTs` is initialized lazily on first write and reused across the merge run, so all Merge picks in one CLI invocation land in one stage_ts dir.
- The `/upgrade-project` skill reads the stage manifest top-down and processes entries in declared order (SKILL.md line 50). The skill's per-file procedure has no per-tier discriminator today; the BASE-less branch is a new `if base_recoverable` switch at the top of the per-file loop.

## Risks / landmines

- **`renderUnifiedDiff` deletion is irreversible work.** `src/cli/diff-render.js` is small (54 LOC) but its test file is fairly thorough. If a future feature wants colorized diff again, it's a re-import. Recommendation: spec the removal explicitly (don't leave dead code per Art. VI.2).
- **Re-Merge overwrite semantics.** Intake AC-005 says re-Merge on the same file overwrites the existing stage entry. The current `appendToStageManifest` is append-only — it pushes a new entry every time. The Merge path must dedupe by `rel` (overwrite the existing entry's `<rel>.baseline-incoming` artifact and update the entry's `incoming_sha256`). Today's tier-3 SEMANTIC dispatch doesn't hit this case because BASE-recoverable entries get one entry per upgrade run; tier-1 Merge can be re-hit on subsequent runs because the stage short-circuit only fires when the stage has PENDING entries — which it will, blocking the re-Merge from re-entering the prompt at all under AC-007. **The re-Merge case only fires if the user reconciled the prior stage entry (status: RECONCILED), deleted the stage dir, then re-ran upgrade on a file that still has divergent local + new INCOMING.** Verify in `/spec` whether AC-005 is actually reachable or if it's a vestigial scenario from the intake — current AC-007 short-circuit may make it dead.
- **AC-006 `_pending.md` collision with `_pending` stage.** The SessionStart hook today emits a nag for `_pending.md` candidates (memory candidates). The new nag is for `.claude/state/upgrade/<ts>/manifest.json` pending stages. Two different "pending" concepts in the same hook — phrase the new nag to avoid confusion (e.g., "Pending upgrade stages: N file(s) staged for /upgrade-project").
- **Article XI manifest rebuild after editing SKILL.md.** Per landmines `baseline-skill-edit-needs-manifest-rebuild`, the `/simplify` phase (or a manual Stage 1-3 rebuild) must regenerate `obj/template/.claude/manifest.json` after touching `.claude/skills/upgrade-project/SKILL.md`. The audit Stage 0 gate is chicken-and-egg.
- **Phase 6 swarm-vs-solo threshold.** The /spec will declare 4-6 C4 Components (TUI prompt, merge fallback branch, upgrade-tiers BASE-less stage writer, /upgrade-project two-way branch, SessionStart hook nag block). `swarm.min_tasks_worth_swarming` (default 3) is met, but the components are tightly coupled through the stage-manifest schema — single-author solo TDD is the right call. The harness's swarm-vs-solo decision will likely pick swarm; user should override to solo at Phase 6 (per intake constraint that the change is single-author by surface area).
- **Path-traversal hardening in `/upgrade-project` (security AC-008).** Already in place: SKILL.md line 102 says reconciler validates `path.resolve(target, rel)` is under target. BASE-less branch must inherit this check verbatim — no new attack surface, but a new code branch is a new opportunity to forget. Note in `/spec` security section.
