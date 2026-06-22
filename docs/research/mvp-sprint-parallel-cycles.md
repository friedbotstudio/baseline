# Pattern Research — lift swarm parallelism to the epic/sprint level

> **POST-REVIEW PIVOT (2026-06-23) — read first.** After this memo was written, a web lookup surfaced that Claude Code now ships a native **Agent Teams** feature (peer sessions + mailbox + shared task list + dependency-unblock + plan-approval gating) and community **MCP message-bus** servers (`claude-peers-mcp`, Interagent). The maintainer reviewed both and chose a **third direction**: build a **baseline-owned MCP coordination channel** (not native Agent Teams, which is experimental and harder to sandbox), confined to an **opt-in sprint-mode sandbox** governed by a **new bounded charter (the §II.A pattern)** — explicitly **NOT** a rewrite of the seed §4.2 "one subagent / decisions in main context" founding axiom. Reconciliation for the "MCP can't spawn sessions" constraint: the **lead spawns bounded `swarm-worker` subagents** (axiom preserved) that connect to the channel for *mid-flight mechanical coordination only* (task-claim, done-unblock, write-set conflict, yield-fork-to-lead) — never design decisions. The candidate analysis below remains valid for the *mechanics it reused* (the `assignWaves` scheduler logic now lives in the channel's dependency state; `swarm_merge` audit still lifts into Slice D; the RALPH yield via plan lineage still holds), but the **isolation-strategy candidates (1A/1B/1C) are superseded** by the channel model, and the **amendment framing (Decision 5) is superseded** by the bounded-charter-not-rewrite stance. The reshaped slices are in `.claude/state/epic/mvp-sprint-parallel-cycles.json`; the spec is authored against those. Sources: [Agent Teams docs](https://code.claude.com/docs/en/agent-teams) · [multi-agent coordination patterns](https://claude.com/blog/multi-agent-coordination-patterns) · [claude-peers-mcp / Interagent](https://mcpmarket.com/server/interagent).

**Library API note:** this epic is entirely baseline-internal (git worktrees, the Agent/Task tool runtime, the harness loop, existing `.mjs` helpers). No third-party library is introduced by any candidate below, so `context7` lookup is not applicable. If the spec author chooses a candidate that pulls in a dependency, that API must be context7-verified at spec time.

The option space is organized by the five load-bearing decisions the spec author must settle. Each slice maps to one decision block.

---

## Decision 1 (Slice C) — parallel-dispatch isolation strategy

This is the pivot of the whole speed lever, fully constrained by `multi-wave-worktree-is-an-agent-tool-constraint` (scout landmine): under worktree isolation, wave-N+1 worktrees fork a stale base and never see wave-N output, because `swarm_merge.mjs` applies to the working tree **without committing**.

### Candidate 1A — Independent-slices-only, single worktree wave (recommended)
- **Summary**: Dispatch only the genuinely-independent slices (a single wave with pairwise-disjoint write_sets) concurrently in worktrees. Dependent slices run in a *later* dispatch round after the prior round's output has been **committed** to the primary tree (the epic's per-child commit model already commits each child — Slice D rides that).
- **Fits**: Yes — respects the Agent-tool constraint head-on instead of fighting it (scout: "parallelize only genuinely-independent slices within one wave"). Reuses the existing `assignWaves` wave-1 set and the existing per-child commit.
- **Tests it enables**: wave-disjointness assertion (no two parallel slices share a write_set path); a two-round fixture where round 2's worktree forks from the committed round-1 HEAD and sees round-1 files.
- **Tradeoffs**: Wall-clock = sum of *waves*, not sum of *slices*. The speed win is real only when the sprint DAG is wide (many independent slices) and shallow (few dependency layers). A deep dependency chain degrades toward serial — but that's honest, and AC-6 ("bounded by slowest slice") holds *within* a wave. Commit-between-rounds adds N gate-C consents unless Slice D collapses them.

### Candidate 1B — Commit-between-waves on a staging branch (worktree, fresh fork)
- **Summary**: After each wave, commit the merged output to a staging branch and have the next wave's worktrees fork from it, so cross-wave dependencies resolve.
- **Fits**: Partial — directly fights the documented Agent-tool constraint (the Agent tool, not baseline, owns the worktree base commit; baseline can steer but not choose the fork point). Scout flags this as the brittle path.
- **Tests it enables**: hard to test deterministically — the failure mode is an Agent-tool-owned base ref, which baseline can't fixture without mocking the Agent tool (forbidden: no internal mocks).
- **Tradeoffs**: Highest theoretical parallelism, but rests on behavior baseline doesn't control. The `-424f` and `-e3f2` runs both confirmed this breaks. High reversibility cost — if the Agent tool's base-selection changes, the whole scheme silently regresses.

