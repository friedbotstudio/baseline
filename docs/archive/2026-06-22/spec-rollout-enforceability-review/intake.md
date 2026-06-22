# Make Rollout prerequisites mechanically enforceable before a spec is approved

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

A spec's `## Rollout` section routinely names preconditions that must hold for the change to work in production — a deploy setting, a data migration, a feature flag, an external service that must be reachable. Today these live in free prose. Nothing mechanically checks that each named precondition is actually backed by an enforcement mechanism in the same spec, so a precondition can be approved, shipped, and then fail silently in production.

The concrete origin: on 2026-05-14 a spec's Rollout section named the GitHub Pages `build_type=workflow` precondition. It was judgment-flagged three separate times during review as "this needs to be enforced," yet it was never given an enforcement-type acceptance criterion. It shipped unenforced and the Pages deploy silently did the wrong thing. The reviewer at `/approve-spec` has no mechanical signal that a prerequisite is un-backed — the free prose reads fine.

This is the silent-failure class tracked as pending-question Q-002, resolved by the user on 2026-06-10 to "option (b) with a sliver of (a)" and queued as backlog `-419d`.

## Goal

Every Rollout precondition in a spec is provably tied to a mechanism that enforces it before that spec can be approved — so an un-backed precondition is caught at review time, not in production.

## Non-goals

- **No retroactive sweep.** Already-approved and archived specs are not revisited; the concern binds new specs going forward only.
- **No LLM-judgment blocking.** A precondition left in free prose surfaces as advisory and never hard-blocks. Only a structured, mechanically-checkable signal may block — two LLMs agree on hallucinations, so judgment-only findings stay advisory (the maker/checker proof-obligation contract).
- **Not part of the v1 thought-compiler epic.** This ships standalone and useful now; the epic's oracle-bound-checker slice may later absorb it by reference.
- **Not a redesign of the Rollout section's other content** (rollback plan, sequencing) — only the prerequisites get a structured, enforceable shape.

## Success metrics

- Un-backed Rollout preconditions blocked at review — baseline: 0% caught mechanically (the Pages bug passed 3 human flags), target: 100% of structured prerequisites with a missing/dangling/non-enforcement binding produce a BLOCKER, measured via the checker's test suite.
- The origin bug closed — baseline: GitHub Pages `build_type=workflow` precondition unenforced, target: backed by a real enforcement mechanism, measured via that mechanism existing and being exercised.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer, razieldecarte@gmail.com) — raised Q-002, validated option (b) on 2026-06-10.
- **Reviewer**: Tushar Srivastava — the `/approve-spec` gate operator this checker serves.
- **Operator** (who runs it in prod): the harness `checker-fanout` runner at the spec-review boundary; no separate human operator (the checker is a deterministic script).

## Constraints

- **Oracle-bound from day one.** The blocking signal must be a concrete structured artifact the checker reads mechanically, not a prose scan. Per the proof-obligation contract: artifact present → may block; bare assertion → advisory.
- **Plugs into the existing fan-out.** The checker joins `harness/checker-fanout.mjs` `DEFAULT_CHECKER_REGISTRY` as a peer of `spec-diagram` and `spec-traceability`, reusing the `normalizeFinding` / tier-dial BLOCKER-vs-ADVISORY shape so its verdicts merge deterministically.
- **Hard-block parity.** A BLOCKER must gate `/approve-spec` the same way the other spec-review BLOCKERs do (the spec-review hook path), not a new bespoke gate.
- **Spec-format change ripples.** Amending the `## Rollout` shape touches the spec template, `artifact_template_guard` / `spec-lint` expectations, and every future spec author — the change must stay consistent with those guards.
- **Baseline-owned shipped files.** New skill + helper land under `.claude/skills/` (shipped helpers are `.sh` or `.mjs`/`.js`), require a `manifest.json` rebuild, and must pass `audit-baseline`.

## Acceptance criteria

1. Given the spec template, the `## Rollout` section defines a **structured prerequisites block** — one row per prerequisite, each row carrying an explicit `enforced-by:` field — distinct from the free-prose rollback/sequencing content.
2. Given a spec whose prerequisites block has a row with an empty or missing `enforced-by` value, when the checker runs, then it emits a **BLOCKER** finding naming that row.
3. Given a row whose `enforced-by: AC-NNN` names an acceptance criterion that does not exist in the spec, when the checker runs, then it emits a **BLOCKER** (dangling pointer).
4. Given a row whose `enforced-by: AC-NNN` resolves to an existing AC that is **not** an enforcement-type AC (preflight / smoke / error-mapping), when the checker runs, then it emits a **BLOCKER** (the load-bearing check: the pointer must resolve to an enforcing AC, not any AC).
5. Given a precondition that appears only in free prose (not in the structured block), when the checker runs, then it emits an **ADVISORY** and never a BLOCKER.
6. Given a spec whose every prerequisite row has a non-empty `enforced-by` resolving to a real enforcement-type AC, when the checker runs, then it emits **CLEAN** (no findings).
7. Given a checker run that produces a BLOCKER, when `/approve-spec` is attempted for that spec, then approval is hard-blocked through the existing spec-review BLOCKER path (no bespoke gate).
8. Given the harness spec-review boundary with the fan-out enabled, when the fan-out runs, then the new checker executes as a registered adapter in `DEFAULT_CHECKER_REGISTRY` and its verdict merges deterministically with the other checkers.
9. Given the GitHub Pages `build_type=workflow` precondition (the origin bug), when the remediation lands, then that precondition is backed by a real enforcement mechanism (a preflight in `release.yml` and/or `scripts/bootstrap-pages.mjs`) that fails fast when the precondition is absent.

## Open questions

- **How does the checker mechanically recognize an AC as "enforcement-type"?** The decision (Q-002 option b) names preflight / smoke / error-mapping as the enforcing kinds. Recognition must itself be mechanical (a structured AC tag/field is an oracle; a prose-keyword scan is fragile LLM-adjacent judgment). The exact structured signal is a `/research` + `/spec` design decision.
- **Does the origin-bug remediation (AC-9) belong in this workflow or a follow-up?** The brief folds it in; confirm in `/spec` whether `scripts/bootstrap-pages.mjs`, a `release.yml` preflight, or both are in scope here versus split to a separate intake.
