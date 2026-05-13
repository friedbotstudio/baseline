#!/usr/bin/env bash
# swarm_merge.sh — post-task merge + audit tool for worktree-isolated swarm tasks.
#
# Usage:  swarm_merge.sh <plan-path> <task-id> <worktree-path>
#
# Inputs:
#   <plan-path>      .claude/state/swarm/<slug>.json
#   <task-id>        e.g. "T-001" — must exist in plan.tasks[].id
#   <worktree-path>  absolute path to the git worktree created by Agent(isolation="worktree")
#
# Preconditions:
#   .claude/state/swarm/active_wave.json exists and contains `baseline_ref`
#   (the commit SHA recorded when the wave started). The audit diffs the
#   worktree against this baseline.
#
# Behaviour:
#   1. Loads the task's write_set from the plan.
#   2. Computes changed files: `git -C <worktree> diff <baseline> --name-only`.
#   3. AUDIT: every changed file must be in write_set. Any violation → fail loud,
#      preserve the worktree, exit 1.
#   4. If clean: `git -C <worktree> diff <baseline>` | `git -C <main> apply` to
#      land the changes on main.
#   5. Removes the worktree on success (`git worktree remove`).
#
# Exit codes:
#   0   merge applied successfully (or task made no changes)
#   1   audit failed, apply failed, or worktree could not be read
#   2   bad invocation / missing inputs

set -u

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ] || [ "${3:-}" = "" ]; then
    echo "usage: swarm_merge.sh <plan-path> <task-id> <worktree-path>" >&2
    exit 2
fi

PLAN="$1"
TASK_ID="$2"
WT="$3"

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ ! -f "$PLAN" ]; then
    echo "swarm_merge: plan not found at $PLAN" >&2
    exit 2
fi

if [ ! -d "$WT" ]; then
    echo "swarm_merge: worktree not found at $WT" >&2
    exit 2
fi

PLAN="$PLAN" TASK_ID="$TASK_ID" WT="$WT" ROOT="$ROOT" python3 <<'PY'
import json, os, subprocess, sys

plan_path = os.environ['PLAN']
task_id   = os.environ['TASK_ID']
wt        = os.environ['WT']
root      = os.environ['ROOT']

plan = json.load(open(plan_path))

task = next((t for t in plan.get('tasks', []) if t.get('id') == task_id), None)
if task is None:
    print(f"swarm_merge: task {task_id} not found in plan", file=sys.stderr)
    sys.exit(2)

write_set = set(task.get('write_set') or [])
if not write_set:
    print(f"swarm_merge: task {task_id} has empty write_set — refusing to merge", file=sys.stderr)
    sys.exit(2)

# Read baseline from active_wave.json
active_path = os.path.join(root, '.claude/state/swarm/active_wave.json')
try:
    active = json.load(open(active_path))
except Exception as e:
    print(f"swarm_merge: active_wave.json unreadable: {e}", file=sys.stderr)
    sys.exit(2)

baseline = active.get('baseline_ref')
if not baseline:
    print("swarm_merge: active_wave.json missing baseline_ref", file=sys.stderr)
    sys.exit(2)

# Change detection: diff worktree against baseline.
r = subprocess.run(
    ['git', '-C', wt, 'diff', baseline, '--name-only'],
    capture_output=True
)
if r.returncode != 0:
    print(f"swarm_merge: `git diff` in worktree failed: {r.stderr.decode(errors='replace')}",
          file=sys.stderr)
    sys.exit(1)

changed = [f for f in r.stdout.decode().splitlines() if f.strip()]

# If task made no changes, nothing to merge — clean up and exit OK.
if not changed:
    rm = subprocess.run(['git', '-C', root, 'worktree', 'remove', wt], capture_output=True)
    if rm.returncode != 0:
        print(f"swarm_merge: worktree removal warned: {rm.stderr.decode(errors='replace').strip()}",
              file=sys.stderr)
    print(f"swarm_merge: OK — task {task_id} made no changes; worktree cleaned up")
    sys.exit(0)

# AUDIT: every changed file must be in the declared write_set.
violations = [f for f in changed if f not in write_set]
if violations:
    print(f"swarm_merge: AUDIT FAIL — task {task_id} modified files outside its declared write_set:")
    for v in sorted(violations):
        print(f"  + {v}")
    print(f"Declared write_set ({len(write_set)} file(s)):")
    for f in sorted(write_set):
        print(f"  - {f}")
    print(f"Worktree preserved for inspection at: {wt}")
    print(f"Branch: swarm/{task_id} (inspect with `git log swarm/{task_id}` or `git diff {baseline}..swarm/{task_id}`)")
    sys.exit(1)

# Audit passed. Extract full patch and apply to main.
r = subprocess.run(['git', '-C', wt, 'diff', baseline], capture_output=True)
if r.returncode != 0:
    print(f"swarm_merge: `git diff` (full patch) failed: {r.stderr.decode(errors='replace')}",
          file=sys.stderr)
    sys.exit(1)

patch = r.stdout
if not patch.strip():
    # Diff --name-only found files but full diff is empty — bizarre, but bail safely.
    print(f"swarm_merge: diff was empty despite changed files. Worktree preserved at {wt}",
          file=sys.stderr)
    sys.exit(1)

apply_r = subprocess.run(
    ['git', '-C', root, 'apply', '--whitespace=nowarn', '-'],
    input=patch, capture_output=True
)
if apply_r.returncode != 0:
    print(f"swarm_merge: APPLY FAIL — patch from {wt} did not apply cleanly to main:")
    print(apply_r.stderr.decode(errors='replace').strip())
    print(f"Worktree preserved for inspection at: {wt}")
    sys.exit(1)

# Remove the worktree.
rm = subprocess.run(['git', '-C', root, 'worktree', 'remove', wt], capture_output=True)
if rm.returncode != 0:
    # Not fatal — warn but consider the merge successful.
    print(f"swarm_merge: WARNING — could not remove worktree at {wt}: "
          f"{rm.stderr.decode(errors='replace').strip()}", file=sys.stderr)

print(f"swarm_merge: OK — task {task_id} merged ({len(changed)} file(s))")
for f in sorted(changed):
    print(f"  + {f}")
PY
