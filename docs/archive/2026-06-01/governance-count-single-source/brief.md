# Brainstorm brief — governance-count-single-source

<!--
Brief artifact. Produced by the `brainstorm` skill at Stage 3.
Short-circuited: the request arrived with a complete actor + trigger + current +
desired + non-goals framing, so Stage 2 Socratic dialogue had no open field to
probe. Fields below are transcribed from the complete request framing.
-->

## Actor

The baseline maintainer, and the build + audit system (`scripts/build-template.sh`, `.claude/skills/audit-baseline/audit.mjs`) acting on the maintainer's behalf.

## Trigger

Any governance change to the harness: adding or removing a skill, hook, command, or selectable workflow track. The change alters a true count that is asserted as a literal number in many places.

## Current State

The governance counts — "22 hooks, 1 subagent, 40 skills", "6 commands", "5 selectable tracks", and similar — are hardcoded as literal numbers across roughly ten surfaces: `CLAUDE.md` (Article III greeting and Appendix B), `src/CLAUDE.template.md` (its byte-equal mirror), `PRODUCT.md`, `site-src/_data/baseline.json`, the rendered site narrative, `docs/init/seed.md`, and `README.md`. No surface derives its number from the artifacts on disk. Every governance change therefore spawns a manual chore to hand-edit each surface, and `audit-baseline` has no way to detect when one surface drifts out of sync with reality or with the others. The recurring count-bump chores this session and the prior ones are the symptom.

## Desired State

1. The canonical counts are derived at build time from the real artifacts — skills from `manifest.owners.skills` (equivalently, on-disk `SKILL.md` files declaring `owner: baseline`), hooks from `.claude/hooks/*.mjs`, commands from `.claude/commands/*.md`, selectable tracks from the `selectable:true` entries in `.claude/workflows.jsonl`.
2. Those derived counts are exposed as build/template variables (an eleventy `_data` source) so the rendered site reads them instead of carrying literals.
3. `audit-baseline` FAILs on any hardcoded-vs-derived mismatch, so a stale count anywhere is caught mechanically rather than by eye.
4. The duplicated canonical track templates are removed from `triage/SKILL.md`, after the N-file enumerating tests in `tests/memory-flush-phase.test.mjs` are rewired to read `.claude/workflows.jsonl` directly rather than asserting against the SKILL.md prose templates.

## Non Goals

- Changing any actual governance number (the counts stay whatever they truly are; this is about deriving and asserting them, not editing them).
- Redesigning the manifest format or the Article XI attestation model.
- Touching the vendored / `impeccable` skills or any user-owned skill.
- Shipping a new CLI subcommand or end-user feature.

## Solution Leakage

The request is solution-rich because the maintainer already knows the harness internals. Recording the verbs so the spec keeps the underlying need separable from the proposed mechanism:

- *"derive at build time" / "eleventy `_data`" / "audit-baseline FAILs on mismatch"* — proposed mechanism. Underlying need: **one source of truth for each governance count, plus mechanical drift detection across every surface that states it.**
- *"remove duplicated track templates from triage/SKILL.md"* — proposed mechanism. Underlying need: **the canonical track list lives in exactly one place (`workflows.jsonl`); no second copy can silently drift.**

## Open Questions

- Which count surfaces become build-derived (the site, which is generated) versus which stay hand-authored prose with only an audit cross-check (binding constitutional text like the `CLAUDE.md` Article III greeting cannot be templated — it ships as static text). The spec decides the per-surface treatment.
- Whether a single derived-counts artifact (e.g. `obj/template/.claude/governance-counts.json` emitted by the build) should be the shared source for both the site `_data` and the audit, versus the audit re-deriving independently.
