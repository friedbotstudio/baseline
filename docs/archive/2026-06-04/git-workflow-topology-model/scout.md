# Codebase Scout Report — git-workflow-topology-model

Scope from `docs/intake/git-workflow-topology-model.md`: declare (`project.json`), detect (`/init-project`), and **hard-enforce** (extend `git_commit_guard`) a git branching-topology model, with a swarm-worktree carve-out and an Article VII precedence amendment. Hook count must stay 22.

## Primary touchpoints

- `.claude/hooks/git_commit_guard.mjs` — **the enforcement seam** (235 lines). Key spots:
  - `handleBash(cmd)` :147 — the only place a `git commit` is intercepted. Flow: `gitSegments` → `FORBIDDEN_RE` :159 → `isCommit/isPush` :164 → `isInsideWorkTree()` gate :169 → `branchPolicy()` :174 → detached check :175 → `patternViolation` :180 → protected/consent :185-196. **Topology check inserts for `isCommit` after the detached check (:178), before/beside the patternViolation check.**
  - `branchPolicy()` :90 — returns `{protected, patternViolation, detached, branch, notGit}` via `projectGet('.git.protected_branches')` :96 and `projectGet('.git.branch_pattern')` :107. Topology can extend this return or live in a parallel `topologyPolicy()`.
  - `currentBranch()` :71 — `git rev-parse --abbrev-ref HEAD` (returns `"HEAD"` when detached, `null` when not git).
  - `isInsideWorkTree()` :80 — `git rev-parse --is-inside-work-tree`.
  - **No primary-vs-linked-worktree detection exists yet** — the carve-out needs a new helper (see Constraints).
- `.claude/hooks/lib/common.mjs` — shared helpers. Exports used by the guard: `projectGet` :82, `matchAnyGlob` :472, `gitSubcommandInvoked` :463, `gitSegments` :453, `emitBlock` :87 / `emitAllow` :113, `STATE_DIR` :19, `CLAUDE_PROJECT_ROOT` :16, consent-marker consts :28-35. **New shared topology helpers (e.g. branch-set resolution, worktree detection) belong here — `lib/` is NOT counted toward the 22-hook total.**
- `.claude/project.json` → `git` block — currently `{protected_branches: null, branch_pattern: null}`. Add `workflow_model`.
- `src/project.template.json` → `git` block — identical shape; **must change in lockstep** (the install/template mirror).
- `docs/init/seed.md` — Article VII git rules region (~:480-560), the `git_commit_guard` row in the §4.1 hook table :148, and §16 project-config (:584). The Article VII precedence clause + `workflow_model` schema doc land here. §4.1 header literally says "22 total" (:138) — do not perturb.
- `CLAUDE.md` Article VII (:153 in the mirror numbering) **and** `src/CLAUDE.template.md` — **byte-equal mirror**; the new precedence clause goes in both identically.
- `.claude/commands/init-project.md` — detection seam. Step 3 survey (:32 already probes `git rev-parse --is-inside-work-tree`), Step 4 recommender emits `project_json`, Step 5 `AskUserQuestion` confirm (:94), Step 6 writes `project.json` + appends §16 addendum. `workflow_model` detection slots into Step 3 (survey CI trigger / `gh api` branch protection / history shape) + the Step 5 proposal.
- `.claude/skills/commit/SKILL.md` — Step 6/7 (:16-21) do not currently make a topology decision; SOP needs the `ask`-model branch-yield behavior.

## Entry points that reach this code

- `PreToolUse(Bash)` on any `git commit` / `git push` → `git_commit_guard.mjs handleBash` (the topology block fires here).
- `PreToolUse(Write|Edit|MultiEdit)` → `handleWrite` (consent-marker gating; **not** touched by topology).
- `/init-project` (command) → detection + `project.json` write.
- `/commit` (Phase 11 skill) and `/harness` commit phase → the SOP-level branch decision.
- `/swarm-dispatch` → `swarm_merge.mjs` lands changes via **`git apply` of the worktree diff onto main**, not a `git commit` inside the worktree (see Risks).

## Existing tests

