# Pattern Research — git-workflow-topology-model

The design direction is converged (extend `git_commit_guard`, declare via `project.json`, amend Article VII). This memo lays out the genuine remaining choices as candidates per decision area (A–D), each with a recommendation. No third-party libraries are touched — the guard is pure Node ESM over the `git` CLI — so context7 was not applicable; the one load-bearing external behavior (git worktree plumbing) was verified empirically in this repo (git 2.50.1) rather than cited from memory.

---

## Decision A — Where topology enforcement logic lives

### Candidate A1: Inline policy function inside `git_commit_guard.mjs`
- **Summary**: Add a pure `topologyDecision({branch, model, isPrimaryTree, releaseBranches})` function in the guard module, called from `handleBash` for `isCommit` after the detached-HEAD check.
- **Fits**: Yes — mirrors the existing `branchPolicy()` :90 shape (pure fn returning a plain object, consumed by a linear `handleBash`). Scout "Patterns in use here".
- **Tests it enables**: Payload-driven guard tests exactly like `branch-aware-git-policy.test.mjs`; the pure fn is also unit-testable in isolation.
- **Tradeoffs**: Guard file grows ~40-60 lines. Acceptable — it stays one cohesive module and keeps the hook count at 22 (no new top-level `.mjs`).

### Candidate A2: Shared helper in `hooks/lib/common.mjs`
- **Summary**: Put `resolveWorkflowModel()`, `isPrimaryWorkTree()`, and `topologyDecision()` in `common.mjs`; the guard imports them.
- **Fits**: Partially — `common.mjs` already holds `projectGet`, `matchAnyGlob`, git tokenizers. `lib/` is not counted toward the 22 (verified: `derive-counts.mjs:109` is non-recursive). But topology policy is guard-specific, not cross-hook shared like `matchAnyGlob`.
- **Tests it enables**: Same as A1 plus direct unit tests on the helpers.
- **Tradeoffs**: Splits one feature's logic across two files for no reuse benefit (no other hook needs topology). Mild YAGNI violation.

### Candidate A3: New top-level hook — **REJECTED**
- Breaks the count: `derive-counts.mjs:109` counts top-level `.claude/hooks/*.mjs`; a 23rd file fails `audit.mjs checkCount` :232 and the intake's "hook count stays 22" constraint. Explicitly out per intake.

**A recommendation: A1**, with the *single genuinely reusable* primitive — `isPrimaryWorkTree()` (the worktree carve-out test) — placed in `common.mjs` since it's a generic git fact other guards could one day want. Topology *policy* stays inline in the guard.

---

## Decision B — Swarm-worktree carve-out detection

### Candidate B1: `--git-dir` vs `--git-common-dir` inequality — **VERIFIED**
- **Summary**: A linked (dispatch) worktree has `git rev-parse --git-dir` ≠ `git rev-parse --git-common-dir`; the primary tree has them equal. Enforce topology only when equal.
- **Empirical verification (this repo, git 2.50.1, read-only)**:
  - Primary tree: `--git-dir` = `.git`, `--git-common-dir` = `.git` → **equal**.
  - Linked worktree: `--git-dir` = `…/.git/worktrees/wt`, `--git-common-dir` = `…/.git` → **differ**.
- **Fits**: Yes — uses the same `execFileSync('git', [...])` pattern already in `currentBranch()` :71 / `isInsideWorkTree()` :80.
- **Tests it enables**: A test that `git worktree add`s a temp worktree, attempts a commit-classified payload with the guard's cwd inside it, and asserts topology PASS (carve-out) — while the same payload on the primary tree under `direct-to-main` on a feature branch BLOCKS.
- **Tradeoffs**: Two `git rev-parse` calls per commit (negligible). **Normalize both to absolute** (compare via `--absolute-git-dir` vs an absolute common-dir) so a future relative/absolute format mismatch can't false-equate; the plain compare already distinguishes correctly because git emits both in the same format from one cwd.

### Candidate B2: `GIT_DIR`/`GIT_COMMON_DIR` env or `.git` file-vs-dir sniff
- **Summary**: Detect a worktree by `.git` being a *file* (gitlink) rather than a directory, or by env vars swarm-dispatch sets.
- **Fits**: Weakly — `.git`-is-a-file also describes submodules; env vars aren't guaranteed to be set in the guard's process. Fragile.
- **Tradeoffs**: More edge cases than B1; no upside. Reject.

**B recommendation: B1** (absolute-normalized compare), with `isPrimaryWorkTree()` in `common.mjs`.

---

## Decision C — Modeling the `direct-to-main` permitted-branch set

### Candidate C1: Single default branch (`main` only)
- **Summary**: `direct-to-main` permits commits only on the repo's default branch.
- **Tradeoffs**: Wrong for this repo — semantic-release publishes on **both** `main` and `next` (intake Open question; scout Risk). A commit on `next` would be false-blocked.

