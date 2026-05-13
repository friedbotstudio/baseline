#!/usr/bin/env bash
# swarm-plan validator — verifies a draft plan and assigns waves deterministically.
#
# Usage: validate.sh <spec-path> <plan-path>
#
# Reads plan-path (JSON), performs:
#   - schema check: required fields on every task
#   - reference check: depends_on ids all resolve to tasks in the plan
#   - acyclicity: DAG has no cycles (Kahn's algorithm)
#   - wave assignment: topological sort with pairwise-disjoint write_set constraint
#
# On success, rewrites plan-path with `waves` populated. Exit 0.
# On failure, prints the precise violation to stderr and exits non-zero.

set -u

if [ "${1:-}" = "" ] || [ "${2:-}" = "" ]; then
  echo "usage: validate.sh <spec-path> <plan-path>" >&2
  exit 2
fi
SPEC="$1"
PLAN="$2"

if [ ! -f "$PLAN" ]; then
  echo "validate: plan not found at $PLAN" >&2
  exit 2
fi

SPEC="$SPEC" PLAN="$PLAN" python3 <<'PY'
import json, os, sys, time

plan_path = os.environ["PLAN"]
try:
    plan = json.load(open(plan_path))
except Exception as e:
    print(f"validate: plan is not valid JSON: {e}", file=sys.stderr)
    sys.exit(1)

errs = []

# Top-level fields.
for k in ("slug", "spec", "tasks"):
    if k not in plan:
        errs.append(f"missing top-level field: {k}")

tasks = plan.get("tasks") or []
if not isinstance(tasks, list) or not tasks:
    errs.append("tasks[] must be a non-empty array")

# Per-task schema.
REQ = {"id", "title", "component", "acs", "write_set", "depends_on"}
ids = set()
for i, t in enumerate(tasks):
    if not isinstance(t, dict):
        errs.append(f"task[{i}] is not an object"); continue
    missing = REQ - set(t.keys())
    if missing:
        errs.append(f"task[{i}] missing fields: {sorted(missing)}")
        continue
    if not isinstance(t["id"], str) or not t["id"]:
        errs.append(f"task[{i}].id must be a non-empty string")
    if t["id"] in ids:
        errs.append(f"duplicate task id: {t['id']}")
    ids.add(t["id"])
    for listfield in ("acs", "write_set", "depends_on"):
        v = t.get(listfield)
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            errs.append(f"task {t.get('id', '?')}.{listfield} must be a list of strings")
    if not t["write_set"]:
        errs.append(f"task {t['id']}.write_set is empty — every task must declare at least one file")

if errs:
    for e in errs: print(f"validate: {e}", file=sys.stderr)
    sys.exit(1)

# depends_on references resolve.
for t in tasks:
    for d in t["depends_on"]:
        if d not in ids:
            errs.append(f"task {t['id']}.depends_on references unknown id: {d}")
        if d == t["id"]:
            errs.append(f"task {t['id']} depends on itself")

if errs:
    for e in errs: print(f"validate: {e}", file=sys.stderr)
    sys.exit(1)

# Cycle detection (Kahn's).
indeg = {t["id"]: 0 for t in tasks}
outedges = {t["id"]: [] for t in tasks}
for t in tasks:
    for d in t["depends_on"]:
        # edge: d -> t (t depends on d; d must finish first).
        outedges[d].append(t["id"])
        indeg[t["id"]] += 1

by_id = {t["id"]: t for t in tasks}
ready = sorted([tid for tid, deg in indeg.items() if deg == 0])
visited = 0
topo_order = []
indeg_work = dict(indeg)
ready_work = list(ready)
while ready_work:
    nxt = ready_work.pop(0)
    topo_order.append(nxt)
    visited += 1
    for n in sorted(outedges[nxt]):
        indeg_work[n] -= 1
        if indeg_work[n] == 0:
            ready_work.append(n)
    ready_work.sort()

if visited != len(tasks):
    unvisited = [tid for tid in indeg if indeg_work[tid] > 0]
    print(f"validate: dependency graph has a cycle among: {unvisited}", file=sys.stderr)
    sys.exit(1)

# Wave assignment: greedy topological layering with pairwise-disjoint write_set.
# Within a wave, all tasks share no files. Tasks whose deps are done AND whose
# write_set doesn't clash with already-chosen wave members go in; others wait.
indeg2 = dict(indeg)
placed = set()
waves = []
remaining = set(ids)
while remaining:
    # Candidates: remaining tasks with indeg2 == 0.
    candidates = sorted([tid for tid in remaining if indeg2[tid] == 0])
    if not candidates:
        # Shouldn't happen given acyclicity, but defensive.
        print(f"validate: internal error — no candidates but tasks remain: {remaining}", file=sys.stderr)
        sys.exit(1)

    wave = []
    wave_files = set()
    # Greedy: heaviest task first (most files), so overflow tasks get pushed with
    # smaller write_sets and can pack into later waves.
    candidates.sort(key=lambda tid: (-len(by_id[tid]["write_set"]), tid))
    overflow = []
    for tid in candidates:
        files = set(by_id[tid]["write_set"])
        if files & wave_files:
            overflow.append(tid)
        else:
            wave.append(tid)
            wave_files |= files
    if not wave:
        # Every candidate conflicts with every other — impossible unless a single
        # candidate had an internal duplicate; but then it's still placeable alone.
        wave = [candidates[0]]
        overflow = candidates[1:]
        wave_files = set(by_id[candidates[0]]["write_set"])

    wave.sort()
    waves.append(wave)
    for tid in wave:
        remaining.discard(tid)
        # Decrement indeg of descendants AFTER the whole wave is placed so the
        # remaining wave members don't become each other's dependents mid-wave.
    for tid in wave:
        for n in outedges[tid]:
            indeg2[n] -= 1

plan["waves"] = waves
plan["status"] = "planned"
plan["validated_at"] = int(time.time())

# Write back.
with open(plan_path, "w") as f:
    json.dump(plan, f, indent=2)

# Human summary to stdout.
print(f"validate: OK — {len(tasks)} task(s) in {len(waves)} wave(s).")
for i, wave in enumerate(waves, start=1):
    print(f"  wave {i}:")
    for tid in wave:
        t = by_id[tid]
        nfiles = len(t["write_set"])
        acs = ",".join(t["acs"]) if t["acs"] else "-"
        deps = ",".join(t["depends_on"]) if t["depends_on"] else "-"
        print(f"    {tid}  {t['component']:<24} [{acs}]  {nfiles} file(s)  deps={deps}")
PY
