# Fix the vitest reporter flag and close the docs-only chore verify trap

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

Two defects, one in the recommender and one in the chore-track contract, surface together when a consumer repo runs a documentation-only chore.

1. **Stale vitest reporter.** `claude-automation-recommender/SKILL.md:45` recommends `test_cmd: "vitest run --reporter=basic"`. The `basic` reporter was removed in vitest v4.x, so the command errors at startup (exit 1). Every consumer who runs `/init-project` on a vitest project inherits a `project.json → test.cmd` that fails before any test runs.

2. **Docs-only verify trap.** The chore track makes `verify` mandatory (`chore/SKILL.md:45`). Its PASS rule (`verify/SKILL.md:34`) is `PASS iff exit 0 AND ≥1 test executed AND no test failed` — which assumes `test.cmd` is a whole-repo sanity check. When a consumer wires `test.cmd` to a narrow behavior suite (e.g. vitest unit tests), a pure-docs chore has no test that exercises a Markdown file, so `verify` stamps FAIL and the chore dead-ends before `memory-flush`/`commit`. Concretely: a maintainer writes `docs/sitemap.md` via the chore track, the doc is correct, but the mandatory `verify` runs the behavior suite, finds nothing covering the doc, stamps FAIL, and the workflow halts with no path to commit.

## Goal

A documentation-only chore can complete and commit without being blocked by a test gate that cannot apply to it, and a fresh vitest install gets a `test.cmd` that actually runs — while real code changes keep their full verification.

## Non-goals

- Do **not** change the `verify`/`integrate` verdict PASS rule (`exit 0 AND ≥1 test executed AND nothing failed`). Only change *when* `verify` runs in the chore track, not how it decides PASS/FAIL.
- Do **not** alter `verify` behavior in any other track (`tdd-quickfix`, `spec-entry`, `freeform`, `epic`, `epic-child`). Scope the conditionality to the chore track only.
- Do **not** change the shipped default `test.cmd` (the baseline audit) in the `project.json` templates. Only the recommender's stale reporter flag changes.
- Do **not** auto-classify "behavior suite vs structural check" with a heuristic. Rely on `/triage` recording the explicit exception.

## Success metrics

- Vitest reporter validity — baseline: `--reporter=basic` (errors at startup on vitest v4), target: a reporter valid in vitest v4, measured via: the recommended command running to a clean exit on a vitest v4 project.
- Docs-only chore completion — baseline: a pure-docs chore on a behavior-suite repo dead-ends at `verify` (FAIL, no commit path), target: the chore reaches `memory-flush`/`commit` because `/triage` excepts `verify` for the pure-docs write_set, measured via: a new invariant test asserting `/triage` adds `verify` to `exceptions` for a pure-docs chore on a behavior-suite repo.
- Constitution mirror parity — baseline/target: `docs/init/seed.md` ↔ `CLAUDE.md` ↔ `src/CLAUDE.template.md` remain in sync after the amendment, measured via: the existing `seed-template-parity` / `article-iv-mirror` invariant tests staying green.

## Stakeholders

- **Requester**: Tushar Srivastava (razieldecarte@gmail.com)
- **Reviewer**: Tushar Srivastava (solo baseline maintainer; approves the spec at gate A)
- **Operator** (who runs it in prod): baseline maintainer + downstream consumer-repo developers who run `/init-project` and the chore track

## Constraints

- This amends the constitution. Per Article I.4 precedence, the change starts in `docs/init/seed.md`, then propagates to `CLAUDE.md` (and its byte-equal mirror `src/CLAUDE.template.md`), then to the `chore` SKILL and `/triage` logic.
- `CLAUDE.md` is capped at 40,000 characters (`audit-baseline` FAILs above it); the byte-equal mirror `src/CLAUDE.template.md` must stay identical.
- The exemption boundary is **pure-docs/prose only**: every changed path must be documentation/prose. Any code/config/script touch keeps the gate active.
- The exception must be recorded by `/triage` (the only sanctioned writer of `workflow.json → exceptions`), not invented by the chore skill at run time.

## Acceptance criteria

1. Given the recommender SKILL, when its recommended `test_cmd` is read, then it specifies a reporter valid in vitest v4 (not `basic`) — verified by a test asserting `claude-automation-recommender/SKILL.md` no longer contains `--reporter=basic`.
2. Given a chore whose write_set is pure-docs/prose only on a repo whose `test.cmd` is a behavior suite, when `/triage` classifies it onto the chore track, then `verify` is added to `workflow.json → exceptions` — verified by a test exercising that triage path.
3. Given a chore whose write_set touches any code/config/script file, when `/triage` classifies it onto the chore track, then `verify` is **not** excepted (remains mandatory) — verified by the complementary test.
4. Given the amended constitution, when `audit-baseline` and the mirror-parity tests run, then `docs/init/seed.md`, `CLAUDE.md`, and `src/CLAUDE.template.md` are consistent and `CLAUDE.md` is ≤ 40,000 chars — verified by the existing invariant tests staying green.
5. Given the chore skill, when it runs and `verify` is in `exceptions`, then it does not stamp a FAIL verdict for a docs-only diff and proceeds to the remaining mandatory phases — verified by a chore-track behavior test.

## Open questions

- Detection mechanism for "test.cmd is a behavior suite (not a structural/whole-repo check)" is deferred to `/spec` (the brief's solution-leakage notes flag it). The chosen approach must honor the non-goal of "no heuristic auto-classification" — i.e. the signal that makes `/triage` except `verify` needs to be explicit, not inferred. `/research` and `/spec` resolve how `/triage` knows the repo's `test.cmd` is a behavior suite vs the baseline audit.
