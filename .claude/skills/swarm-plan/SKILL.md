---
name: swarm-plan
owner: baseline
description: Decompose an approved spec into a dependency-ordered swarm plan — one task per component, each with an explicit write_set. Produces `.claude/state/swarm/<slug>.json` with tasks + waves. The wave scheduler guarantees pairwise-disjoint write_sets within each wave so parallel dispatch is provably conflict-free.
---

# swarm-plan — Phase 5.5: decompose for parallel execution

Invoked after `/approve-spec` and before `/tdd` on any spec that has ≥3 independent components worth parallelizing (per `project.json → swarm.min_tasks_worth_swarming`). For smaller specs, skip swarm and go straight to `/tdd` solo.

## Prereqs

1. `.claude/state/spec_approvals/<slug>.approval` exists (spec is human-approved).
2. `docs/specs/<slug>.md` exists and passes `/spec-lint`.
3. `docs/scout/<slug>.md` exists (component → file mapping is its job).

If any prereq is missing, stop and surface what's needed.

## Output contract

`.claude/state/swarm/<slug>.json`:

```json
{
  "slug": "<slug>",
  "spec": "docs/specs/<slug>.md",
  "created_at": <epoch>,
  "status": "planned",
  "tasks": [
    {
      "id": "T-001",
      "title": "<what the task does — one line>",
      "component": "<component id from C4 Component diagram>",
      "acs": ["AC-001", "AC-002"],
      "write_set": ["src/foo/bar.py", "tests/foo/test_bar.py"],
      "read_set": ["src/common/http.py"],
      "depends_on": []
    }
  ],
  "waves": null
}
```

You produce `tasks[]`. The validator (`validate.sh`) computes `waves[]` deterministically via Kahn-with-disjointness.

## Steps

1. **Read upstream**: the spec, the scout report, the approval token. If an older `.claude/state/swarm/<slug>.json` exists, confirm with the user whether to overwrite (replan) or abort.
2. **Extract inputs** from the spec:
   - **Components**: every `Component(id, …)` in the C4 Component diagram (there may be multiple C4 Component diagrams, one per container).
   - **ACs**: every row in the Acceptance criteria table.
   - **Dependency edges**: every `A --> B` in the spec's dependency-graph fence.
   - **Behavior ↔ component mapping**: for each AC, the sequence diagram it references names participants; treat each non-actor, non-external participant as a component this AC touches.
3. **Get file mapping** from the scout report: for each component id, the files that back it. If the spec introduces greenfield components not in the scout, propose new file paths and flag them under a "new_paths" note in your plan summary — they will be accepted by the boundary guard when declared in `write_set`.
4. **Construct tasks** — one per component (per `swarm.granularity: component`):
   - `id`: T-001, T-002, … in stable order.
   - `title`: one-line imperative description.
   - `component`: the C4 component id.
   - `acs`: every AC whose sequence names this component.
   - `write_set`: union of (component files) + (test files covering those ACs). Every file must be explicit; no globs.
   - `read_set`: files this task will consult but not modify. Advisory; not enforced.
   - `depends_on`: for each component B such that this component depends on B (per the dependency graph), include the task id of the task owning B.
5. **Merge overlapping tasks where forced**:
   - If two tasks share any file AND have no `depends_on` relationship, either introduce a `depends_on` edge (making them sequential across waves) or merge them into one task. Merging is preferred when they're on the same component.
6. **Validate the plan**:
   ```
   .claude/skills/swarm-plan/validate.sh docs/specs/<slug>.md .claude/state/swarm/<slug>.json
   ```
   The validator checks: required fields, depends_on references resolve, DAG is acyclic, and assigns `waves[]`. If validation fails, it prints a precise error — fix the plan and re-run.
7. **Surface the plan** to the user as a table:

   ```
   Swarm plan for <slug> — <N> tasks across <M> waves
   
   wave 1:
     T-001  webhook-worker       [AC-001, AC-002]   3 files
     T-003  backoff-policy       [AC-004]           2 files
   wave 2:
     T-002  webhook-retry        [AC-003]           2 files  (needs T-001)
   ```

8. Tell the user: "Swarm planned at `.claude/state/swarm/<slug>.json`. Review it, then run `/approve-swarm <slug>`. After approval, run `/swarm-dispatch <slug>`."

## Constraints

- **Never dispatch from this skill.** Planning and execution are separated by a human consent gate (`/approve-swarm`).
- **Every file in a `write_set` must be a concrete path**, not a glob. The boundary guard does string-level membership checks.
- **The `validate.sh` script is the source of truth for wave assignment.** Do not hand-write `waves[]`.
- **Greenfield files are allowed** in `write_set` even if they don't exist yet — the guard checks declared ownership, not disk presence.
- **If validation keeps failing**, the problem is usually that two tasks share a file with no dependency. Either merge or introduce a dependency edge.
