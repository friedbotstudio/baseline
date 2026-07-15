# Baseline — execution roadmap

This is the delivery tracker for the repo, written in the format the tooling parses. `standup` reads
progress from it, `sprint-planner` computes per-task readiness from it, and `roadmap-sync` (Phase 10.6)
writes back to it, flipping the tasks named in `workflow.json → roadmap_tasks[]` from planned to done
and promoting the epic heading as its body fills in.

It is the single live plan. Two programs used to be tracked separately and turned out to be one: the
disease-cure change-orders in `docs/handoff/` and the v1 thought-compiler epic in
`.claude/memory/backlog.md`. Decision Ledger #0002 said so directly — "V1 and V2 share a spine; the
roadmaps thought to be parallel converge at classification." The quality-oracle change-order and the
oracle-bound-checker backlog children are therefore one line item here, not two.

The reasoning behind each change-order is not in this file. It lives in
`docs/handoff/baseline-system-redesign-roadmap.md` and the briefs beside it. This file records only
what is done, what is next, and what blocks what.

Status markers are planned, in progress, and done. A task carries exactly one. An epic heading carries
the roll-up of its body.

## Progress

- Epics 2 and 3 form one loop, and that loop is the center of the plan. The bar a human sets upstream
  (Epic 2) is the rubric a machine oracle enforces downstream (Epic 3). Epics 4, 5, and 6 sit around it.
- Critical path: B1 (spec quality floor), then C4 (design-judge). C4 hard-depends on B1 for its rubric
  and on nothing else. Without that anchor the judge has nothing to score against.
- Epic 2's classifier extends machinery already on disk. The threat/value tier dial is the mechanical
  floor Decision Ledger #0002 D8 asks for, so A1 should widen it instead of standing up a second
  classifier.
- Epics 3, 4, and 5 each carry landed work. Epic 6 is carried debt and blocks nothing.

## Epic 1 — Foundations landed  ✅  (landed)

Standing policy and the periphery amendments. All landed; kept here for the record.

- ✅ F1. Phase 0 freeze on machine-churn — stop starting governance/tooling/roadmap workflows unless a product workflow is provably blocked. Standing policy, recorded in `decisions.md → freeze-machine-churn-2026-07-09`.
- ✅ F2. context7 becomes an outcome-mandate, not a tool-mandate (Article VI.5). Any current-docs source satisfies it; no irreplaceable dependency.
- ✅ F3. Read before overwrite (Article VI.7) — Write refuses to blind-overwrite an unread file.
- ✅ F4. Research retrieve-first — `research/retrieve.mjs` grounds the memo in fetched docs rather than training-data recall.
- ✅ F5. YAGNI positive-purpose reframe (Article VI.4) — YAGNI gates speculation beyond the approved spec; it never authorizes deferring spec-committed scope.

## Epic 2 — Input half: the bar gets set  🟡  (input)

