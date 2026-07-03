# Codebase Scout Report — erp-portables

Maps the baseline surfaces the ten port slices (A–J) touch. Reference implementation lives in `../erp` (read-only); this report covers **this repo only**.

## Primary touchpoints

### Constitution chain (slices A, D, E, F, G — every slice touches counts)
- `docs/init/seed.md` — genesis; amended FIRST per Art. I.4. Anchors: `§2.4` YAGNI (line 71), `§4.1` Hooks "25 total" (line 138), `§4.2` Subagents (line 176), `§4.3` Skills "46" (line 206), `§5` workflow (line 331), `§11` git rules (line 495), `§14` change control (line 593), `§18` tracks (below line 664).
- `src/seed.template.md` — 865-line template mirror of seed.md (not byte-equal by design; §16 is project-specific). Amendments must propagate.
- `CLAUDE.md` — 35,485 chars; **4,515 chars of headroom** under the 40k cap. Byte-equal with `src/CLAUDE.template.md` (verified). Articles II, IV, VI.4, VIII table, XI.
- `.claude/CONSTITUTION.md` — 252-line annex; new §5.x entries land here (decision economy categories, brainstorm caps, faithful-scope detail).

### Hooks (slices B, H)
- `.claude/hooks/` — exactly 25 `.mjs` hooks today. No `branch_guard.mjs` (slice B creates it).
- `.claude/hooks/lib/common.mjs` — has `matchAnyGlob` (line 473), `resolveWorkflowModel` (line 853), `isPrimaryWorkTree` (line 862). **Missing**: `currentBranch()`, `isProtectedBranch()`, `isAutonomousFeatureLanding()` (slices B, C add them).
- `.claude/hooks/lint_runner.mjs`, `.claude/hooks/test_runner.mjs` — **zero references to `file_globs`** — confirms the slice-H bug: they fire `lint.cmd`/`test.cmd` on any matching-event write regardless of `project.json → lint/test.file_globs`.
- `.claude/hooks/git_commit_guard.mjs` — untouched by the port (branch-aware consent already present); slice C composes around it, byte-unchanged (erp kept it identical).
- `.claude/settings.json` — hook wiring; `lint_runner`/`test_runner` at lines 51–52; slice B appends `branch_guard.mjs` to the `PreToolUse Write|Edit|MultiEdit` matcher (erp placed it after `track_guard`, before `artifact_template_guard`). `src/settings.template.json` mirrors.

### Roster/counts reconciliation (slice B ripples)
- `.claude/skills/audit-baseline/expected-baseline.mjs` — `EXPECTED_HOOKS` Set at line 13 (25 entries → 26).
- `.claude/skills/audit-baseline/audit.mjs` — count checks, CLAUDE.md 40k cap check, Article XII citations.
- `README.md`, docs site (`site-src/**`) — carry "25 hooks" counts; `audit-baseline-docsite-drift.test.mjs` enforces agreement.

### Track schema + triage (slices C, D)
- `.claude/schemas/workflow-track.v1.json` — has `preconditions[]` with a `$defs/Predicate` vocabulary at track and node level; **no node-level `condition` for consent gating yet**. Slice C adds `requires_commit_consent` to the predicate enum (erp ADR-0025: reuse the single predicate vocabulary; no new namespace).
- `.claude/workflows.jsonl` — 10 tracks; every commits-track declares `grant-commit` with `needs_user: true` and no condition (verified across all 10). Slice C annotates; slice D rebalances entry-point `selector_hints`/`description` (intake-full narrowed to novel surface, spec-entry broadened).
- `.claude/skills/triage/SKILL.md` + `flag-parser.mjs` — no novelty classification today; slice D adds Step 0 novelty (`pattern-copy`/`spec-derived`/`novel`/`ambiguous`), `track_reason`, explicit `skip_brainstorm` write.
- `.claude/skills/triage/track-tasklist-materializer.js` + `workflows-validator-predicates.js` / `-invariants.js` + `seed-tasklist.mjs` — materializer must resolve node conditions (I11 extension) and omit the grant-commit node when `requires_commit_consent` is false; I6 (static declaration) preserved.

