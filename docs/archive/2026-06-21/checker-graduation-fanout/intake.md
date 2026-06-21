# Earn the §II.A graduation in one cycle, then conditionally lift the fan-out cap to parallelize the spec-review checkers

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Velocity work ("Lever 1" — parallelize the read-only checker fan-outs) found that the real wall-clock win is **forbidden today**. The four spec-review checkers (`spec-lint`, `spec-diagram-review`, `spec-traceability-review`, `spec-shippability-review`) run serially; the two LLM-analysis ones (`spec-diagram-review`, `spec-traceability-review`) are where the minutes live. Fanning them out concurrently is exactly what `seed.md §II.A clause 6` forbids ("no second maker/checker, no fan-out, waves, or panel"), and `clause 7` gates lifting that cap behind a graduation gate that is **currently unmet**: (a) ≥3 governed maker→checker round-trips with every blocking finding mechanically grounded, (b) **zero** false-positive blocking findings across that window, (c) a clean `/security` of the checker oracle artifacts, (d) explicit maintainer ratification. No governed round-trips are on record — only the §II.A charter (`-c732`) and an advisory-only mutation oracle (`-f029`) have shipped.

Concrete scenario: a maintainer running an `intake-full` workflow waits through `spec-diagram-review` then `spec-traceability-review` back-to-back before `/approve-spec`. These are independent read-only reviews; serial execution wastes wall-clock the timing data (DP1–DP7) already flagged. But the safety architecture that would make their concurrent execution trustworthy (oracle-bound checkers, so two LLMs can't agree on a hallucinated block) does not exist yet.

## Goal

In one cycle, **earn** the §II.A graduation honestly — build the bounded oracle-bound maker/checker machinery and run ≥3 genuinely-governed round-trips — and **only if that evidence is clean**, lift the fan-out cap and parallelize the independent read-only spec-review checkers, cutting wall-clock on the review band without weakening the baseline's safety guarantees.

## Non-goals

- **Rigging the gate.** If the ≥3 round-trips produce any false-positive *blocking* finding, or `/security` on the oracle artifacts is not clean, the Article II rewrite and the fan-out **do not ship this cycle**. Landing the bounded machinery + evidence is a successful, honest outcome — not a failure.
- **Lifting Article II's core principle.** Decisions/judgment stay in main context; only pre-decided, oracle-bound read-only checker recipes fan out. The rewrite lifts the *cap* on bounded checkers (clause 6), not the principle.
- **`scout ∥ research`.** `research` consumes `docs/scout/<slug>.md` (hard DAG dependency); they cannot overlap. Out of scope.
- **`lint` parallelization.** `lint` is a per-write PostToolUse hook (`lint.cmd` is `null` here), not a phase. Nothing to parallelize.
- **An epic.** One workflow, one `approve-spec` gate, ~2h budget. No slices, no per-child approval.
- **Fanning out non-checker phases** (maker/implementation, anything that mutates state or has ordering dependencies).

## Success metrics

- Graduation evidence is **real**: ≥3 governed round-trips recorded, false-positive-block count = **0**, each blocking finding traced to a mechanical artifact. Measured via the evidence ledger the round-trips write.
- `/security` on the checker oracle artifacts: **clean** (no Critical/High). Measured via the Phase-8 report.
- IF the gate passes: review-band wall-clock on a fan-out-eligible run drops vs serial, with **byte-identical verdicts** for the mechanical checkers. Measured via `timing.md` + a determinism test.
- `audit-baseline` PASS after the (conditional) seed.md/CLAUDE.md rewrite + template-mirror sync.

## Stakeholders

- **Requester**: baseline maintainer (razieldecarte@gmail.com).
- **Reviewer**: baseline maintainer (ratifies the conditional Article II rewrite at `approve-spec`, pre-authorized conditional on the evidence ACs).
- **Operator**: the baseline harness itself (this is baseline-on-baseline self-development).

## Constraints

- **seed.md > CLAUDE.md > implementation** (Article I.4). The Article II rewrite edits `seed.md` first, then `CLAUDE.md`, then implementation; `src/seed.template.md` + `src/CLAUDE.template.md` mirrors stay byte-equal (autosynced by `scripts/build-template.sh`); `audit-baseline` enforces.
- **CLAUDE.md ≤ 40,000 chars** (Article I.6) — the rewrite must respect the size cap; overflow goes to the annex `.claude/CONSTITUTION.md`.
- **The §II.A charter substrate** is the Workflow runtime (clause names it) — the bounded round-trip runs there, not via a new declared subagent (the baseline still ships exactly one subagent until/unless the rewrite says otherwise).
- **The graduation gate is the contract.** The conditional ACs must be mechanically evaluable (counts, not judgment) so "the evidence is clean" is checkable, not asserted.
- **Ratification mechanism**: pre-authorized at `approve-spec` — approving the spec ratifies the conditional rewrite, contingent on the evidence ACs passing.

## Acceptance criteria

1. **Bounded round-trip exists.** Given a spec-review checker task, when the maker/checker round-trip runs, then it uses exactly one maker and one checker (no fan-out), on the Workflow runtime, conformant to §II.A clauses 1–6. (Testable: a guard/test rejects a >1 maker or >1 checker configuration while the cap is in force.)
2. **Oracle-binding contract.** Given a checker finding, when it is classified, then a finding backed by a concrete mechanical artifact MAY be `blocking` and a bare LLM assertion is `advisory` (→ backlog) and can never block. (Testable: a finding lacking an artifact pointer cannot be emitted as blocking.)
3. **Governed-evidence ledger.** Given ≥3 governed round-trips on real checker tasks, when they complete, then an evidence ledger records, per round-trip, the blocking findings + their mechanical grounding + the false-positive-block count, and the aggregate false-positive-block count is **0**. (Testable: ledger schema + an evaluator that computes the aggregate.)
4. **Clean security of oracle artifacts.** Given the checker oracle artifacts, when `/security` reviews them, then there are no Critical/High findings. (Testable: Phase-8 report verdict.)
5. **Gate evaluator is mechanical.** Given the evidence ledger + the `/security` verdict, when the gate is evaluated, then it returns pass/fail from counts alone (≥3 round-trips ∧ 0 false-positive blocks ∧ security clean) with no LLM judgment in the decision path. (Testable: evaluator unit tests, including a false-positive-block → FAIL case.)
6. **Conditional Article II rewrite.** Given the gate evaluator returns **pass**, when the rewrite is applied, then `seed.md` §II.A is amended to lift the clause-6 fan-out cap for oracle-bound read-only checkers (the `-9360` rewrite), `CLAUDE.md` Article II is updated to match, the `src/*.template.md` mirrors are byte-equal, and `audit-baseline` PASSes. (Testable: audit + mirror-equality.)
7. **Conditional fan-out.** Given the rewrite landed, when an `intake-full`/`spec-entry` workflow reaches the spec-review band, then the independent read-only checkers run concurrently and the mechanical checkers' verdicts are **byte-identical** to a serial run. (Testable: determinism test comparing serial vs parallel verdict artifacts.)
8. **Honest-stop path.** Given the gate evaluator returns **fail**, when the workflow proceeds, then neither the Article II rewrite nor the fan-out is present on disk, AND the bounded machinery + evidence ledger still land. (Testable: a fail-injected run leaves seed.md/CLAUDE.md Article II unchanged.)
9. **Cap stays enforced until lifted.** Given the rewrite has NOT landed (gate unmet or pre-rewrite), when any fan-out of checkers is attempted, then it is rejected. (Testable: the clause-6 guard from AC-1 blocks fan-out pre-rewrite.)

## Open questions

- Exactly which of each checker's findings are artifact-backed (blocking) vs assertion (advisory) — the per-checker oracle-binding map. Resolved during `/scout` + `/spec` (this is the load-bearing correctness design).
- What the "real checker tasks" for the ≥3 governed round-trips are — ideally the checkers reviewing real specs in this very cycle (e.g. this workflow's own spec), so the evidence is genuine, not synthetic.
- Whether `audit-baseline` already covers the seed↔CLAUDE↔mirror equality for an Article II edit, or needs an added assertion.
- Phase-6 swarm-vs-solo — expected solo (tightly coupled, governance-sensitive); confirm at Phase 6.
