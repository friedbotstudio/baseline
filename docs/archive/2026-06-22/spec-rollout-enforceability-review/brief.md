# Brainstorm brief — spec-rollout-enforceability-review

## Actor

The spec author writing a Rollout section, and the /approve-spec reviewer who relies on that section being trustworthy.

## Trigger

A spec names a precondition (deploy setting, data migration, feature flag, external-service reachability) that nothing in the spec ties to an enforcement mechanism.

## Current State

Rollout prerequisites live in free prose; nothing mechanically checks they are enforced, so they ship unenforced and fail silently in production. Origin: the 2026-05-14 GitHub Pages build_type=workflow prerequisite, judgment-flagged 3 times yet never given an enforcement AC (pending-question Q-002).

## Desired State

Every Rollout prerequisite is structurally bound to an enforcement-type AC and mechanically verified before approval. A missing or dangling binding blocks approval; a prerequisite still living in free prose surfaces as advisory. Scope: any spec that has a Rollout section; any precondition kind that can silently fail; new specs going forward (no retroactive sweep).

## Non Goals

No retroactive sweep of already-approved or archived specs (new specs forward only). No LLM-judgment blocking (a free-prose-only prerequisite stays advisory, never blocks; the structured field is the sole mechanical oracle). Not a child of the v1 thought-compiler epic umbrella (standalone checker).

## Solution Leakage

Captured from the request, deferred to /spec: build a new spec-rollout-enforceability-review skill in the spec-review family; amend the spec format so Rollout prerequisites are a structured block, one row per prerequisite with an explicit enforced-by: AC-NNN pointer; checker BLOCKER on missing/dangling pointer, ADVISORY on free-prose-only; wire as a 4th adapter into harness/checker-fanout.mjs DEFAULT_CHECKER_REGISTRY; remediate the origin bug via scripts/bootstrap-pages.mjs and/or a fail-fast preflight in release.yml. This is the recorded Q-002 option-(b)-with-structured-artifact decision (validated by the user 2026-06-10).