Thin human input yields a thin spec, and a thin spec passes every downstream gate. This epic makes
authorization mean demonstrated understanding plus risk acceptance (Decision Ledger #0002), then
encodes that bar in the spec artifact so the enforcement half has something real to score against.

- ⬜ A1. Governance Class classifier with a mechanical floor from blast radius. EXTEND the shipped threat/value tier dial (`project.json → security.tier`, already read by the checker fan-out; `decisions.md → tier-dial-oracle-floors-2026-06-16`) — Ledger #0002 D8 states the tier dial IS this floor. Do not build a parallel classifier. Claude may raise a class, never lower it below the floor.
- ⬜ A2. Evidence-shape ladder — D authorize, C understanding, B plus reasoning, A plus alternatives, tradeoffs, confidence. Class determines the SHAPE of evidence, never its duration, word count, or authorship (D3: AI assistance is never penalized).
- ⬜ A3. `discipline.mjs` — extend `scanTurn` to forbid multiple-choice on load-bearing probes, in addition to the existing ban on proposing solutions. A click is the weakest provenance rung; open questions are what upgrade it to a cognition trace.
- ⬜ A4. Retrofit the `/approve-spec` marker to be GENERATED FROM a provenance-anchored ledger entry, not written alongside one. Scope is the `/approve-spec` gate ONLY — `/grant-commit` and `/approve-swarm` stay direct authorization (Ledger #0002: "Alpha is a retrofit, not a greenfield").
- ⬜ A5. Class-drive `workflow.json → skip_brainstorm` — Class D skips; Class A and B cannot.
- ✅ B1. Spec quality floor — upgrade `spec_design_calls_guard`, `/spec-lint`, and the `/spec` template from "a Design calls section is populated" to "a reference target and quality acceptance criteria are present" for any spec whose `write_set` intersects `tdd.ui_globs`. The reference target IS the rubric C4 scores against; this is the hand-off point between input and enforcement.

## Epic 3 — Enforcement half: the bar gets enforced  🟡  (enforce)

A checker only self-corrects when it stands on a mechanical oracle. Two LLMs left to converse will
agree on a hallucination. This epic gives the pipeline an oracle for quality rather than conformance,
and lets it fail the build instead of filing an advisory.

- ✅ C1. Durable plan state — `.claude/state/plan/<slug>.json`, every replan an auditable diff rather than a silent mutation. Backlog `-424f`.
- 🟡 C2. Promote review skills to oracle-bound checkers. Backlog `-d186`. Landed: `spec-diagram-review` and `spec-traceability-review` oracles, plus the parallel `checker-fanout.mjs` runner with deterministic merge. Open: refit `security`, `simplify`, and `code-structure`; the deferred diagram checks (class-to-DDL, AC-to-sequence, Container-to-Component).
- 🟡 C3. Maker/checker RALPH protocol. Backlog `-4c43`. Landed: the bounded one-maker/one-checker round-trip (`maker-checker.mjs`, append-only `evidence-ledger.mjs`, fail-closed `graduation-gate.mjs`). Open: the multi-round loop, the stop rule, and arbitration. Ceiling-hit-below-floor is a RED state that yields to a human — never a silent downgrade to advisory.
- ⬜ C4. Design-judge — the first quality oracle WITH TEETH. Playwright captures the rendered screen; the judge scores it against the spec's reference target from B1; below threshold FAILS `verify`. HARD-DEPENDS on B1 for the rubric, and on nothing else — CO-A improves the specs it reads but does not block it.
- ⬜ C5. Prove the framework is general — ride at least one non-UI oracle (mutation score for TDD, or AC-conformance as the merge oracle) on the same checker interface, so it is not a one-off UI hack.
- ⬜ C6. Gate taxonomy — the safe-versus-ask-a-human classifier, built BEFORE any autonomy. Backlog `-9008`; deliberately coarse, fragment when closer.

## Epic 4 — Velocity: reclaim the calendar  🟡  (velocity)

Peripheral to the center of the plan, and the cheapest wins on the board.

- ✅ D1. Notifier — ping the human at consent-gate and failure yields, batched, gates-only, with presence-aware suppression and idle-stop pings. Attention is a governed resource.
- 🟡 D2. Velocity levers umbrella. Backlog `-v0lv`. Landed: Lever 0 (per-phase timing and token instrumentation), Lever 1 (parallel checker fan-out), Lever 2 (right-size gate), Lever 4 (artifact compression, terse verdicts, re-verify skip). Open: cross-track lever ranking. Lever 3 (model tiering) is architecturally constrained — main-context phases run at the session model, and Article II keeps judgment in main context.
- ⬜ D3. Gate-collapse — fold three human gates into two higher-signal ones: approve-direction (intake plus the reference target) and approve-landing (commit). Depends on A4 (a collapsed gate is only safe when the single approval carries real evidence) and D1 (fewer gates only helps if the human is told when each fires).

## Epic 5 — Multi-session coordination  🟡  (org)

Peer sessions coordinating on one body of work (Article X). Opt-in, off by default, requires git.

- ✅ S1. Sprint completeness oracle, the MCP coordination channel core, the dispatch engine, and the org-team charter with broker-pool coordination.
- ⬜ S2. Deliver the channel server as its own npm package so the MCP SDK reaches consumer installs via `npx`, keeping the baseline zero-runtime-dep. Blocks the dogfood.
- ⬜ S3. Stale-lock TTL recovery in `sprint-channel/lib/lock.mjs` — a holder that dies mid-task currently leaks the lock permanently and the task becomes unclaimable.
- ⬜ S4. Sprint-mode dogfood config — register the channel server in `.mcp.json` (triggers a three-to-four MCP-count cascade across the governance surfaces) and flip the flag. Depends on S2, or consumers get a broken server.

## Epic 6 — Debt and hardening  🟡  (debt)

Carried debt. Nothing on the critical path waits for it, so pick items up between features.

- ⬜ T1. Bound the slug quantifier in `plan-store.mjs` so an over-long slug is refused by a clean named error instead of crashing at write time with ENAMETOOLONG. Backlog `-8b21`; one regex quantifier plus one scenario row.
- ⬜ T2. Hoist a single slug validator once a third caller appears. Backlog `-9f4f`. The rule is REJECT, never normalize — do not consolidate by routing every site through `canonicalSlug`, which would mask traversals repo-wide.
- ⬜ T3. Make generators stamp a derived header so a hand-edit is visibly wrong. Backlog `-e9c1`. The design call is the work: a header collides with the byte-equality contracts on the constitution mirrors, whose live files are the sources and cannot honestly carry a do-not-edit banner.
- ⬜ T4. Memory-system redesign — make a captured lesson an ACTIVE constraint at the moment of the relevant decision, not a passive archive that only helps if a phase happens to read it. Backlog `-7f3a`; needs its own intake-to-approve cycle, do not quickfix.
- ⬜ T5. Declare a release model in `project.json` (ci/cd model, release branch, trigger, cycle, consumer upgrade cadence) and teach `standup` to read it, so the "can this unreleased pile ship?" question becomes answerable from policy rather than guessed. Backlog `-a4f2`.
- ✅ T6. Stop the `memory_stop` extractor re-ingesting its own flush reports and mining SKILL.md contract prose. The suppression already existed but was anchored to a 64-character head window, which any re-invocation preamble defeats.
- ✅ T7. Derive a workflow's `exceptions` from the chosen track's DAG, so no phase skill can declare a prereq its own track is structurally unable to satisfy. Consent gates are never excepted; a track's `internal_phases` are resolved at runtime by the skill that owns them.
