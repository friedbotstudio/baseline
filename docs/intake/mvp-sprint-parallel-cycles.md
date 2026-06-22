# Lift swarm-style parallelism to the sprint/epic level so an MVP builds fast and complete

<!-- Intake — epic track. Umbrella: baseline-v1-thought-compiler-agent-team-plan-mode-9d4c.
Primary input: docs/brief/mvp-sprint-parallel-cycles.md (brainstorm). Five slices scoped in
.claude/state/epic/mvp-sprint-parallel-cycles.json. -->

## Problem

Building anything larger than a single feature fragments into many full workflow runs. An engineer building a product MVP (e.g. a website with ~10 features) today runs the 11-phase pipeline roughly once per feature: ~10 serial runs, each paying the full intake→spec→tdd→…→commit tax, plus refinement iterations on top. The human waits **hours** on work that has no inter-run parallelism, and the result still ships **incomplete** in three concrete ways the engineer named:

1. **No record of "done"** — nothing declares what the finished MVP was supposed to contain, so nobody can tell what's missing.
2. **Runs but skips edges** — features work on the happy path but drop error, empty, and edge states.
3. **Built but not wired** — individual pieces exist but were never integrated end-to-end into a working whole.

Notably, *scope-drop* ("a feature was never started") is **not** the failure mode — the pain is unrecorded done-criteria, shallow completion, and missing integration, not silently abandoned features.

The baseline already has two parallelism mechanisms, neither at this altitude: **swarm** parallelizes components *within one spec* (Phase 6 worktree waves), and **epics** group subtasks under one discovery but run each `epic-child` as a *serial* full pipeline. A multi-feature MVP is many specs, so swarm can't touch it; epics group it but don't accelerate it.

## Goal

The baseline plans an MVP into a sprint block with a completeness oracle, then runs the sprint's slices as parallel cycles so wall-clock equals the slowest single slice instead of the sum — fast *and* provably complete, without giving up any quality bar.

## Non-goals

- **Token optimization.** Explicitly trading tokens for wall-clock time — "if we're not saving tokens, let's save time." Parallel cycles may cost *more* tokens; that's accepted.
- **Relaxing quality bars or consent gates** on the parallel path. Real failing-test-first, no stubs, no mocks of internal code, and both human gates (approve-spec, grant-commit) remain non-negotiable.
- **Solving scope-drop.** "Features never started" is not the completeness failure mode targeted here.
- **Replacing the solo/swarm paths.** This is additive — solo `/tdd` and component-level swarm remain for their existing cases.

## Success metrics

- **Wall-clock for an N-slice sprint** — baseline: ≈ N × single-run (serial); target: ≈ max(single-slice cycle) (slowest-slice-bound); measured via the `phase_timer` timing bundle across a parallel sprint vs. the serial sum.
- **Completeness** — baseline: no done-record exists; target: the completeness oracle reports every sprint feature meeting its done-criteria (done-record present, edges covered, end-to-end wired) before sprint close; measured via the oracle artifact.
- **Quality preserved** — baseline: current gate/test discipline; target: unchanged — `audit-baseline` PASS, every consent gate fires, no stub/internal-mock regressions; measured via `audit-baseline` + hook enforcement on the parallel path.

## Stakeholders

- **Requester**: razieldecarte@gmail.com (project owner)
- **Reviewer**: project owner (approves the sliced spec at gate A; grants the discovery + per-child commits)
- **Operator**: engineers running the baseline harness to build MVPs

## Constraints

- **Article II** (decisions in main context; exactly one subagent) blocks parallel full cycles outright. The amendment that sanctions them must, per precedence (Art. I.4), edit `docs/init/seed.md` first, then `CLAUDE.md`, then implementation.
- **Amendment-after-prototype** — backlog child `-9360` requires the Article II amendment land only *after* a working prototype of concurrent dispatch + the RALPH yield/stop-rule (`-4c43`). This orders Slice E after Slice C.
- **Worktree isolation requires git.** The parallel path is git-only, consistent with swarm's existing constraint (Art. IV phase 6c, Art. VII).
- **The 25 hooks are the enforcement layer.** Any change to them needs a seed.md §4.1 amendment; the parallel path must compose with the existing guards, not bypass them.
- **Builds on the existing `epic` track (§18.9)**, not greenfield — the sliced-spec / one-approval / epic-child machinery already exists and is the substrate.

## Acceptance criteria

1. *(Slice A — completeness)* Given a product vision, when the engineer runs the planning entry, then the baseline produces a sprint-block artifact decomposing the MVP into prioritized features, each with explicit done-criteria (done-record, edge coverage, end-to-end wiring), and a completeness oracle that reports each feature done/not-done against those criteria.
2. *(Slice B — scheduling)* Given a sprint block, when the epic-level scheduler runs, then it emits a dependency-ordered execution plan whose concurrently-dispatched groups have pairwise-disjoint write_sets (no two parallel slices write the same path).
3. *(Slice C — parallel dispatch + RALPH)* Given an approved sliced spec with ≥2 independent slices, when dispatch runs, then N epic-child cycles execute concurrently, each in an isolated git worktree, and a child reaching an un-decidable fork yields control back to main context rather than deciding (RALPH stop-rule), with the yield recorded for arbitration.
4. *(Slice D — merge/integrate/gate-C)* Given completed parallel child worktrees, when the merge step runs, then write-set discipline is audited before changes land on the primary tree, exactly one integrate pass runs over the merged result, and a single grant-commit consent covers the merged sprint.
5. *(Slice E — Article II amendment)* Given Slice C's prototype demonstrably running concurrent child cycles, when the Article II boundary is amended, then `seed.md` is edited before `CLAUDE.md` (precedence), the amendment sanctions parallel epic-child cycles as pre-decided recipe execution, and `audit-baseline` passes with the updated hook/enforcement layer.
6. *(Cross-cutting — speed)* Given a sprint of N independent slices dispatched in parallel, then measured wall-clock approximates the slowest single slice's cycle rather than the serial sum (via the `phase_timer` timing bundle).
7. *(Cross-cutting — quality)* Given any parallel-path execution, when a slice runs, then failing-test-first, no-stubs, and no-internal-mocks all hold, and no consent gate (approve-spec, grant-commit) is bypassed.

## Open questions

- None. The three gaps surfaced at brainstorm (definition of "incomplete," the speed bar, and which quality bars survive) were closed and recorded in `docs/brief/mvp-sprint-parallel-cycles.md`.
