---
name: swarm-dispatch
owner: baseline
description: Execute a swarm plan wave by wave with filesystem isolation via git worktrees. For each wave, main context decides the scenario recipe + implementation contract for every task, then spawns one swarm-worker per task in parallel. Each worker executes its recipe and reports JSON status. Worktree merge-audit verifies write-set discipline before changes land on main. Aborts remaining waves on any audit or task failure.
argument-hint: "<slug — matches .claude/state/swarm/<slug>.json>"
---

# swarm-dispatch — wave runner with worktree isolation

Invoked after `/swarm-plan` + `/approve-swarm`. The architecture is the user's principle made concrete:

> **Main context decides. Workers execute.**

Per task, before dispatch, you (main context) produce two recipes:
1. The **scenario recipe** — exactly which failing tests the worker should write.
2. The **implementation contract** — exactly which source files the worker may touch and what behavior they must implement.

The worker's prompt contains both recipes verbatim. The worker invokes `Skill(scenario)` then `Skill(implement)` and reports JSON. It makes no design decisions.

## Isolation modes

Read `project.json → swarm.isolation` (default `"auto"`):

- `"auto"` → choose `worktree` if the project root is inside a git repo (`git rev-parse --is-inside-work-tree` succeeds), else `shared`.
- `"worktree"` → require a git repo; bail if absent.
- `"shared"` → never use worktrees; rely on `swarm_boundary_guard` for runtime enforcement.

**Default path is `worktree`.** The rest of this document describes that mode. The `shared` fallback is at the end.

## Prereqs (worktree mode)

Verify in order, abort on any failure:

1. `.claude/state/swarm/<slug>.json` exists, has `status: "planned"`, and a non-null `waves` array.
2. `.claude/state/swarm_approvals/<slug>.approval` exists and begins with `APPROVED`.
3. `.claude/state/swarm/active_wave.json` does **not** already exist (stale/racing dispatch — ask before clobbering).
4. `git rev-parse --is-inside-work-tree` succeeds at the project root.
5. Working tree is clean (`git status --porcelain` empty) **if** `project.json → swarm.refuse_dirty_tree` is true (default).

Record the baseline: `git rev-parse HEAD` → this SHA is the reference every worktree will be compared against at merge time.

## Per-wave loop

For each wave in `plan.waves`, in order:

### 1. Decide the recipes (main context)

For every task in the wave, produce:

- **Scenario recipe** — list of failing tests to write. Each: `name`, `covers`, `assertion`, `fixtures`. Plus `out-of-scope` list and `test target paths`.
- **Implementation contract** — `failing_tests` (the paths the scenario step will produce), `write_set` (from the plan), behavior contract (the spec's §Behavior excerpts for the task's ACs, plus §Design data model + contracts), project conventions (from `project.json`).
- **Style anchors** — 1–2 existing test files and 1–2 existing source files in the touched modules so the worker matches the project's idioms.

This is where the heavy thinking lives. Do it before dispatch — once a worker is running, the recipe cannot be changed.

### 2. Raise the barrier

Write `.claude/state/swarm/active_wave.json`:

```json
{
  "slug": "<slug>",
  "wave": <n>,
  "isolation": "worktree",
  "baseline_ref": "<HEAD SHA>",
  "started_at": <epoch>,
  "write_sets": [
    {"task_id": "T-001", "files": [...]},
    {"task_id": "T-003", "files": [...]}
  ]
}
```

In worktree mode this file is consumed by `swarm_merge.sh` (which reads `baseline_ref`). `swarm_boundary_guard` is dormant — writes happen inside worktrees that don't contain `active_wave.json`.

### 3. Update plan status

Set each wave task's `status` to `"running"` inside `.claude/state/swarm/<slug>.json`.

### 4. Dispatch the wave

One message, N parallel `Agent` calls — one per task. Each uses:

- `subagent_type: "swarm-worker"`
- `isolation: "worktree"`
- `run_in_background: true`

Worker prompt template (self-contained — the worker has no memory of this conversation):

