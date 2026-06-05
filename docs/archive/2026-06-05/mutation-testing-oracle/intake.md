# Add a mutation-testing oracle that surfaces surviving mutants as a test-quality signal

<!--
Intake document. Produced by the `intake` skill.
Brainstorm brief: docs/brief/mutation-testing-oracle.md
Backlog: mutation-testing-oracle-for-tdd-checker-f029 (v1 thought-compiler, slice A)
-->

## Problem

The baseline's only test-quality signal is pass/fail from `node --test` — it does not even run line coverage. There is no mechanical way to distinguish a strong test suite from a weak one, so **vacuous tests pass undetected**: a test that would still pass if the code under test were broken looks identical to a real one. This bites in two concrete places: during `/tdd`, a green suite can hide a real gap; at `/verify`/`/integrate`, a passing run gives confidence the tests have not earned. For the v1 thought-compiler, the maker/checker loop needs a test-quality oracle a model cannot satisfy by writing shallow tests — but the problem is real on the baseline's own suite today, not only as future infrastructure.

## Goal

Give the baseline a scoped mutation-testing run that surfaces concrete surviving mutants as actionable findings, fast enough to use inside the TDD/verify loop, so weak or vacuous tests become visible.

## Non-goals

- Whole-repo mutation on every run (hours of runtime) — scoping to changed files or a named target module is required.
- Gating commits or CI on a mutation-score threshold now — output is advisory first; a blocking gate is a separate later decision.
- The configurable per-checker floor/ceiling tier dial (backlog `-1a2d`) — this cut hardcodes sane defaults; the dial configures this oracle later.
- Replacing the `node --test` suite or adding general coverage tooling — this is an added signal, not a replacement.

## Success metrics

- Surviving-mutant visibility — baseline: none (no mutation tooling), target: a run reports concrete survivors (file + line + mutation kind), measured via: the oracle's own output on a chosen module.
- Weak-test detection — baseline: vacuous tests pass invisibly, target: a deliberately-vacuous test on a target module produces ≥ 1 surviving mutant the oracle flags, measured via: a fixture/dogfood run.
- Run tractability — baseline: N/A, target: a scoped run completes in seconds-to-low-minutes (not hours) on a single module, measured via: wall-clock on the chosen scope.

## Stakeholders

- **Requester**: Tushar Srivastava (maintainer, razieldecarte@gmail.com).
- **Reviewer**: Tushar Srivastava (approves spec at gate A; codesign decisions are his to make).
- **Operator** (who runs it): Claude in `/tdd` + verify/integrate; the maintainer ad hoc on the baseline suite.

## Constraints

- **Bare `node --test` runner, no framework.** The suite is `node --test --test-reporter=spec tests/*.test.mjs` — no Jest/Mocha/Vitest. The chosen mutation tool must support this (or a wrapper must bridge it). Verify the actual API via context7 in `/research` — no training-data recall.
- **New dev-dependency for a meta-repo.** Adding a mutation tool (likely Stryker) pulls a dependency tree into a repo whose current devDeps are only eleventy/semantic-release/nunjucks. The dependency's footprint + supply-chain risk is in scope for `/security`.
- **Runtime budget.** ~837 tests; naive mutation = one suite-run per mutant. Scoping is mandatory, not optional, for the oracle to be usable.
- **Shippability.** Any helper added under `.claude/skills/<slug>/` must be `.mjs`/`.sh` (no new Python); runtime invocations in shipped SKILL.md prose must not reference dev-tree paths (the spec-shippability review enforces this).
- **codesign_mode is ON.** The tool choice, scoping strategy, and integration seam are captured as `## Decisions` with the engineer's verbatim rationale at `/spec` Step 1.5.

## Acceptance criteria

1. Given a target module with a real test, when the oracle runs scoped to that module, then it reports a mutation result including any surviving mutants as `file:line:mutation-kind`, and exits cleanly.
2. Given a deliberately-vacuous test over a target module, when the oracle runs, then at least one surviving mutant is reported (the weak test is detected) — where the pass/fail suite stayed green.
3. Given the scoping mechanism, when the oracle is invoked, then it runs only the selected scope (changed files or a named module), not the whole repo.
4. Given the baseline's `node --test` runner, when the oracle runs, then it drives that runner (directly or via a documented bridge) with no Jest/Mocha/Vitest dependency introduced.
5. Given the advisory-first non-goal, when the oracle produces findings, then they are reported (not committed-blocking) and do not flip any existing verify/commit gate by themselves.
6. Given the full suite + `audit-baseline`, when the change lands, then both stay green/PASS and any new helper obeys the shippability rules.

## Open questions

- Which mutation tool actually supports a bare `node --test` runner with no test framework? Stryker is the candidate but is framework-runner oriented — `/research` must verify via context7 whether its command/custom runner fits, or whether a lighter tool/approach is needed.
- What is the scoping unit — changed files (git diff) vs a named target module vs per-skill directory? Affects the oracle's CLI/interface.
- Where does the oracle live and report — a `/verify` sub-check, a standalone npm script, or a new skill/hook? (codesign decision at `/spec`.)
- Is there a meaningful subset of the repo to dogfood first (e.g. one `.claude/skills/*/*.mjs` helper with good tests) for AC-002?
