# Enforcement oracle framework — land C2 + C3 + C4 on one shared oracle interface

<!--
Intake document. Produced by the `intake` skill.
Source: docs/roadmap-execution-plan.md → Epic 3 (Enforcement half) → C2, C3, C4.
-->

## Problem

Epic 3 — "the bar gets enforced" — is half-built. A checker framework exists but it enforces conformance, not quality, and its self-correcting loop is a single round:

- **C2 (partial).** `checker-fanout.mjs` fans out two read-only spec-review oracles (`spec-diagram-review`, `spec-traceability-review`) and merges their verdicts. But the three heavy review skills — `security`, `simplify`, `code-structure` — still run as prose advice, not oracle-bound checkers on that interface. Three diagram checks are also deferred: class-to-DDL, AC-to-sequence, Container-to-Component.
- **C3 (partial).** `maker-checker.mjs` + `evidence-ledger.mjs` + `graduation-gate.mjs` give one bounded maker→checker round-trip. There is no multi-round loop, no stop rule, and no arbitration — so a checker that stays RED across rounds has nowhere to escalate.
- **C4 (absent).** There is no quality oracle *with teeth*. B1 (landed in `f1faf75`) makes every UI spec declare a Reference target, but nothing yet captures the rendered screen and scores it against that target. Two LLMs left to converse will agree on a hallucination; without a mechanical oracle the pipeline files advisories instead of failing the build.

Concretely: a UI change today can pass `verify` while looking nothing like its declared reference, and a review checker that flags a real defect can be silently downgraded to advisory. The enforcement half cannot fail a build for a quality reason.

## Goal

The pipeline gains one shared oracle interface on which review checkers, a bounded maker/checker loop, and a rendered-UI design-judge all run — and it can FAIL a build for a quality reason (a below-threshold render), not just an advisory.

## Non-goals

- **Not** removing or weakening any existing consent gate, or changing the human's final authority (Article X).
- **Not** adding a second subagent — checkers are oracle-bound read-only fan-out under §II.A; the one-subagent count (`swarm-worker`) holds and judgment stays in main context (Article II).
- **Not** auto-remediating what a checker finds — the framework scores and yields; fixes route through `/tdd` or a human.
- **Not** building the gate-taxonomy (C6) or any autonomy layer — that is deliberately later.
- **Not** a general visual-regression suite — the design-judge scores against the spec's declared reference target, not an arbitrary golden-image bank.
- **Not** turning `security` read-only-ness off — refitting it as a checker keeps it read-only (it emits a verdict, never a fix).

## Success metrics

- Oracle-bound checkers on the shared interface — baseline: 2 (`spec-diagram`, `spec-traceability`), target: ≥ 5 (add `security`, `simplify`, `code-structure`), measured via: `checker-fanout.mjs` registry.
- Deferred diagram checks implemented — baseline: 0 of 3, target: 3 of 3 (class-to-DDL, AC-to-sequence, Container-to-Component), measured via: checker test suite.
- A below-threshold rendered screen FAILS `verify` — baseline: impossible (no design-judge), target: demonstrated by a failing test, measured via: the design-judge's `last_test_result` FAIL path.
- A ceiling-hit-below-floor maker/checker outcome yields to a human as RED — baseline: no multi-round loop, target: demonstrated, measured via: the stop-rule test (never a silent advisory downgrade).

## Stakeholders

- **Requester**: repo maintainer (razieldecarte@gmail.com).
- **Reviewer**: repo maintainer — gate A (`/approve-spec`) and gate C (`/grant-commit`).
- **Operator**: the harness / this Claude Code session — runs the checkers in-loop at the spec-review and verify boundaries.

## Constraints

- Touches `.claude/hooks/**` and `.claude/skills/**` — both `project.json → security.sensitive_globs`, so `/security` is mandatory and every baseline-owned file edit forces an `npm run build` manifest re-hash.
- New Playwright integration for C4. The `playwright` MCP is already declared in `.mcp.json` (no new dependency to add); the design-judge must degrade gracefully when Playwright is unavailable (e.g. headless CI without a browser) — absence is a skip, never a false FAIL.
- Article II / §II.A: checkers are oracle-bound and read-only; they gather and score, main context decides. No binding judgment routes through a subagent. The one-subagent count is invariant.
- Must not regress the existing `checker-fanout.mjs` CLEAN/BLOCKED contract that `spec_approval_guard` reads at gate A, nor the fail-open behavior of the velocity levers.
- Monolithic landing (user's explicit choice over an epic): one spec, one large diff, one commit.

## Acceptance criteria

1. Given the shared oracle-checker interface, when a checker is registered, then it exposes a uniform contract (id, a read-only run producing a typed verdict {status, findings[]}, and a merge into the fan-out) — verified by a conformance test exercised by every checker.
2. Given the `security`, `simplify`, and `code-structure` review skills, when run through the fan-out, then each emits a typed verdict on the shared interface (read-only; no file mutation) and appears in the `checker-fanout.mjs` registry.
3. Given a spec with a class diagram, an AC table, and C4 Component + Container diagrams, when the deferred diagram checks run, then class-to-DDL mismatch, an AC with no matching sequence, and a Container component absent from the Component diagram are each reported as findings.
4. Given a maker/checker round-trip that stays below the graduation floor after the configured maximum rounds (ceiling-hit-below-floor), when the stop rule fires, then the outcome is a RED state that yields to a human — never a silent downgrade to advisory and never a PASS.
5. Given a maker/checker disagreement within the round budget, when arbitration runs, then a deterministic, recorded arbitration decision is appended to the evidence ledger (auditable diff, never a silent mutation).
6. Given a rendered UI surface and its spec's B1 Reference target, when the design-judge runs, then Playwright captures the screen, the judge scores it against the reference target, and a score below the configured threshold writes a FAIL verdict to `last_test_result` (fails `verify`).
7. Given the design-judge on a host where Playwright cannot launch a browser, when it runs, then it SKIPs with a recorded reason and does not emit a false FAIL.
8. Given the whole framework, when the full suite and `audit-baseline` run, then both are green and the one-subagent count and all consent gates are unchanged (Article II / X invariants hold).

## Open questions

- **Design-judge scoring model + threshold.** How the judge converts a rendered screen + reference target into a score (structural/heuristic vs. an LLM-vision pass), and where the pass/fail threshold lives (`project.json`). Load-bearing for AC-006 — settle in `/research` and record the decision in the spec.
- **Stop-rule round budget + arbitration policy.** The maximum maker/checker rounds and how arbitration breaks a maker↔checker tie (a third independent checker? a floor comparison?). Settle in `/research`/`/spec`; AC-004/AC-005 depend on it.
- **Checker interface shape vs. the existing fan-out.** Whether the uniform contract extends `DEFAULT_CHECKER_REGISTRY` in `checker-fanout.mjs` as-is or generalizes it. Resolve in `/scout` + `/spec` — must not regress the gate-A CLEAN/BLOCKED contract.
