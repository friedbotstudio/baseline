# Size every workflow so its fixed overhead is a small fraction of what it spends

## Problem

Every workflow pays a fixed cost that has nothing to do with how much work it
carries. `security`, `integrate`, `archive`, `memory-sync` and the consent gates
run at roughly the same cost whether the payload is ten lines or a thousand.

Measured on `planner-cli-output` (2026-08-20, commit `b93a5e4`): a **10-line**
diff cost 1,218s of model time and 8.5M cache reads, of which `security` was 61s
and `integrate` 456s. The one-line follow-up that run deferred — routing task ids
through `clip` — would have paid that same tail again as its own workflow.

The repo currently holds **66 open backlog entries**. At one workflow each, that
is 66 tails.

The requester stated the problem this way:

> a workflow is costly and we need to strategies such that we can amortize on
> simplify, security, and document as much as possible... think, every workflow
> running its simplify, security, document, memory-sync, and archive route...
> multiply it to 10 tasks. what have we done?

Nothing in the system measures this today. `rightsize-gate` trims `{simplify,
document}` by diff size, but it never computes a ratio, never looks at cost, and
by constitution can never touch `security` — which is one of the two most
expensive tail phases measured above.

## Goal

A workflow is sized before its tail runs, so the fixed overhead is a known
fraction of what the workflow spends rather than an unmeasured accident.

## Non-goals

- **Not about commit boundaries or diff reviewability.** `commit-planner` already
  splits a landing into reviewable commits. The requester was explicit: "so
  workflow has nothing to do with work type, or commits etc... it has everything
  to do with amortization." A workflow is an amortization unit; how its output is
  sliced into commits is a separate, already-solved concern.
- **Not a work-type classifier.** The planner does not decide what kind of work a
  ticket is, which track it belongs on, or how to sequence it. `/triage` owns
  track choice and `sprint-planner` owns sequencing.
- **Not a replacement for `rightsize-gate`.** That gate answers "which tail phases
  does this payload warrant". This answers "is this payload big enough to run a
  tail at all". They compose; neither subsumes the other.
- **Not retroactive.** Historical workflows are not re-scored, re-flagged, or
  reported on. The requester ruled this out directly: "I don't care for historical
  work flagging. That is history and to be learned from."

## Success metrics

- Median payload/envelope ratio across new workflows — baseline: **1.30x**
  (measured 2026-08-20 over the 92 of 117 archived bundles that instrument both
  sides), target: **>= 3.0x**, measured via: the same per-phase token deltas in
  `docs/archive/*/*/timing.md`. Per-track medians vary widely and the problem is
  concentrated: `epic-child` 4.05x and `tdd-quickfix` 3.05x already clear the bars,
  while `power` 1.02x, `spec-entry` 0.96x and `intake-full` 0.66x do not.
- Share of workflows whose measured envelope share exceeds 33% — baseline:
  unmeasured, target: falling, measured via: the planner's own close-out report.
- Bundles that instrument both sides of the ratio — baseline: **92 of 117 (79%)**,
  target: **100% of new workflows that have a payload phase**, measured via:
  presence of a payload-phase row with non-zero output tokens in `timing.md`.
  `chore`-track workflows have no payload phase by design and are out of scope.

## Stakeholders

- **Requester**: Tushar Srivastava
- **Reviewer**: Tushar Srivastava
- **Operator**: end-user projects that install baseline — the planner runs on
  their machines, against their own accumulated timing history.

## Constraints

- **Baseline ships to other people's machines.** "baseline is a product designed
  to be installed in end-user's system." The envelope must be derivable per
  install rather than hard-coded from this repo's numbers, and the cost unit must
  be comparable across machines. Wall-clock carries the operator's API latency and
  hardware; per-phase output tokens do not.
- **A fresh install has no history.** The planner must produce a usable envelope
  on a repo with zero archived bundles, then refine as the corpus grows.
- **One instrumentation hole is real and one was a measurement error.** Corrected
  by `/scout` on 2026-08-20: **13** bundles lack a payload row (mostly `chore`,
  which has no payload phase by design), 6 carry `n/a` tokens from an unavailable
  transcript, 3 predate the token columns, and 94 carry a real count. The earlier
  "45 of 117" came from a probe that dropped every row containing `n/a`. The
  genuine hole is `attempts`: **zero** bundles have ever recorded the re-entry
  counter `harness/SKILL.md` requires before each auto-loop, so re-spec cost is
  entirely invisible. A ratio computed over an unstamped payload is still a
  confident number over a missing half — the failure shape the `assemble-context`
  landmark records, where a CLEAN verdict from no input read identically to a
  CLEAN verdict from real input.
- **Re-spec loops inflate the envelope** and are currently invisible for the reason
  above.
