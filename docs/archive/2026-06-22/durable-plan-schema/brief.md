# Brainstorm brief — durable-plan-schema

## Actor

The harness orchestrator (main thread) per vision §1.2; the maker/checker worker nodes it governs; the merge oracle (the `integrate` phase). Plus the two shipped consumers that persist plan-ish state ad-hoc today: `.claude/skills/harness/evidence-ledger.mjs` (append-only round-trip ledger) and `.claude/skills/harness/checker-fanout.mjs` (merged spec-review verdicts).

## Trigger

After a spec is approved, approval triggers plan-mode for orchestration (vision §1.2). Also whenever a bounded maker/checker round-trip or the checker fan-out runs and must durably persist its verdicts/evidence. Today both persist into separate ad-hoc side files with no shared spine and no recorded diff on change.

## Current State

No durable plan object exists (`.claude/state/plan/` is absent). Two shipped consumers persist plan-ish state to separate files; any replan is a silent in-place mutation with no recorded diff; a worker that needed cross-cutting context would re-read full history (priced-input cache-read deltas measured at 3M–8.5M tokens/phase). There is no single, auditable, versioned spine the orchestrator and workers share — so parallel work is neither provably safe (diffable replans) nor cheap (frame-not-history reads).

## Desired State

A durable, on-disk, versioned plan object at `.claude/state/plan/<slug>.json` that is the single orchestration spine, carrying: goal + tasklist + per-node assignment frame (the minimal frame a worker reads INSTEAD of full history) + version/diff history (every replan recorded as a diff, never a silent mutation — `workflow.json` lineage + the consent-gate pattern). Tier-dial-aware: per-node floor/ceiling resolved from `project.json → tier` (level `regulated` here). Per-node result schema shaped as the merge-oracle's (`integrate`) input so synthesis is mechanical, not lossy. Design objective: maximize η = I(plan; correct future actions) / plan-tokens (token-efficiency.md is the design spec, not an abstract north star). SCOPE (maximal, user-elected 2026-06-22): (A) the schema + read/write/diff helpers; (B) a replanner that mutates the plan mid-flight on orchestrator/sibling input; (C) migrate `evidence-ledger.mjs` to read/write the plan object; (D) migrate `checker-fanout` verdict persistence to the plan object; (E) live-wire the plan object into the harness loop post-approval.

## Non Goals

- NOT the full multi-round maker/checker RALPH loop + stop-rule + arbitration — that is `-4c43`. This piece provides its state spine AND the replanner primitive it will drive, but not the loop logic / dry-round / ceiling-below-floor-yield / oracle-over-judgment arbitration.
- NOT multi-agent fan-out or the real Article II amendment (`-9360`) — the gate is per-class; multi-maker scaling stays out.
- NOT reactivity / signal-driven v2 (`-9008`).
- NOT changing `integrate`'s merge-oracle LOGIC — this piece only shapes the per-node result schema that the oracle consumes.
- NOT the brainstorm-checker oracle (vision §5.6).

## Solution Leakage

- The request and the user's scope elections pre-commit the SOLUTION SHAPE (the `.claude/state/plan/<slug>.json` path, the goal+tasklist+frame+diff-history schema, replan-as-recorded-diff, an actual replanner, harness live-wiring). This is treated as a COMMITTED DESIGN CONTRACT from `docs/vision/baseline-v1-thought-compiler.md` Part 7.4, not a premature implementation guess — the underlying need it serves is a durable/auditable/compressed shared-state channel for safe (diffable) and cheap (frame-not-history) parallel maker/checker work.
- OPEN QUESTION 1 (load-bearing, for /spec + gate A): the maximal scope now OVERLAPS `-4c43`. The replanner (B) and harness live-wiring (E) are piece-5 territory. The spec MUST draw the exact seam: `-424f` owns the plan spine + the replan-record primitive + consumer migration + wiring; `-4c43` owns the multi-round loop logic / stop-rule / arbitration that DECIDES when to replan. Surface this seam explicitly at the approval gate.
- OPEN QUESTION 2: migrating two shipped velocity Lever-1 consumers (C `evidence-ledger.mjs`, D `checker-fanout.mjs`) has real blast radius — both are live. Regression coverage that round-trips their current persisted payloads through the new plan object is required before cutover.
