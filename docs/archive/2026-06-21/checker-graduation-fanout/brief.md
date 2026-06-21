# Brief — checker-graduation-fanout

> Captured in-session (brainstorm brief + governance decision dialogue, 2026-06-22). `skip_brainstorm: true` is set on this workflow because requirement capture for this slug was completed interactively this session — including the Socratic gap-analysis that produced the predecessor brief `parallel-readonly-checker-fanout.md` and the constitutional governance fork the maintainer resolved.

## actor

Engineer running a baseline workflow (baseline-on-baseline development), and the baseline maintainer acting in their governance role (owner of `docs/init/seed.md`).

## trigger

Velocity work ("Lever 1" — parallelize the read-only checker fan-outs) discovered that the real wall-clock win (fanning out the LLM-analysis spec-review checkers concurrently) is **forbidden today** by seed.md §II.A clause 6 ("no fan-out") and gated by clause 7 (the graduation gate). The maintainer chose to **earn** the amendment in one cycle rather than ship only the small mechanical win or override the gate.

## current_state

- seed.md §II.A permits exactly ONE bounded maker + ONE checker round-trip on the Workflow runtime; fan-out / waves / panels are forbidden (clause 6).
- The four spec-review checkers (`spec-lint`, `spec-diagram-review`, `spec-traceability-review`, `spec-shippability-review`) run serially: the two mechanical ones are Node scripts; the two LLM-analysis ones run inline in main context. Only `spec-shippability-review` is a workflow node; the others are ad-hoc.
- No governed maker→checker round-trips are on record, so the clause-7 graduation gate (a: ≥3 governed round-trips, b: zero false-positive blocks, c: clean /security on oracle artifacts, d: maintainer ratification) is **unmet**.

## desired_state

In ONE intake-full cycle:
1. Build the bounded single-maker/single-checker round-trip for the spec-review checkers, **oracle-bound** (the `-d186` proof-obligation contract: a concrete mechanical artifact MAY block; a bare LLM assertion is advisory→backlog only). This is `-4c43` (RALPH loop + stop rule + arbitration) and `-d186` (oracle-bound checkers) in bounded form.
2. Run **≥3 genuinely-governed round-trips** on real checker tasks; record mechanical grounding + false-positive-block count (clause 7 a/b evidence). The round-trips must be real — capable of producing a false positive — so passing is meaningful.
3. Run `/security` on the checker oracle artifacts (clause 7c).
4. **Conditionally** (only if the evidence is clean): perform the `-9360` permanent Article II rewrite (seed.md → CLAUDE.md → implementation) lifting the fan-out cap, then build the parallel checker fan-out (Lever 1's real win).

## non_goals

1. **The graduation gate stays real.** If the ≥3 round-trips do not come out clean (any false-positive *blocking* finding) or `/security` on the oracle artifacts is not clean, the Article II fan-out rewrite **does NOT ship this cycle** — we land the bounded machinery + the evidence, and the rewrite waits. Honest outcome, not a workflow failure. No rigging the round-trips to pass.
2. **Verdicts stay byte-identical to serial** for any parallelized mechanical checker (engineer-emphasized primary non-goal from the predecessor brief): no nondeterminism, no dropped findings.
3. **Article II's core preserved even after the rewrite:** decisions/judgment stay in main context; only pre-decided, oracle-bound read-only checker recipes fan out. The rewrite lifts the *cap* on bounded checkers, not the principle.
4. **scout ∥ research is OUT** — `research` consumes `docs/scout/<slug>.md` (hard DAG dependency); they cannot overlap.
5. **`lint` is OUT** — it is a per-write PostToolUse hook, not a phase, and `lint.cmd` is `null` in this repo.
6. **Not an epic.** One workflow, one approve-spec gate, ~2h budget accepted by the maintainer.

## solution_leakage

Request is heavily solution-shaped (parallelize, fan-out, subagent, maker/checker, RALPH, oracle-bound). The mechanism is partly pre-decided by the v1 vision doc (`docs/vision/baseline-v1-thought-compiler.md` Part 5) and the §II.A charter; `/spec` finalizes the bounded substrate, the oracle-binding contract, the graduation-evidence harness, and the conditional-rewrite ACs.

## open_questions

- (a) Substrate for the bounded round-trip: Workflow runtime (`§II.A` already sanctions this) vs Task-tool agents. §II.A names the Workflow runtime explicitly → likely that.
- (b) What exactly counts as "mechanically grounded" for each of the 4 checkers (which findings are artifact-backed/blocking vs assertion/advisory) — this is the oracle-binding design, the load-bearing correctness work.
- (c) How clause 7(d) ratification is encoded: **resolved** — pre-authorized at `approve-spec`, conditional on the evidence ACs mechanically passing. The spec must make the Article II rewrite an AC gated on the evidence ACs.
- (d) Phase-6 swarm-vs-solo: likely solo (tightly-coupled, governance-sensitive, constitution-altering) — confirm at Phase 6.
