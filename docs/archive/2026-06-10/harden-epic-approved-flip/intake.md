# Harden the epic `approved: true` flip so it is structurally enforced, not merely trusted

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/harden-epic-approved-flip.md (brainstorm Stage 3 brief).
-->

## Problem

The epic / epic-child governance tracks (seed.md §18.9) amortize discovery: an `epic` runs `intake → scout → research → spec → approve-spec` once, then each `epic-child` slice inherits that discovery and skips those phases. The gate that authorizes the skip is a single boolean — `approved: true` — in the epic state file `.claude/state/epic/<epic>.json`.

Today that flip is written by the **harness SOP in main context** (Claude) immediately after the epic's gate-A `/approve-spec` consent lands. It is **trusted, not guard-enforced**: no hook validates that a real gate-A consent actually occurred before the flag was written. `track_guard` reads `approved` to honor every epic-child's discovery-skip, so a `approved: true` written **without** the real gate — a forged write, or a buggy/mis-sequenced SOP path — would be honored, and a child would skip mandatory discovery (intake, scout, research, spec, approve-spec).

This is the same class of trust gap the constitution elsewhere closes structurally: the spec-approval *token* write is gated by `spec_approval_guard` against a fresh, single-use, slug-matched consent marker that Claude cannot forge (the marker is written by the `consent_gate_grant` UserPromptSubmit hook, outside Claude's tool boundary). The epic `approved` flip currently has no equivalent structural backstop — it is a consent-bearing state transition enforced only by Claude's own discipline.

Concrete scenario: an epic `auth-revamp` is created with `approved: false`. Before the user ever runs `/approve-spec`, a write sets `.claude/state/epic/auth-revamp.json → approved: true`. The next `/triage` offers `epic-child` for an open slice; `track_guard` sees `approved: true`, allows the child, and the slice ships to `/tdd` with zero discovery — no scout, no research, no spec, no human approval — against a spec that was never approved.

## Goal

An epic's discovery-skip authorization cannot be granted unless the real gate-A `/approve-spec` consent for that epic actually happened — enforced by a hook, not by trust.

## Non-goals

- **The `/approve-spec` gate-A flow itself stays unchanged.** This work keys off the consent marker that gate already produces (via `consent_gate_grant`); it does not add a new approval step, a new consent command, or alter how spec approval already works.
- This intake does not commit to changing `track_guard`'s **read** side (how a child consumes `approved`), to migrating epic state files already on disk, or to hardening other trusted main-context state writes. Those are carried as Open questions for `/spec` to settle — they are not pre-scoped out, but they are not in-scope by default either.

## Success metrics

- Forged-flip block rate — baseline: 0% (no enforcement; every forged `approved: true` is honored), target: 100% (every `approved: true` transition lacking a fresh slug-matched approve-spec consent marker is blocked at the Write boundary), measured via: the new guard's test suite under `tests/`.
- Legitimate-flip pass rate — baseline: n/a, target: 100% (a flip performed while a fresh slug-matched marker exists is allowed), measured via: the same test suite.
- Constitutional-surface drift — baseline: n/a, target: 0 (Article VIII hook table, hook count, seed.md §4.1, and the byte-equal mirrors all updated in lockstep), measured via: `audit-baseline` PASS.

## Stakeholders

- **Requester**: project owner (razieldecarte / Tushar Srivastava) — raised as backlog `harden-epic-approved-flip-tie-to-approval-marker-7227`.
- **Reviewer**: project owner (sole maintainer) — drives gate-A `/approve-spec` and gate-C `/grant-commit`.
- **Operator**: the harness SOP + the hook layer (`consent_gate_grant`, `track_guard`, and the new guard) — there is no human operator at runtime; the guard is the operator.

## Constraints

- **Hooks are the enforcement layer (Article VIII).** Adding or modifying a hook requires a `seed.md §4.1` amendment and propagation to CLAUDE.md Article VIII, the byte-equal mirrors (`src/CLAUDE.template.md`, `src/seed.template.md`), and any governance counts (`audit-baseline` `EXPECTED_*`, README, settings template). If a *new* hook is added, the canonical hook count (currently 22) moves and must change everywhere it is asserted.
- **The forgery threat model must match the existing consent gates.** Claude cannot be allowed to write the consent marker itself; the marker must originate outside Claude's tool boundary (the `consent_gate_grant` UserPromptSubmit path), exactly as the three existing gates work. A guard that Claude can satisfy by writing its own marker provides no security.
- **Must not break the epic happy path.** The harness flips `approved: true` legitimately after gate-A; that path must continue to succeed. Whatever marker the flip is validated against must still be present/fresh at the moment the harness performs the flip.
- **Shippability**: the change ships to consumer installs, so any new helper must follow the shipped-helper rules (`.sh` or `.mjs`/`.js`, listed in the manifest); no dev-tree path references in shipped prose.

## Acceptance criteria

1. Given a Write/Edit to `.claude/state/epic/<epic>.json` that transitions `approved` to `true`, when **no** fresh slug-matched approve-spec consent marker for that epic exists, then the write is **blocked** by a guard.
2. Given the same `approved: true` transition, when a **fresh slug-matched** approve-spec consent marker for that epic **does** exist, then the write is **allowed**.
3. Given an attempt by Claude / main context to write the approve-spec consent marker itself, then it is **blocked** (the marker may only originate from the `consent_gate_grant` UserPromptSubmit path) — mirroring `spec_approval_guard`'s marker-self-write block.
4. Given a Write/Edit to an epic state file that does **not** transition `approved` to `true` (e.g., appending to `children[]`, flipping a child `status`), when no marker exists, then the write is **allowed** — only the `approved: true` transition is gated, not all epic-state writes.
5. Given a slug-matched approve-spec consent marker that is **stale** (older than the consent TTL used by the existing gates), when an `approved: true` write is attempted, then it is **blocked** (freshness is enforced, consistent with the existing 5-minute consent window).
6. Given a legitimately-approved epic (flag set through the gated path), then `track_guard`'s existing epic-child discovery-skip behavior is **unchanged** — a real approval still lets children skip discovery exactly as today.
7. Given the full constitutional surface, then `audit-baseline` **PASSes**: the new/changed guard appears in the Article VIII table, the hook count is consistent everywhere it is asserted, `seed.md §4.1` and the byte-equal mirrors are updated, and no count drifts.

## Open questions

- **Which marker does the flip validate against?** The existing approve-spec consent marker is consumed when the spec-approval *token* is written (gate A). By the time the harness flips epic `approved: true`, is that same marker still present and fresh — i.e., can the flip reuse it — or does the epic-approved transition need its own consent class (a distinct marker)? This is the load-bearing design decision for `/scout` and `/research`.
- Is `track_guard`'s **read** side in scope (defense-in-depth: re-validate at read time), or is write-side gating alone sufficient?
- Should existing on-disk epic state files be migrated / re-validated, or does the enforcement govern writes from here forward only?
- Should any other trusted main-context state flips (e.g., `harness_state`, `workflow.json → completed`) be brought under marker-gating in the same pass, or is the epic `approved` flag the sole target?
