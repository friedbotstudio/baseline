# Brainstorm brief — tier-oracle-floor-dial

## Actor

The baseline checker skills that run quality gates — the mutation oracle today; spec-lint, spec-shippability-review, security, simplify, code-structure — plus the main-context harness that reads per-checker thresholds. On behalf of the baseline maintainer who needs each checker's quality floor and effort ceiling pinned as project config rather than decided per run.

## Trigger

When any checker runs and needs to know its quality floor (the bar a result must clear) and its effort ceiling (how hard to search before stopping). Today the mutation oracle is floorless, so both are per-run LLM judgment instead of pinned config.

## Current State

No tier/floor/ceiling keys exist in project.json. The mutation oracle (piece 3, shipped 6c85282) is floorless and advisory-only — it lists surviving mutants but reads no threshold and never compares against a bar. Each checker that has quality/effort knobs decides them per run (LLM judgment), so the same checker can apply a different bar on different runs.

## Desired State

A tier config dial lives in project.json: a tier selects, per checker, a floor (quality threshold) and a ceiling (effort budget). A single accessor is the one read path every checker uses to get its floor/ceiling. ALL existing checkers are wired to read their floor/ceiling from the dial this slice (not just the mutation oracle). The mutation oracle reads its floor and SURFACES the comparison — it reports the floor it read and how the current mutation result sits against it (score vs floor) — while changing no pass/fail verdict.

## Non Goals

- Making any checker BLOCK or fail below its floor — the stop-rule / enforcement is piece 5 (maker-checker RALPH loop).
- Encoding or enforcing the which-oracles-are-mandatory-vs-advisory semantics beyond what the accessor needs to return values.
- Reactivity or any v2 signal-driven behavior.
- Changing any existing checker pass/fail outcome or verdict.
- The proof-obligation (artifact->block, assertion->advisory) contract refit — that is piece 4.

## Solution Leakage

- Request is solution-framed (descends from the vision doc): names project.json keys, a tier->floor/ceiling schema, an accessor, and the mutation oracle reading its floor. Underlying need captured above: a single pinned per-project source of truth for each checker's quality bar and effort budget, so those stop being per-run judgment.
- OPEN: for non-numeric checkers (spec-lint, spec-shippability-review, security, simplify, code-structure) what does wired-to-read-its-floor/ceiling mean concretely this slice — read+surface the values, or is the accessor returning their config enough? Spec must define the per-checker wired contract.
- OPEN: is tier set once per project (a profile) with per-checker floor/ceiling values, or per-checker tier? Vision implies a project-level tier selecting a profile plus per-checker floor/ceiling. Spec must pin this.
- SCOPE NOTE (user-confirmed): all-checkers-wired-now enlarges this slice beyond the vision's pure-config-tiny framing and overlaps piece 4; captured deliberately.
