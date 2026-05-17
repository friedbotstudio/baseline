---
name: harness
owner: baseline
description: End-to-end workflow orchestrator. Walks the 11-phase pipeline, invoking each phase skill in order inside an internal loop, yielding at consent gates (/approve-spec, /approve-swarm, /grant-commit), and exiting cleanly on yield/failure/done. Decides swarm-vs-solo at Phase 6. Auto-loops /tdd on integrate failures that don't require a spec change. The harness_continuation Stop hook is a safety net that re-fires harness only when the loop exited mid-flow.
argument-hint: "[optional: \"<request in plain English>\" on fresh start]"
---

# harness — workflow orchestrator with internal loop

User-invokable and model-invokable. The harness chains the 11-phase pipeline by **looping internally through non-gated phases** until the loop hits one of four exit conditions: consent gate, phase-skill failure, integrate-failure-needs-spec-change, or workflow done. The user types only at consent gates (`/approve-spec`, `/approve-swarm`, `/grant-commit`) and at integrate-failure decisions that need a spec change.

## Internal loop atomicity (the contract)

A single `Skill(harness)` invocation **loops through every non-gated phase boundary** in one user turn. Inside the loop, each iteration invokes exactly one phase skill via the `Skill` tool, updates state and TaskList, then re-enters the loop. The loop exits — and the model emits its terminal message — only when one of these four conditions holds:

- **Yield**: the next pending task carries `metadata.needs_user: true` (consent gate, or integrate-failure-needs-spec-change). Write `harness_state: yielded`; surface the gate; exit.
- **Phase-skill failure**: a `Skill(<phase>)` call returned error. Write `harness_state: yielded` with `reason: "<phase> failed: <summary>"`; surface; exit.
- **Done**: `workflow.json → completed` now contains every non-excepted phase. Write `harness_state: done`; surface completion; exit.
- **(Rare) Mid-loop interruption**: the model decides to stop emitting before any of the above (context pressure, runtime limit, external interruption). The on-disk state stays `state: continue` with the marker present — the Stop hook safety net handles this.

`.claude/state/harness_state` is flat JSON with one of three states:

- `continue` — the harness is in the loop body (or was interrupted mid-loop). The Stop hook safety net is armed.
- `yielded` — the loop exited cleanly at a gate or failure. Stop hook stays silent.
- `done` — the loop exited cleanly at workflow completion. Stop hook stays silent.

The state file shape:

```json
{
  "state": "continue|yielded|done",
  "slug": "<workflow slug>",
  "reason": "<one sentence>"
}
```

Exactly three fields. No `written_at`, no `tick_count` — those tunables were removed in the active-marker redesign. The internal-loop redesign retains the shape; the meaning of `state: continue` shifted from "next tick will be auto-fired by the hook" to "the harness is inside the loop body (or was interrupted)".

### The safety net

The `harness_continuation` Stop hook (Article VIII) is a safety net only. Its three-rung gate (`stop_hook_active` absent → `.harness_active` marker exists → `state == "continue"`) emits `{"decision":"block","reason":"…invoke Skill(harness)…"}` **only when the loop exited mid-flow** without writing `yielded`/`done` — i.e., the loop iteration completed an arm-but-did-not-exit-cleanly path. In normal operation (loop runs to gate/failure/done), the hook sees `state != continue` or marker absent, stays silent, and the turn ends naturally. The hook is unchanged by the internal-loop redesign; what changed is the harness skill, which now exits the loop with `yielded`/`done` in the common case, leaving the hook quiescent.

### Marker-then-state ordering (every state-write)

Before writing `harness_state`, do the marker op FIRST:

- On `state: "continue"` → `echo "<slug>" > .claude/state/.harness_active` (creates or refreshes the marker).
- On `state: "yielded"` or `state: "done"` → `rm -f .claude/state/.harness_active` (deletes; safe if absent).

THEN write `harness_state`. The marker is the session-scoped "in the loop" signal; partial-write resilience requires marker-first ordering so a crash between steps leaves the conservative state on disk.

## Preflight (once per Skill(harness) invocation, before entering the loop)

1. **Project configured?** Read `.claude/project.json`. If `configured: false` → stop with: "Run `/init-project` first. The baseline hooks are in guide mode until the project is configured."
2. **Continuity check.** Read `.claude/memory/_resume.md` if present. This is the cross-session snapshot written by the PreCompact and Stop hooks; it tells you what the prior session was actually doing in conversational terms.
3. **Fresh start or resume?**
   - `.claude/state/workflow.json` exists → **resume**.
   - Absent → **fresh start**. The argument (or surrounding conversation) is the request; proceed to Pillar 1.