```
You are executing swarm task <T-XXX> from plan <slug>, in your own isolated
git worktree. Your write_set is the ONLY set of files you may modify.

# Task metadata
- task_id: <T-XXX>
- slug: <slug>
- ACs covered: <AC list>
- Component: <component id>

# Spec excerpt (behavior contract)
<paste §Behavior sequences for this task's ACs + §Design data-model/contract
 rows the task touches. Keep under ~200 lines.>

# Scenario recipe — what tests to write
out-of-scope: [<scenarios explicitly NOT to write>]
test target paths: <test file paths>
style anchors: <1-2 existing test files>

scenarios:
- name: test_when_X_then_Y
  covers: AC-001
  assertion: "<one plain sentence>"
  fixtures: [<paths/factories>]
- name: test_when_A_then_B
  covers: AC-002
  assertion: "..."
  fixtures: [...]
- ...

# Implementation contract
write_set (STRICT — anywhere else fails the merge audit):
- <file 1>
- <file 2>
- ...

read_set (advisory):
- <file 1>
- ...

style anchors: <1-2 existing source files>
project conventions:
  test.cmd: <...>
  lint.cmd: <...>
  tdd.test_globs: <...>

# Your job
1. Invoke Skill(scenario) with the scenario recipe + test target paths.
2. If all expected tests are RED, invoke Skill(implement) with the failing test
   paths, the write_set, the behavior contract above, and the project
   conventions.
3. Report JSON on your final line per the swarm protocol:
   {"task_id": "<T-XXX>", "status": "done" | "failed",
    "files_touched": [...], "note": "<one short line>"}
```

The `swarm-worker` agent's body already knows the protocol. The prompt contains the recipes; the worker executes them.

### 5. Wait

Do not respond to the user until every task in the wave has completed. Each `Agent` return gives you the worktree path (if the worker made changes) and the JSON summary line.

### 6. Per-task merge-audit

For each completed task:

```
.claude/skills/swarm-dispatch/swarm_merge.sh \
  .claude/state/swarm/<slug>.json \
  <task-id> \
  <worktree-path>
```

Outcomes:
- **Exit 0**: audit passed, patch applied to main, worktree removed. Update task `status: "done"`.
- **Exit 1**: audit failed OR `git apply` failed. Worktree preserved for inspection. Update task `status: "failed"` with a `note` naming the offending file(s).
- **No worktree path returned** (worker made no changes): the harness auto-cleans the empty worktree. Mark task per the worker's self-reported JSON.

### 7. Clear the barrier

Delete `.claude/state/swarm/active_wave.json`.

### 8. Decide the wave's fate

- Every task `done` → advance to the next wave.
- Any task `failed` (worker-reported OR audit failure) → set plan `status: "failed"`, stop, surface the failed task(s) with their `note` and (for audit failures) the preserved worktree path.

## After the last wave

1. Set plan `status: "complete"`.
2. Run `/integrate` on the full codebase — per-wave success is necessary but not sufficient; cross-component integration must be re-verified.
3. If `/integrate` passes: tell the user "Swarm `<slug>` complete. `<N>` tasks across `<M>` waves. Next: `/document`."

## Shared-mode fallback

When isolation is `"shared"`:

- No worktrees. Each `Agent` call uses `isolation` omitted or `"none"`.
- `active_wave.json` carries `isolation: "shared"` and the union of write_sets (no `baseline_ref`).
- `swarm_boundary_guard` is the runtime enforcer: writes in enforced paths must be in the union of active write_sets, else denied.
- **No per-task merge-audit** (no worktrees to diff). The guard catches drift out of the wave; cross-task bleed within the wave is a known limitation.
- After each wave: clear `active_wave.json`, update per-task status from the worker's self-reported JSON.

Use shared mode deliberately — it trades real safety (physical isolation) for runtime permissiveness. Worktree mode is preferred whenever git is available.

## Failure recovery

- Plan stays in `"failed"` state for user inspection.
- In worktree mode, failed tasks' worktrees are preserved. The user can `cd` in, read the worker's changes, and either:
  - Manually finish + commit to main, then mark the task done in the plan.
  - Drop the worktree (`git worktree remove --force <path>`) and re-plan.
- In shared mode, partial writes may have landed on main. `git status` shows them; revert or keep as appropriate.
- **Never auto-retry a failed task.** Failures warrant human attention.

## Constraints

- **Recipes are decided before dispatch.** Once a worker is running, you cannot change its recipe. Plan with that in mind.
- **`run_in_background: true` is mandatory** on every `Agent` call inside a wave. Foreground calls would serialize the wave.
- **`isolation: "worktree"` is mandatory** in worktree mode. Without it, the merge-audit guarantee collapses.
- **One message, N parallel `Agent` calls.** Sequential issuance defeats parallelism.
- **`subagent_type` is always `swarm-worker`.** No per-stack variants — stack-specific skill loading is handled by the worker template's `{{SKILLS}}` token at `/init-project` time, not by spawning different agents.
- **Never touch source files from this skill.** This orchestrator only reads and updates `.claude/state/`. File edits happen inside workers; merges happen via `swarm_merge.sh`.
- **`active_wave.json` lingering** after abnormal termination is recoverable: delete it, inspect per-task status, re-dispatch the first incomplete wave.
