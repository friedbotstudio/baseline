# Brainstorm brief — mutation-testing-oracle

## Actor

Claude in the /tdd and verify/integrate path, plus the maintainer dogfooding the oracle on the baseline's own node --test suite. (Framed as v1 thought-compiler groundwork, but with present-day utility — not future-only.)

## Trigger

When a green `node --test` run hides a real gap because the tests are vacuous (they would still pass if the code under test were broken). Bites during /tdd (false-green suite) and at verify/integrate (false confidence from a passing run).

## Current State

Pass/fail is the only test signal; the project does not even run line coverage. There is no mechanical way to tell a strong test suite from a weak one, so vacuous tests pass undetected.

## Desired State

A SCOPED mutation run surfaces concrete surviving mutants (file + line + mutation kind) as actionable findings, fast enough to sit inside the TDD/verify loop. A module with vacuous tests shows survivors where line coverage would have looked fine.

## Non Goals

- Whole-repo mutation on every run (hours of runtime) — scoping to changed files / a target module is required.
- Gating commits or CI on a mutation-score threshold now — advisory output first; blocking is a separate later decision.
- The configurable per-checker floor/ceiling tier dial (backlog -1a2d) — this cut hardcodes sane defaults.
- Replacing the node --test suite or adding coverage tooling — this is an added signal, not a replacement.

## Solution Leakage

- wire mutation testing
- Stryker as the mutation tool
- mutation score as the metric