- The thresholds are already decided and are not open: **3x soft floor, 4x
  optimal**, per `.claude/memory/decisions/work-planner-envelope-ratio-3x-soft-4x-optimal.md`.
- **The envelope/payload split is decided and is not open.** Payload is `scenario`,
  `tdd` and `implement`. Every other phase is envelope, including `simplify` — the
  requester ruled that rework on the payload is still overhead, not work. Recorded
  verbatim: "only scenario, tdd, and implement is work.. simplify, security,
  integrate etc are all envelope".
- `swarm-dispatch` is counted as **payload** by inference, not by instruction: a
  swarm worker runs `Skill(scenario)` then `Skill(implement)` in a worktree, so it
  is the same work under a different execution shape. Flagged here because the
  requester did not name it.
- The 1.60x baseline in Success metrics was measured under exactly this split, so
  it stands unchanged.

## Decisions

Recorded in main context per CLAUDE.md XI.12 rather than raised as gate-A
questions. Both are reversible and neither changes what gets built.

| Decision | Owner | Rationale |
|---|---|---|
| Cost is measured in **per-phase output tokens**, not wall-clock milliseconds. | claude | Baseline runs on the operator's machine, so wall-clock carries their API latency, hardware and cache state; the same workflow would measure differently for two operators and the envelope would stop being portable. Output tokens are what the operator spends and `timing.md` already records them per phase. |
| The 3x floor is **advisory with a recorded override**, never a block. | engineer | A hard floor cannot distinguish an under-sized workflow from an urgent one, so it would stop a one-line fix that genuinely needs to ship. Recording the override reason to `workflow.json` keeps the bypass visible and countable, which a gate people learn to route around silently does not. |
| Below **4x**, the planner **proposes** concrete backlog work to close the gap and asks the operator to approve; it never adds work unasked. | engineer | The trigger is the optimal target, not the floor: 3x is where the planner warns, 4x is what it fills toward. Requested directly — "if the work is less than 4x you automatically add to the work and just ask user to approve". Proposing rather than warning is what turns the ratio from a report into a habit. |
| A fresh install ships a **per-track default envelope** fitted from this repository's corpus, and reports it as un-fitted until the local corpus is large enough to replace it. | claude | AC-002 requires a usable envelope at zero history. Shipping a default preserves that; marking it un-fitted stops an operator reading a borrowed number as their own. The sample count at which the local fit takes over is a spec-level choice, not an intake one. |

## Acceptance criteria

1. Given an archived corpus with per-phase token data, when the planner computes
   the envelope for a track, then it returns a number derived from that corpus and
   names how many bundles it was fitted over.
2. Given a repo with zero archived bundles, when the planner computes an envelope,
   then it returns a shipped default and reports that the value is un-fitted rather
   than failing or returning zero.
3. Given a workflow whose payload phase completes, when measured payload is below
   3x the envelope, then the planner reports `under-floor` with the shortfall
   before any tail phase runs, and the loop proceeds only on an override.
3a. Given an `under-floor` report that the operator overrides, when the loop
   proceeds, then the override and its stated reason are recorded in
   `workflow.json` and survive into the archived bundle.
4. Given measured payload between 3x and 4x the envelope, when the planner runs,
   then it reports `acceptable` and the loop proceeds without a prompt.
5. Given measured payload at or above 4x the envelope, when the planner runs, then
   it reports `optimal`.
6. Given a workflow whose payload phase produced output tokens, when the phase
   completes, then `timing.md` carries a payload-phase row with a non-zero token
   count.
7. Given a phase that is re-entered, when the re-entry occurs, then
   `workflow.json → attempts` records the count and `timing.md` carries the
   corresponding `<phase>:attempt-<k>` row.
8. Given an envelope computed from a corpus containing re-entries, when the planner
   reports it, then re-entry cost is included in the envelope rather than silently
   excluded.
9. Given the planner and `rightsize-gate` both run at the post-payload seam, when
   the loop reaches that seam, then the planner runs first and `rightsize-gate`
   consumes the resulting payload size.
10. Given measured payload below 4x the envelope, when the planner runs, then it
    proposes a named set of open backlog entries sized to close the gap, and adds
    nothing without operator approval.
11. Given a proposed set the operator declines, when the loop continues, then no
    work is added and the workflow proceeds under the AC-003 / AC-004 report.
12. Given a proposed set the operator approves, when the loop continues, then the
    added entries' keys are written to `workflow.json → source_backlog_keys` so
    `/commit` stamps their closure in the same landing.
13. Given a track with no payload phase (`chore`), when the planner runs, then it
    reports `not-applicable` rather than a zero ratio or an infinite envelope
    share.

## Open questions

- None. The envelope/payload split and the floor's enforcement mode were settled
  in conversation; the cost unit and the cold-start default are recorded under
  Decisions.

