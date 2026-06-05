# Amend `seed.md §II.A` to legalize a bounded one-maker / one-checker experiment on the Workflow runtime

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/maker-checker-amendment.md (brainstorm). Prior evidence: docs/archive/2026-06-05/maker-checker-poc/.
-->

## Problem

Article II (`seed.md §II.A`) ships **exactly one** subagent (`swarm-worker`) and forbids subagents from making design decisions, picking abstractions, or expanding scope. There is no constitutional text that authorizes a **maker** (an agent that produces work against a contract) paired with an **oracle-bound checker** (an agent that reviews that work and emits a mechanically-grounded finding — a failing test, a structural violation — not an opinion).

The maker/checker PoC (archived at `docs/archive/2026-06-05/maker-checker-poc/`) already produced the evidence that this is safe to run: a maker→checker round-trip completed on Claude Code's dynamic Workflow runtime; `swarm_boundary_guard` and `verify_pass_guard` were **observed firing in the maker context** (governance is live inside workflow agents, not assumed); and the checker emitted at least one mechanically-grounded finding. But because `§II.A` still forbids any maker, that experiment cannot legally run beyond the throwaway spike. The substrate is proven; the constitution has not caught up.

Concretely: today, if the orchestrator tried to dispatch a governed maker + oracle-bound checker outside `/swarm-dispatch`, it would violate Article II — there is no sanctioned path, bounded or otherwise.

## Goal

Ratify an approvable `seed.md §II.A` amendment that installs a **bounded** one-maker / one-checker exception — hard-capped, governed by the existing hooks, and gated on explicit graduation criteria — so the bounded experiment can run legally without opening the door to an unbounded agent-team architecture.

## Non-goals

- The full agent-team architecture, the tier dial (`-1a2d`), the mutation oracle (`-f029`), the durable plan schema (`-424f`), and the gate taxonomy / debugging skill / v2 (`-9008`) — each remains a separate backlog piece.
- More than one maker or one checker; any fan-out, waves, or panel.
- Authoring the **future permanent Article II rewrite** itself. This amendment only *names* the evidence/decision (the graduation gate) that would justify it later.
- New hooks, new subagents, or new skills. The amendment legalizes a bounded use of the **existing** runtime + enforcement layer; it does not add machinery.

## Success metrics

- **Amendment is approvable and lands clean** — baseline: `§II.A` forbids all makers; target: `§II.A` contains the bounded-exception clause + graduation gate, ratified via `/approve-spec` then committed; measured via: the four mirror files in sync and `audit-baseline` PASS.
- **Boundedness is encoded, not implied** — baseline: 0 caps in text; target: the text fixes exactly-1-maker + exactly-1-checker + named-runtime + governed-by-existing-hooks as immutable caps; measured via: spec AC traceability + reviewer read.
- **No drift introduced** — baseline: current `audit-baseline` PASS; target: still PASS after the amendment; measured via: `audit-baseline` exit 0 and CLAUDE.md within byte budget.

## Stakeholders

- **Requester**: Tushar Srivastava (baseline maintainer) — owns the constitution and the `-c732` backlog item.
- **Reviewer**: Tushar Srivastava — self-ratifies at gate A (`/approve-spec`); the consent gate is the structural check.
- **Operator** (who runs it in prod): the main-context workflow orchestrator (Claude) that will dispatch the governed maker + oracle-bound checker once `§II.A` legalizes it.

## Constraints

- **Amendment mechanics (Art I.4).** `docs/init/seed.md` is edited FIRST; the change then propagates to `CLAUDE.md`, and to the two byte-equal template mirrors `src/CLAUDE.template.md` and `src/seed.template.md`. All four files are in the write_set.
- **CLAUDE.md byte budget.** `audit-baseline` FAILs `CLAUDE.md` above 40,000 chars; `landmines.md` records a tighter ~38,500-byte working budget for the amendment test. Net additions to `CLAUDE.md` must stay within budget — prefer placing narrative in the `seed.md` charter and the annex, keeping `CLAUDE.md` to binding rules.
- **seed.template parity.** `src/seed.template.md` must mirror `docs/init/seed.md` and `src/CLAUDE.template.md` must mirror `CLAUDE.md`, byte-for-byte where the audit requires it.
- **python3 line-ledger.** Heed the `landmines.md` constitutional-amendment-tripwire on the python3 line-ledger check during the amendment edit.
- **Governance is non-negotiable.** The bounded experiment runs *inside* the existing PreToolUse hook layer. The amendment SHALL NOT carve out any ungoverned maker path.
- **Precedence.** Per Art I.4, `seed.md` governs; this amendment changes `seed.md` first and lets the change propagate downward — it never edits `CLAUDE.md` ahead of `seed.md`.

## Acceptance criteria

1. Given the amended `seed.md §II.A`, when a reader looks for the maker/checker authorization, then the text sanctions **exactly one** governed maker + **exactly one** oracle-bound checker — and explicitly forbids a second maker/checker, fan-out, waves, or a panel.
2. Given the amended `§II.A`, when a reader looks for where the experiment runs, then the text names the **Claude Code dynamic Workflow runtime** as the host and states the experiment is **governed by the existing PreToolUse hooks** (no ungoverned path).
3. Given the amended `§II.A`, when a reader looks for the end-condition, then the text contains a **graduation gate** — the named evidence/decision under which a future permanent Article II rewrite would make the provision permanent — and states that until that future amendment lands the provision remains a bounded exception.
4. Given the amendment is drafted, when the four mirror files are compared, then `CLAUDE.md` ↔ `src/CLAUDE.template.md` and `docs/init/seed.md` ↔ `src/seed.template.md` satisfy the parity the audit requires, and `CLAUDE.md` stays within the byte budget.
5. Given the amendment is applied, when `audit-baseline` runs, then it exits 0 (PASS) — names, counts, citations, and byte cap all intact.
6. Given the amendment text, when checked against the PoC evidence, then every authorized capability (round-trip, oracle-bound finding, governed maker context) traces to a corroborated PoC finding or a research-grounded external source — no capability is sanctioned that the evidence does not support.

## Open questions

- **Graduation criteria specifics.** What exact evidence/decision triggers the future permanent rewrite? (e.g., N successful governed round-trips, a clean security review of the checker's oracle artifacts, a maintainer decision.) To be sharpened in `/scout` → `/research` → `/spec`.
- **Boundedness backstop.** Does `§II.A` need a numeric or temporal backstop (commit-count, date, re-ratification clause) IN ADDITION to the graduation gate, or is the graduation gate alone sufficient? Decide in `/spec`.
- **Placement.** Does the bounded-exception clause live inline in Article II, or as a clearly-delimited `§II.A` sub-article with the narrative pushed to the `.claude/CONSTITUTION.md` annex to protect the `CLAUDE.md` byte budget? Resolve in `/scout` (change-surface) + `/spec`.