4. **Ground the user before acting.** When `_resume.md` is present, open with one sentence summarizing where things stood. Grounding only — do not invent state not in `workflow.json`.
5. **Detect divergence.** If `_resume.md`'s recent prompts contradict `workflow.json` (e.g., the user said "actually skip security" mid-session and `exceptions` doesn't reflect it), do **not** auto-proceed. Surface as a clarifying question. Memory accelerates triage; it never authorizes a skip.
6. **Arm the safety net.** Marker FIRST: `echo "<slug>" > .claude/state/.harness_active`. Then write `harness_state` with `{state: "continue", slug, reason: "loop armed; preflight passed"}`. This pair stays in place for the entire loop; mid-loop crashes are now covered by the Stop hook.

Log every transition to `.claude/state/harness/<slug>.log` with timestamp + `entered <phase>` / `completed <phase>` / `yielded at <gate>`.

## The loop body

Inside each iteration:

1. **TaskList.** If empty (first invocation in a fresh session, or session-bound state was reset), **re-seed**: read `workflow.json → completed + exceptions + entry_phase` and recreate tasks for every remaining phase using the canonical templates from `triage`'s SKILL.md. Skip phases already in `completed`. Wire `addBlockedBy` so the dependency chain is preserved.
2. **Pick the next action.** Find the lowest-id `pending` task whose `blockedBy` list is empty.
3. **If no pending task remains** (workflow complete), **EXIT LOOP with DONE**:
   - Marker FIRST: `rm -f .claude/state/.harness_active`.
   - Write `harness_state` with `{state: "done", slug, reason: "workflow complete"}`.
   - Break out of the loop; the terminal message is emitted after loop exit.
4. **If `task.metadata.needs_user == true`** (consent-gate placeholder), **EXIT LOOP with YIELD**:
   - Marker FIRST: `rm -f .claude/state/.harness_active`.
   - Write `harness_state` with `{state: "yielded", slug, reason: "yielded at /<gate>"}` — exactly three fields.
   - Break out of the loop; the terminal message names the consent command for the user to run.
5. **Otherwise INVOKE the phase skill:**
   - `TaskUpdate` to `in_progress` (set `activeForm` to the imperative-progressive form, e.g. "Running scout").
   - Log `entered <phase>` to `.claude/state/harness/<slug>.log`.
   - Invoke the matching phase skill via the **`Skill` tool — one invocation per loop iteration**.
   - On phase-skill success:
     - `TaskUpdate` to `completed`.
     - Append the phase name to `workflow.json → completed`; update `updated_at`.
     - Log `completed <phase>`.
     - Refresh the marker (`echo "<slug>" > .claude/state/.harness_active`) and rewrite `harness_state` with `{state: "continue", slug, reason: "<phase> done; next: <next phase>"}`.
     - **Continue the loop** to the next iteration (return to step 1).
   - On phase-skill failure (non-integrate):
     - Leave the task `in_progress` (do NOT mark `completed`).
     - Do NOT append to `workflow.json → completed`.
     - **EXIT LOOP with YIELD**: marker FIRST (`rm -f .claude/state/.harness_active`), then write `harness_state` with `{state: "yielded", slug, reason: "<phase> failed: <one-line summary>"}`.
     - Surface the error; break out of the loop.
   - On `/integrate` failure: classify per the **Integrate-failure decision tree** below. If auto-loop, re-invoke `Skill(tdd)` and `Skill(integrate)` inside this same loop iteration (the auto-loop happens in-place, not via a new loop iteration). If stop-and-surface, **EXIT LOOP with YIELD** as above.

After the loop exits, emit a single terminal message naming the workflow state. Do not emit per-iteration terminal messages — those would invite the model to stop emitting mid-loop and trigger the safety net unnecessarily.

**Resume after a `needs_user` yield**: the user runs the consent command, then `/harness` again. The next Skill(harness) invocation re-enters preflight, finds the consent-gate task with its `needs_user` flag still set but the gate now satisfied (token on disk), marks that task `completed`, and proceeds into the loop body.

**Drift between TaskList and `workflow.json → completed`**: `workflow.json → completed` is durable across sessions; TaskList is session-bound. When they disagree, trust `workflow.json` and rebuild the task state to match.

## Phase ordering — the 11-phase pipeline

The phases the harness loops through, in order:

```
intake → scout → research → spec → /approve-spec → tdd → simplify →
security → integrate → document → archive → memory-flush →
/grant-commit → commit
```

- Phases listed in `workflow.json → exceptions` are skipped.
- Non-git projects auto-except `grant-commit` and `commit`; the workflow ends after `/archive`.
- The four-pillar framing (Intake analysis · Track alignment · Implementation · Tying open ends) is documentary; the actual execution model is one phase per loop iteration, with the loop continuing through every non-gated boundary until it exits cleanly.
- Inside `/tdd`'s seeded worker chain, the harness inlines a **drift-check-tick** task between the last `design-ui-tick` (or `verify-tick` when no design rows) and `tdd-finalize`. It invokes `python3 .claude/skills/tdd/drift_check.py --slug <slug>` against the approved spec and the branch diff. Exit 0 (zero unresolved) → continue to `tdd-finalize`; exit 1 (≥ 1 unresolved) → EXIT LOOP with YIELD (`reason: "drift analysis: <N> unresolved items"`). Drift failures stop-and-surface (NO auto-loop) — the user fixes the impl gap or amends the spec + re-`/approve-spec`s. The drift report lands at `.claude/state/drift/<slug>.md`. `chore`-track workflows (no spec on disk) exit 0 with "no spec; skipped" and proceed to `tdd-finalize`.