### Candidate 1C — Shared isolation, no worktree
- **Summary**: Use swarm's existing `shared` isolation mode (single working tree, write-set discipline enforced by `swarm_boundary_guard`) instead of worktrees, so there is no stale-base problem at all.
- **Fits**: Partial — sidesteps the worktree constraint but drops *physical* filesystem isolation, the one axis seed §4.2 says justifies the subagent. Concurrent writers on a shared tree race unless write_sets are perfectly disjoint and the guard is airtight.
- **Tests it enables**: write-set-boundary enforcement under concurrent writes; `swarm_boundary_guard` firing on an out-of-set write.
- **Tradeoffs**: Loses the isolation guarantee; a single guard gap corrupts the shared tree. seed.md already sanctions `shared` only for git projects opting out of worktrees, "never as a non-git fallback" — using it as the *default* parallel mode is a philosophy shift the spec must own.

**Lean:** 1A. It is the only candidate that respects a twice-confirmed constraint, reuses existing machinery, and stays testable without mocking the Agent tool. 1B/1C are fallbacks the spec can name as future work.

---

## Decision 2 (Slice C) — RALPH yield / stop-rule shape

How a parallel epic-child signals an un-decidable fork back to main context, and how arbitration resumes it. Substrate confirmed on disk: `plan-store.mjs` (append-only versioned `recordRevision`/`currentSnapshot`), `replan.mjs applyReplan` (record-only replan primitive, validates candidate before appending), `maker-checker.mjs assertBounded` (the §II.A singular-maker invariant).

### Candidate 2A — Structured-status yield, arbitrate-on-plan-lineage (recommended)
- **Summary**: A child reaching an un-decidable fork returns a JSON status with `verdict: "yield"` + a structured fork description (mirrors `parse_worker_result.mjs parseWorkerResult`). The orchestrator records the yield as a plan revision via `applyReplan` (author=child, reason=fork), aborts only that child, arbitrates in main context, then re-dispatches with the fork resolved into the recipe.
- **Fits**: Yes — reuses `parseWorkerResult`'s status-channel pattern and the durable plan lineage (scout: "yields record onto this plan lineage"). No new persistence layer.
- **Tests it enables**: a child-status fixture asserting a `yield` verdict aborts that child and records exactly one plan revision; arbitration re-dispatch produces a child with the resolved recipe.
- **Tradeoffs**: Requires defining the "un-decidable fork" predicate precisely (what counts as un-decidable vs a retryable bug) — under-specifying it makes children yield too eagerly (serializes) or too rarely (children make banned decisions). This predicate IS backlog `-4c43`'s core.