### Brainstorm (slice E)
- `.claude/skills/brainstorm/SKILL.md` — Stage 1 gap analysis, Stage 2 probe loop.
- `probe-loop.mjs` — cap 5 → 2.
- `workflow-defaults.mjs` — `skip_brainstorm` read-time default `false` → flip per erp doctrine (absent → skip; triage writes the flag explicitly on every workflow).
- `skip-check.mjs`, `validate-call.mjs`, `discipline.mjs` — unchanged mechanics; timeout-adopts-recommendation is new behavior in SKILL.md prose + entry-skill contract.

### Harness + commit (slice C)
- `.claude/skills/harness/SKILL.md` — yield rule at `needs_user` tasks; slice C adds the no-yield carve-out when `isAutonomousFeatureLanding()` is true (erp: one-line carve-out + materializer omission does most of the work).
- `.claude/skills/commit/SKILL.md` — Step 7 gains push + `gh pr create` on autonomous landing (erp shape); `closure-precommit-check.mjs`/`epic_close.mjs` untouched.

### Spec review (slice G)
- `.claude/skills/spec-traceability-review/SKILL.md` + `oracle.mjs` — gains the deferral check: AC rows deferring spec-committed scope must carry a reason tag from `dependency|risk|cost|human-directed`; untagged/YAGNI-tagged → Critical BLOCKER. Oracle is one of the checker-fanout registry entries (`checker-fanout.mjs → DEFAULT_CHECKER_REGISTRY`), so the BLOCKER path already reaches gate A mechanically.
- `.claude/skills/scout/SKILL.md`, `.claude/skills/research/SKILL.md` — slice A amends both to delegate *gathering* to read-only advisory subagents (decisions stay in main context).

### New skills (slice I)
- `.claude/skills/` — no `commit-planner/` or `retrospective/` today. erp versions are `owner: user` and reference erp's standup/roadmap conventions; port generalizes them to `owner: baseline`. Overlap check needed against existing `commit` skill (staging step) and `standup`.

### CI/secrets posture (slice J)
- **No `.githooks/`, no `scripts/ci/` in this repo.** `.github/workflows/` has only `labels.yml` + `release.yml`. **Zero gitleaks references anywhere.** Slice J builds fresh: pre-commit gitleaks hard-fail (unit-testable check script), branch-protection config-as-code + applier, low-risk auto-merge classifier with the NEVER-list carve-out. erp's exact CI check contexts must be re-derived from this repo's actual workflows (release.yml checks).

### Build pipeline (all slices that ship)
- `scripts/build-template.sh` — builds `obj/template/` from `.claude/` + `src/` mirrors; Stage 0b syncs `src/cli/*.js` → skill mirrors (`workflow-migrator.js`, `track-tasklist-materializer.js`); re-hashes `obj/template/.claude/manifest.json`. Tests: `build-template*.test.mjs`, `build-shipped-skills-gate.test.mjs`, `build-audit-gate.test.mjs`.
- `src/cli/` — canonical sources for the materializer/migrator mirrors; slice C's materializer change lands in `src/cli/track-tasklist-materializer.js` first, then syncs.

## Entry points that reach this code

- **Hooks** fire on Claude Code events via `.claude/settings.json` (PreToolUse Write/Edit/MultiEdit for `branch_guard`; PostToolUse for runners).
- **Triage/brainstorm/harness/commit/scout/research/spec-traceability-review** are Skill-tool invocations inside the 11-phase workflow.
- **Materializer/validator** run via `node .claude/skills/triage/seed-tasklist.mjs` (triage Step 5 + harness re-seed).
- **audit-baseline** runs as `project.json → test.cmd` (`node .claude/skills/audit-baseline/audit.mjs --file={file}`) — every write triggers it via `test_runner`, and CI runs it full.
- **Slice J artifacts** hook into git (`.githooks/pre-commit` via `core.hooksPath`) and GitHub Actions.

## Existing tests