### Candidate C2: Explicit release-branch **list** on the knob
- **Summary**: `git.workflow_model` carries (or is paired with) a `release_branches` list, default `["main"]`; `direct-to-main` permits commits on any branch in that set, blocks elsewhere.
- **Fits**: Yes — generalizes `protected_branches`' existing glob-list shape (`matchAnyGlob` :472 already exists and can be reused for the release set).
- **Tests it enables**: Parametric tests over `["main"]` and `["main","next"]`.
- **Tradeoffs**: One more config field. But it's the minimum needed for correctness here, and reuses `matchAnyGlob` — not speculative. **The shape question: a sibling `git.release_branches` list vs. nesting.** Recommend a flat sibling `git.release_branches` (default `["main"]`) read only when `workflow_model === "direct-to-main"`.

### Candidate C3: Derive the release set from CI config at guard time
- **Summary**: Parse `.github/workflows/*.yml` for the semantic-release `push:` branches on every commit.
- **Tradeoffs**: Heavy, slow, and brittle inside a PreToolUse hook (YAML parse on every commit; no YAML dep in the guard). CI parsing belongs in *detection* (Decision D), not *enforcement*. Reject for the guard.

**C recommendation: C2** — `git.release_branches` glob list, default `["main"]`, consulted by `matchAnyGlob` only under `direct-to-main`. CI-derivation (C3) is the *detection-time* seed for this list, not a guard-time operation.

---

## Decision D — `/init-project` best-effort detection

### Candidate D1: Signal cascade with `ask` as the floor
- **Summary**: At `/init-project` Step 3 survey, gather signals in precedence order, propose a model at Step 5 via `AskUserQuestion`, default to `ask` on any ambiguity or tooling failure:
  1. **Release-CI trigger** (strongest): `.github/workflows/*.yml` with a `semantic-release` step and `push: branches: [main, next, …]` → propose `direct-to-main` and seed `release_branches` from the trigger list.
  2. **`gh api` branch protection**: `gh api repos/{owner}/{repo}/branches/main/protection` showing required PR reviews → propose `github-flow`.
  3. **History shape** (tiebreaker): linear history, zero merge commits (`git log --merges`) → leans `direct-to-main`; many merge commits + `develop`/`release/*` branches → leans `gitflow` (reserved → `ask`).
  4. Any unreachable `gh` (no auth/network/not a GitHub remote), conflicting signals, or no signal → **`ask`**.
- **Fits**: Yes — Step 3 already runs `git rev-parse --is-inside-work-tree` (init-project.md :32); Step 4 recommender emits `project_json`; Step 5 confirms via `AskUserQuestion` (:94). Detection slots in cleanly and writes the proposed `workflow_model` + `release_branches` into the Step 6 `project.json`.
- **Tests it enables**: Unit tests on a pure `detectWorkflowModel({ciYaml, ghProtection, historyShape})` classifier over fixtures (no live `gh` needed in tests).
- **Tradeoffs**: Best-effort by nature; never silent — every detection is confirmed by the human at Step 5. Exactly the intake's "detect + safe default" requirement.

### Candidate D2: Ask-always (no detection)
- **Summary**: Skip signal gathering; always `AskUserQuestion` the model at Step 5.
- **Tradeoffs**: Simpler, but throws away cheap, reliable signals (this repo's CI trigger is unambiguous) and pushes a decision onto the user that the evidence already answers. Detection's whole point is to propose the right default.

**D recommendation: D1** — signal cascade, `gh`-failure and ambiguity both floor to `ask`, human confirms at Step 5. Extract a pure classifier so it's testable without network.

---

## Recommendation (overall)

- **A1 + `isPrimaryWorkTree()` in `common.mjs`** — topology policy inline in `git_commit_guard.mjs`; the one reusable git primitive shared.
- **B1 (absolute-normalized)** — worktree carve-out via `--git-dir` ≠ `--git-common-dir`, verified empirically.
- **C2** — `git.release_branches` glob list (default `["main"]`), consulted under `direct-to-main` via the existing `matchAnyGlob`.
- **D1** — `/init-project` signal cascade flooring to `ask`, pure testable classifier.

Enforcement composes with — never short-circuits — the existing consent/pattern checks: the topology decision runs as an *additional* block branch; on topology PASS the guard falls through to the unchanged `branchPolicy()`/consent path (protects `branch-aware-git-policy.test.mjs`). Under `ask`, the guard returns topology-PASS and the *SOP* (`commit`/`harness`) owns the branch question — the guard never prompts.

**What would flip these:** if the maintainer wants `github-flow` on this repo (not `direct-to-main`), C2's default list and D1's CI-signal still hold but the migration target changes. If a second consumer needs `gitflow`/`trunk` enforcement, A1's inline fn graduates to a small strategy table — but not before (YAGNI).

## Open questions

1. **Config shape for the release set** — flat sibling `git.release_branches` (recommended) vs. nesting under `workflow_model`? Affects `project.json`/template mirror schema. (Gate-A decision.)
2. **`github-flow` strictness** — hard-block *all* `main` commits, or allow a carve-out (e.g. a docs hotfix)? Intake assumed hard-block all. (Gate-A decision.)
3. **`next` for this repo's migration** — set `release_branches: ["main", "next"]` now, or `["main"]` until `next` is actually used? (Gate-A decision; low blast radius either way.)
4. **Detached-HEAD interaction under topology** — detached-HEAD already DENIES at :175 before any topology check, so topology never sees it. Confirm that ordering is intended (it is, per intake AC-8) and keep topology strictly after the detached gate.