### Swarm vs solo at Phase 6

Once the spec approval token is present on resume, count C4 Components in the approved spec:

```
grep -cE '^\s*Component\(' docs/specs/<slug>.md
```

- Count ≥ `project.json → swarm.min_tasks_worth_swarming` (default 3) **and** the components are genuinely independent (their dependency graph has ≥ 2 nodes with no cross-edge) **and** the project is a git repository (`git rev-parse --is-inside-work-tree` exits 0) → **swarm path**: `swarm-plan` → `/approve-swarm` → `swarm-dispatch`.
- Otherwise → **solo path**: `tdd` directly.
- Non-git projects never reach the swarm path: `/triage` auto-excepts `swarm-plan`, `approve-swarm`, and `swarm-dispatch` at workflow-creation time per CLAUDE.md Article IV ("Phase 6c and Phase 11 are git-conditional"), so the harness sees them in `exceptions` and routes Phase 6 straight to `/tdd`.
- User can override in conversation: "run /tdd solo for this one" or "use swarm." Log the override. A "use swarm" override on a non-git project SHALL be refused with the reason `swarm requires git; swarm phases are excepted on this workflow`.

## Integrate-failure decision tree

When `/integrate` fails inside the loop, judge: is this a simple bug (auto-retryable in-place) or does it need human input on scope/spec?

**Auto-loop to `/tdd`** when **all** of these hold:
- The failing tests are assertions on behavior the spec clearly defines.
- The failure is localized (one component, one AC, no cross-spec contract conflict).
- The fix is mechanical (implementation mismatch, edge case missed, off-by-one).

On auto-loop: invoke `Skill(tdd)` with a brief telling it to focus on the failing test(s) only, then invoke `Skill(integrate)` again — **both calls happen inside the same loop iteration** (no Stop-hook hop, no new user `/harness` invocation needed). Cap at 3 auto-loops within one iteration; if still red after 3, stop and surface (exit loop with yield).

**Stop and surface** when **any** of these hold:
- The failing test expects behavior the spec doesn't define → spec change needed.
- The test exposes a contradiction between two spec ACs → spec change needed.
- The failure reveals a component or interaction the spec doesn't name → scope expansion.
- A swarm-dispatch integration failure spans components dispatched in different waves (coupling the spec missed).

On surface: exit the loop with `harness_state` `state: "yielded"`, `reason: "integrate failed: needs spec change"`. Show the failing test output, name which criterion tripped, and tell the user: "This needs a spec change / scope decision. Update `docs/specs/<slug>.md`, re-run `/approve-spec`, then `/harness` to resume."

## State machine (resume logic)

On each `/harness` invocation, read `workflow.json` and decide whether to enter the loop and at which task:

| Condition | Action |
|---|---|
| No `workflow.json` | Fresh start → Pillar 1 |
| `completed` contains all non-excepted phases | Enter loop; loop exits immediately with `state: done` |
| `completed` contains `spec` but no `spec_approvals/<slug>.approval` token | Enter loop; loop exits at first iteration with `state: yielded` (approve-spec gate) |
| `completed` contains `spec` **and** approval token present, but `tdd`/`swarm-dispatch` not in `completed` | Enter loop; decide swarm-vs-solo at first iteration; invoke the next phase |
| `completed` contains `swarm-plan` but no `swarm_approvals/<slug>.approval` | Enter loop; loop exits with `state: yielded` (approve-swarm gate) |
| `completed` contains `archive` but no `commit_consent` (git project) | Enter loop; loop exits with `state: yielded` (grant-commit gate) |
| Phase skill returned an error this invocation | Loop exits with phase-failure reason; user investigates |

## Constraints

- **Never skip a consent gate.** If the approval/consent token is missing, the loop exits with `state: yielded`. Never generate the token yourself.
- **Never auto-proceed past an integrate failure** outside the decision-tree criteria above.
- **Never re-run a phase already in `workflow.json → completed`** unless the user explicitly asks.
- **Every phase invocation inside the loop uses the Skill tool — one invocation per loop iteration.** Do not re-implement phase logic here.
- **Always refresh `harness_state` after each successful phase invocation** (still `state: continue` during the loop body). The safety net depends on the marker + state being consistent.
- **Log every transition** to `.claude/state/harness/<slug>.log`.
- **If the user overrides a decision in conversation** (e.g., "skip security", "force swarm"), honor the override and log it as a manual adjustment.