217 test files under `tests/`, node-native runner. Directly relevant:
- `branch-aware-git-policy.test.mjs` — existing branch/consent policy coverage (slice C extends).
- `brainstorm-*.test.mjs` (5 files: discipline, empty-request, fires-on-intake, invalid-calling-phase, iteration-cap) — slice E must update `fires-on-intake` (default flip) and `iteration-cap` (5→2).
- `checker-oracle-traceability.test.mjs`, `checker-fanout*.test.mjs` — slice G extends the traceability oracle.
- `audit-baseline-post-amendment.test.mjs`, `audit-skill-count-drift.test.mjs`, `audit-baseline-docsite-drift.test.mjs`, `appendix-a-mirror.test.mjs`, `article-iv-mirror.test.mjs` — count/mirror reconciliation gates for slices B, I.
- `build-template-mirror-sync.test.mjs`, `build-shipped-skills-gate.test.mjs` — shipping gates.
- erp has ready-made tests to adapt: `branch_guard` decide() test (+67 lines), `isAutonomousFeatureLanding` test (+51), `isProtectedBranch` test, materializer predicate tests, `require-gitleaks` test.

## Constraints and co-changes

- `CLAUDE.md` ↔ `src/CLAUDE.template.md` byte-equality — enforced; every constitution edit is a two-file lockstep write.
- Hook add ⇒ lockstep: seed §4.1 count + hook list, CLAUDE.md preamble/Art. III greeting/Art. VIII table, annex, `expected-baseline.mjs`, `settings.json` + `src/settings.template.json`, manifest re-hash, README/docs-site counts.
- Skill add (slice I) ⇒ lockstep: seed §4.3 count (46→48), CLAUDE.md Art. III greeting + Appendix quick-orientation counts, annex Appendix B, manifest `owners.skills` + hashes.
- Schema change (slice C) ⇒ `workflows-validator*` + materializer + its `src/cli/` canonical + Stage 0b sync + `workflows.jsonl` annotations must move together.
- `project.json → tdd.source_globs` includes `.claude/skills/**` and `.claude/hooks/**` ⇒ `tdd_order_guard` requires paired tests for new source files (branch_guard, new skills' helpers).
- Slice E default flip interacts with XI.3's "chore/freeform have no entry seam" — unchanged, but `withDefaults` consumers (`intake`/`spec`/`tdd` SKILL.md Step 0.5 wording) co-change.

## Patterns in use here

Hooks are single-file `.mjs` with a pure exported `decide()` and a thin stdin/stdout wrapper, composing shared primitives from `hooks/lib/common.mjs`; tests drive `decide()` directly. Constitution changes flow seed → CLAUDE.md+mirror → annex, with `audit-baseline` as the drift oracle. Skills keep judgment in SKILL.md prose and mechanics in small pure `.mjs` helpers invoked via `node -e import(...)`. Everything shipped is hashed into `obj/template/.claude/manifest.json` by `scripts/build-template.sh`.

## Risks / landmines

- `destructive_cmd_guard` blocks benign Bash whose *payload strings* contain consent-shaped phrases (hit during this workflow's brief write; known landmine `destructive-guard-blocks-benign-bash-containing-consent-redirect-shapes`). Slice work that scripts around consent text should stage payloads via the Write tool.
- CLAUDE.md headroom is 4.5k chars — the ten amendments fit only if detail goes to the annex (erp pattern; they ran to 39,982/40,000).
- The erp `branch_guard` counts "27 hooks" in one annex sentence (internal inconsistency in erp) — do not copy erp prose blindly; re-derive counts here.
- `workflow-defaults.mjs` default flip (slice E) changes read-time behavior for **legacy workflow.json files without the flag** — erp flips absent→skip; that inverts baseline semantics for in-flight workflows. Needs an explicit migration/compat call at `/spec`.
- Slice J has no existing surface in this repo (no .githooks, no scripts/ci) — greenfield; erp's version is wired to gradle/Temurin check contexts that must not leak in.
- `swarm.min_tasks_worth_swarming` 3→2 was in erp's scale-hardening commit but was NOT confirmed as part of this port's scope — leave at 3 unless the spec decides otherwise.
- seed.md and `src/seed.template.md` are NOT byte-equal (§16 project-specific) — amendments must be applied to both, hand-merged, not copied.
