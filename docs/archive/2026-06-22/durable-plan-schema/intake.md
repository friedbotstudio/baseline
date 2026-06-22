# Durable, diffable plan state — the orchestration spine for v1 maker/checker (-424f, piece 6)

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Brief input: docs/brief/durable-plan-schema.md. Design contract: docs/vision/baseline-v1-thought-compiler.md Part 7.4.
-->

## Problem

The v1 "thought compiler" needs a single, durable, auditable state object the
orchestrator and its maker/checker worker nodes share. Today there is none.
`.claude/state/plan/` does not exist. Two already-shipped consumers persist
plan-ish state ad-hoc into separate side files — `.claude/skills/harness/evidence-ledger.mjs`
(append-only round-trip ledger) and `.claude/skills/harness/checker-fanout.mjs`
(merged spec-review verdicts, the live velocity Lever-1 path). Because there is no
shared spine:

- **Replans are silent.** Any mid-flight change to the plan is an in-place mutation
  with no recorded diff — the opposite of the `workflow.json` discipline (durable,
  versioned, a replan is a visible diff) the baseline relies on for auditability.
- **Workers would re-read full history.** With no per-node frame to read instead,
  cross-cutting context forces full-history reads; measured priced-input cache-read
  deltas are 3M–8.5M tokens/phase (velocity DATA POINTs). This is the exact
  inter-agent state-channel cost `docs/references/token-efficiency.md` targets.
- **Merge is hoped-cheap, not mechanical.** Without a structured per-node result
  schema, synthesis at `integrate` is lossy re-serialization (vision §2.4), not a
  mechanical merge.

Concretely: when a spec is approved and orchestration begins (vision §1.2), there is
no object to hold "goal + tasklist + who-does-what + what changed since." The
parallelism spine (latency) and the compressed state channel (cost) both have to be
designed here — `-424f` is their convergence point (vision Part 7.4).

## Goal

A spec-approval-triggered orchestration plan is a durable, versioned, diffable
on-disk object that every worker reads a minimal frame of (never the full history),
every replan records as a visible diff (never a silent mutation), and whose per-node
results are structured enough for the merge oracle to integrate mechanically.

## Non-goals

- NOT the full multi-round maker/checker RALPH loop + stop-rule + arbitration
  (`-4c43`). This piece supplies that loop's state spine **and** the replan-record
  primitive it will drive — but not the loop logic (dry-round stop,
  ceiling-below-floor yield, oracle-over-judgment arbitration).
- NOT multi-agent fan-out or the permanent Article II cap-lift (`-9360`).
- NOT reactivity / signal-driven v2 (`-9008`).
- NOT changing `integrate`'s merge-oracle **logic** — this piece only shapes the
  per-node result schema the oracle consumes.
- NOT the brainstorm-checker oracle (vision §5.6).

## Success metrics

- **Frame compression (η proxy)** — a worker reads its per-node frame, not the whole
  plan. baseline: full-history read; target: per-node frame strictly smaller than the
  full plan object; measured via: a frame-bytes vs full-plan-bytes assertion in test.
- **Zero silent mutations** — version count strictly increases on every replan.
  baseline: in-place overwrite (no version history); target: N≥2 retained versions
  after one replan, prior version still retrievable; measured via: version-history test.
- **Consumer migration is regression-free** — `evidence-ledger.mjs` and
  `checker-fanout.mjs` keep their existing behavior after cutover. baseline: current
  passing suites; target: 0 new failures; measured via: their existing tests + a
  payload round-trip test through the new plan object.

## Stakeholders

- **Requester**: project owner (razieldecarte@gmail.com) — drove the maximal-scope
  elections on 2026-06-22.
- **Reviewer**: project owner — gate A (`/approve-spec`) and gate C (`/grant-commit`).
- **Operator** (who runs it in prod): the harness orchestrator itself (Claude Code,
  in-session) — this is baseline self-development; the plan object is consumed by the
  harness loop, not a deployed service.

## Constraints

- **Tier is `regulated`** (`project.json → tier.level`) — the strictest floor/ceiling
  set; per-node thresholds must resolve through `.claude/hooks/lib/tier-dial.mjs`
  (`resolveCheckerThreshold`), not hard-coded.