### Candidate 2B — Exit-code-only yield (no plan lineage)
- **Summary**: Child exits with a dedicated code (like swarm's exit-3 skip pattern); orchestrator surfaces and re-dispatches, no plan-revision record.
- **Fits**: Partial — simpler, but loses the auditable "every replan is a recorded diff" property the durable plan was built for (vision §1.2). 
- **Tradeoffs**: No arbitration history; a child that yields repeatedly is invisible to post-hoc analysis. Cheaper to build, weaker to govern.

**Lean:** 2A — the plan lineage already exists precisely for this, and the auditable yield trail is what lets Slice E's graduation prove the prototype worked.

---

## Decision 3 (Slice A) — completeness-oracle representation

Brief defines "complete" as done-record + edge coverage + end-to-end wiring (explicitly *not* scope-drop).

### Candidate 3A — Sprint manifest + mechanical checklist oracle (recommended)
- **Summary**: A `sprint.json` (or extension of `.claude/state/epic/<slug>.json`) carries per-feature done-criteria as three mechanical checks: (a) done-record = the feature has a slice with ACs; (b) edge coverage = the slice's test file contains assertions tagged for error/empty/edge states; (c) wiring = an integration-level test exercises the feature end-to-end. An oracle `.mjs` exits non-zero if any feature fails any check, listing the gaps.
- **Fits**: Yes — mirrors the existing mechanical-oracle pattern (drift_check, rightsize-gate): exit-code-driven, fail-loud, next to its SKILL.md.
- **Tests it enables**: oracle reports a feature with no integration test as not-wired; a happy-path-only test as edge-uncovered; full criteria as done.
- **Tradeoffs**: "Edge coverage" and "wiring" are heuristic (tag presence / test existence), not proof. Over-trusting the tags invites gaming; the spec must define the tag/structure convention crisply. Still far better than today's *no* record.

### Candidate 3B — Reuse drift_check against an MVP spec
- **Summary**: Treat the sprint as one big spec; reuse `drift_check.mjs`'s AC-to-added-line scoring to report unresolved features.
- **Fits**: Partial — drift_check scores against the *diff*, and its working-tree-vs-HEAD trap (landmines.md:150) makes it unreliable mid-flight. It measures "was this AC's id referenced in an added line," not the three completeness dimensions.
- **Tradeoffs**: Cheap reuse, wrong axis — it checks traceability, not edge/wiring completeness. Reject as the primary oracle; it can complement 3A.

**Lean:** 3A, with the tag/structure convention defined in the spec.

---

## Decision 4 (Slice B) — epic-level scheduler: reuse vs new

### Candidate 4A — Extract/import `assignWaves` (recommended)
- **Summary**: `swarm-plan/validate.mjs assignWaves(tasks, ids, indeg, outedges)` already does topo-sort + greedy pairwise-disjoint-write_set wave packing and returns `waves` (array of id arrays). Import it (2nd use → import, not copy, per the reuse rule) and feed it slice-grain tasks (each slice = one task with a `write_set` = union of its child's file set).
- **Fits**: Yes — scout flagged this as the reuse-before-create candidate (Art. VI.4). The algorithm is grain-agnostic.
- **Tradeoffs**: `assignWaves` is currently a private function inside `validate.mjs` `main`; extracting it to an importable module is a small refactor that the existing swarm tests must still cover. Slice-grain write_sets are coarser (a child touches many files) → wider waves collide more easily → fewer parallel slices than hoped. Honest, and measurable.

### Candidate 4B — New epic-level scheduler
- **Summary**: Write a fresh scheduler tuned to slice-grain (e.g. dependency-layer-based rather than greedy-pack).
- **Tradeoffs**: Violates reuse-before-create with no demonstrated need; the greedy packer is already correct for disjoint-write_set waves. Reject unless 4A's coarse-write_set collision proves unacceptable in the prototype.

**Lean:** 4A.

---

## Decision 5 (Slice E) — Article II amendment framing

Not a menu of candidates — a process constraint. The amendment is a **fresh §II.A clause-7 graduation for the parallel-child-cycle class**. seed §II.A clause 6 explicitly reserves "RALPH waves" as future work "each gated on its own clause-7 graduation," and clause 7 ratified only the oracle-bound-checker class. So Slice E must:
1. Edit `seed.md` first, then `CLAUDE.md`, then implementation (Art. I.4 precedence), with `src/*.template.md` mirrors in lockstep.
2. Present clause-7 evidence (a–d): N governed parallel-child round-trips from Slice C's prototype with every blocking finding mechanically grounded; zero false-positive blocks; a clean `/security` pass on the parallel machinery; explicit maintainer ratification via `/approve-spec`.
3. Land **after** Slice C demonstrably runs concurrent child cycles (backlog `-9360` "after prototype"). This is why the slice DAG orders E last.

**Open framing question for the spec:** does the amendment lift the one-subagent count (a second long-lived subagent type for full child cycles), or keep one subagent and run parallel children as *Workflow-runtime agents* like the maker/checker (which seed §II.A already calls "workflow-runtime agents, not declared subagents")? The latter is the lighter amendment and matches the existing §II.A precedent — recommended framing, but the human decides at spec.

---

## Recommendation

Build order honors the constraints: **A (oracle) → B (reuse `assignWaves`) → C (1A isolation + 2A yield) → D (merge/integrate/single gate-C) → E (clause-7 amendment, workflow-runtime-agent framing)**. The recommended candidates (1A, 2A, 3A, 4A, 5-as-workflow-agent) all share one property: they respect a twice-confirmed Agent-tool constraint and reuse existing machinery rather than betting on behavior baseline doesn't control.

**What would flip the decisions:**
- If the prototype (Slice C) shows wave-grain parallelism is too narrow (coarse slice write_sets collide), revisit 1C (shared isolation) for *more* concurrency, accepting the isolation trade.
- If the "un-decidable fork" predicate (Decision 2) can't be made crisp enough to keep children from either over-yielding or making banned decisions, the parallel path isn't ready and Slice E's graduation should not be sought — fall back to serial epic-children.
- If `assignWaves` extraction destabilizes the swarm tests, write 4B as an isolated module instead.

## Open questions

1. **Single gate-C across N children (Slice D)** vs the existing per-child commit model (`epic_close.mjs` commits each child) — these conflict. Does Slice D introduce a "sprint merge commit" that supersedes per-child commits, or batch the children behind one consent while keeping per-child commits? (Spec must reconcile with `commit/SKILL.md` Step 2.8.)
2. **Amendment scope (Decision 5):** lift the subagent count, or run parallel children as workflow-runtime agents under an extended §II.A? Recommended: the latter.
3. **Completeness-oracle convention (Decision 3):** what exact tag/structure marks "edge coverage" and "wiring" in a test file, so the oracle is mechanical not heuristic?
4. **Speed-metric instrumentation (AC-6):** does the existing `phase_timer` bundle capture parallel-wave wall-clock, or does measuring "bounded by slowest slice" need a new timing surface? (The `AskUserQuestion`/interactive-wait blind spot noted in backlog DP5 may apply.)