- `tests/branch-aware-git-policy.test.mjs` — drives `git_commit_guard` with payloads across protected/unprotected branches + consent. **The model for new topology tests.** — passing.
- `tests/git-commit-guard-tokenize.test.mjs` — `gitSegments`/`gitSubcommandInvoked` tokenization (false-positive avoidance). — passing.
- `tests/guard-commit-msg-falsepos.test.mjs` — commit-message false-positive guard. — passing.
- `tests/destructive-guard-residuals.test.mjs` — forbidden-flag residuals. — passing.
- `.claude/skills/audit-baseline/tests/` — audit assertions (hook count, names, prose counts).
- Helpers: `tests/helpers/clone-and-build.mjs` (isolated-tmpdir build pattern), `tests/helpers/memory-fixtures.mjs`.

## Constraints and co-changes

- **Hook count is derived, not declared.** `derive-counts.mjs:109` counts top-level `.mjs` files in `.claude/hooks/` (non-recursive — `lib/` excluded). `audit.mjs` `checkCount` :232 compares seed §4.1 vs disk; `checkNames` :254 matches `EXPECTED_HOOKS` vs seed names; prose-count scanners :717-728 match "N hooks" phrasing. **→ Adding any top-level `.claude/hooks/*.mjs` breaks the count. Topology logic MUST live inside `git_commit_guard.mjs` and/or `lib/common.mjs`.**
- **Worktree carve-out needs a new detection primitive.** A linked (dispatch) worktree differs from the primary tree by `git rev-parse --git-dir` ≠ `git rev-parse --git-common-dir`. The guard must topology-enforce only when those are equal (primary tree). This is the research/spec call.
- **Lockstep mirrors:** `project.json`↔`src/project.template.json`; `CLAUDE.md`↔`src/CLAUDE.template.md` (byte-equal — audit verifies); seed §4.1 row + Article VII region.
- **Detection is best-effort:** `gh` needs auth+network; ambiguity/unreachable → `ask`. Lives in the `/init-project` Step 3/Step 5 flow.
- **Shipped-helper rule:** any new helper is `.sh`/`.mjs`/`.js` (no Python), imports must be in `obj/template/.claude/manifest.json` (spec-shippability-review enforces).

## Patterns in use here

The guard is a single ESM module: pure `projectGet`-driven policy functions returning plain objects, then a linear `handleBash` that calls `emitBlock`/`emitAllow` (which `process.exit`). Block messages are imperative and name the remediation command. Tests feed a JSON payload on stdin and assert the emitted decision. New topology code should follow this shape: a `topologyPolicy(branch, model, isPrimaryTree)` pure function + one block branch in `handleBash`, with messages mirroring the existing detached/pattern wording.

## Risks / landmines

- **Swarm dispatch does not `git commit` in worktrees** — `swarm_merge.mjs` applies the working-tree *diff* via `git apply` to the primary tree. So the topology guard would rarely fire mid-dispatch; the real commit is the single Phase-11 `/commit` on the primary tree. The carve-out is therefore mostly *defensive* (a worker that does commit must not be topology-blocked), but it is still load-bearing for correctness and must be tested (intake AC-6).
- **Intake AC-10 conflates citations.** The audit's "Article XI citation" / "seed §17 citation" checks are about *skill provenance* (Article XI / §17) — unrelated to this feature. The real audit obligations here are: hook count stays 22, prose "N hooks" claims stay consistent, and the new Article VII clause is present in the seed + CLAUDE.md + mirror. **The spec should restate AC-10 against the correct audit checks.**
- **`ask` is block-vs-yield split.** Under `ask`, the guard must *pass* (no topology block); the *SOP* (`commit`/`harness`) asks the user. Conflating these into a guard-level prompt would be wrong — the guard cannot prompt. Keep the two mechanisms separate (intake AC-4).
- **Open question for the release-branch set (direct-to-main):** semantic-release here publishes on **both** `main` and `next`, so the permitted-branch set under `direct-to-main` may need to be a list, not a single default branch. Carried from intake Open questions; settle at gate A.
- **Composition with consent must not regress** existing `branch-aware-git-policy.test.mjs` — topology PASS must not short-circuit the consent/pattern checks (intake AC-7).