- **Mirror `workflow.json` discipline** — durable on-disk state, marker-first-style
  write resilience, a replan is a recorded diff (vision §2.1; consent-gate lineage).
- **No mocks of internal modules** (Art. VI.3) — `evidence-ledger.mjs` and
  `checker-fanout.mjs` are internal; migration tests exercise the real files, not mocks.
- **Shipped-helper language rule** — any new helper under `.claude/skills/**` or
  `.claude/hooks/**` must be `.mjs`/`.js` or `.sh`, never Python (spec-shippability).
- **Manifest-rebuild tax** — editing any baseline-owned shipped file forces
  `scripts/build-template.sh` + re-verify (landmine `baseline-skill-edit-needs-manifest-rebuild`).
- **Must not regress the live checker fan-out** — `velocity.checker_fanout` is enabled
  and wired at the spec-review boundary; migrating its persistence cannot break it.

## Acceptance criteria

1. **Schema + create.** Given a goal and a tasklist, when a plan is created, a file at
   `.claude/state/plan/<slug>.json` is written conforming to a documented schema with
   at least: `goal`, `tasklist`, per-node `assignment` frames, and a `versions`/diff
   history. A schema-validation test rejects a malformed plan and accepts a well-formed one.
2. **Replan = recorded diff.** Given an existing plan at version V, when a revision is
   recorded, the result is version V+1 with the change captured as a diff and version V
   still fully retrievable; no code path overwrites a version in place (verified by a
   "prior version still readable after replan" test).
3. **Replanner.** Given orchestrator-or-sibling input that changes a node assignment,
   when the replanner runs, it emits a new recorded revision (AC-2 shape) — it does not
   mutate silently and it does not decide *whether* to replan (that stays `-4c43`); it
   only records the replan it is told to make.
4. **Per-node frame read.** Given a multi-node plan, when a worker reads its assignment,
   the read-frame helper returns only that node's frame, and the frame is strictly
   smaller than the full plan object (frame-bytes < full-bytes assertion).
5. **Tier-dial-aware thresholds.** Given `project.json → tier.level`, when per-node
   floor/ceiling are resolved, they equal `tier-dial.mjs` output for that level (no
   hard-coded thresholds; verified by comparing resolved values to `resolveCheckerThreshold`).
6. **Merge-oracle input.** Given completed per-node results, when shaped for the merge
   oracle, the per-node result schema round-trips into the `integrate`-input shape
   without lossy re-serialization (structured-field round-trip test).
7. **Migrate evidence-ledger (C).** After cutover, `evidence-ledger.mjs` persists through
   the plan object; its current payloads round-trip through the new object and its
   existing tests pass with 0 new failures.
8. **Migrate checker-fanout (D).** After cutover, `checker-fanout.mjs` verdict
   persistence goes through the plan object; current verdict payloads round-trip and the
   live fan-out behavior (CLEAN/BLOCKED exit codes, merged verdicts) is unchanged.
9. **Harness live-wiring (E).** The harness loop creates/reads the plan object at
   plan-mode entry (post-approval); a test or SOP-level check confirms the plan is
   present and updated across at least one phase transition.

## Open questions

- **The `-424f` ↔ `-4c43` seam (load-bearing; must be settled in `/spec` and surfaced
  at gate A).** Maximal scope pulls the replanner (B) and harness live-wiring (E) into
  this piece, which is `-4c43` territory. The spec must draw the exact line:
  `-424f` = plan spine + replan-record primitive + consumer migration + wiring;
  `-4c43` = the multi-round loop logic that *decides* when to replan. Where does the
  replanner's API stop and the loop's decision logic begin?
- **Does live-wiring (E) need an Article IV / harness-SOP amendment**, or is it additive
  to the existing loop? If the plan object becomes a mandatory post-approval artifact,
  that is a workflow-ordering change that may need a seed.md §5 / Article IV edit.
- **Consumer-migration blast radius (C, D).** Both are live shipped velocity Lever-1
  code. What is the regression fence — is round-tripping current payloads sufficient, or
  must we also pin the on-disk file *paths* the consumers wrote to (back-compat for any
  in-flight workflow state)?
