# Single source of truth for harness governance counts, with audit-enforced drift detection

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
Primary input: docs/brief/governance-count-single-source.md (brainstorm brief, short-circuited on complete framing).
-->

## Problem

The harness advertises its own size in literal numbers — "22 hooks, 1 subagent, 40 skills", "6 commands", "5 selectable tracks" — and those literals are copied across roughly ten surfaces: `CLAUDE.md` (the Article III project-agnostic-mode greeting and the Appendix B / quick-orientation lines), its byte-equal mirror `src/CLAUDE.template.md`, `PRODUCT.md`, `site-src/_data/baseline.json`, the rendered marketing/docs site narrative, `docs/init/seed.md`, and `README.md`. None of them is computed from the artifacts that actually exist on disk.

The concrete failure: this session alone added the `brainstorm` skill (39 → 40) and touched hook/command inventories, and each change forced a hand-sweep of every surface to re-state the number. PRODUCT.md was already caught mid-session reading "thirty-six skills" and "thirty-nine" while the true count was 40. `audit-baseline` enforces a great deal (manifest hashes, mirror byte-equality, the 40k cap) but it has no notion of "the number this file claims must equal the number of things on disk," so a stale count sails through green.

## Goal

A governance count is stated as a literal in exactly one derivation, every other surface either reads the derived value or is mechanically checked against it, and `audit-baseline` fails the build when any surface disagrees with the artifacts on disk.

## Non-goals

- Changing any actual count. The numbers stay whatever the artifacts truly are; this work derives and asserts them, it does not edit them.
- Redesigning the manifest format or the Article XI attestation/ownership model.
- Modifying vendored / `impeccable` / user-owned skills.
- Adding a CLI subcommand or any end-user-facing feature.
- Templating binding constitutional prose. The `CLAUDE.md` Article III greeting is static constitutional text; it can be cross-checked by the audit but not generated.

## Success metrics

- Hardcoded count surfaces under single-source enforcement — baseline: 0 (all ~10 independent), target: every governance count is either build-derived or audit-cross-checked, measured via: `audit-baseline` gaining a count-drift check that fails on mismatch.
- Manual edits required per future governance change — baseline: ~10 surfaces hand-edited, target: edit the artifact + (for static-prose surfaces) the audit catches any forgotten literal, measured via: the next add-a-skill change touching only derived sources + flagged prose.
- Canonical track-list copies — baseline: 2 (`workflows.jsonl` + `triage/SKILL.md` prose templates), target: 1 (`workflows.jsonl`), measured via: `triage/SKILL.md` no longer carrying per-track template bodies and `tests/memory-flush-phase.test.mjs` reading `workflows.jsonl`.

## Stakeholders

- **Requester**: Tushar (baseline maintainer / repo owner).
- **Reviewer**: Tushar (spec approval at gate A, commit at gate C).
- **Operator** (who runs it in prod): the build + audit pipeline — `scripts/build-template.sh` and `.claude/skills/audit-baseline/audit.mjs` — run on every governance change and in CI.

## Constraints

- The byte-equal mirrors must stay byte-equal: `CLAUDE.md` ↔ `src/CLAUDE.template.md` and `docs/init/seed.md` ↔ `src/seed.template.md`. Any count treatment applied to one side applies identically to the mirror.
- Article XI manifest invariants must continue to hold (the audit reads `manifest.owners.skills` and per-file hashes; deriving the skill count from that map must not perturb it).
- The `CLAUDE.md` 40,000-character cap must continue to hold (and binds the mirror).
- Some count mentions live inside binding constitutional text (e.g. the Article III greeting). Those cannot be build-generated; the spec must classify each surface as **derived** (generated/read from the canonical source) or **asserted-prose** (static text cross-checked by the audit), and justify each classification.
- Derivation must be deterministic and runnable in the sandbox/CI (no network, plain Node).

## Acceptance criteria

1. Given the artifacts on disk, when the build runs, then a single canonical derivation computes each governance count (skills = count of `SKILL.md` declaring `owner: baseline` / `manifest.owners.skills`; hooks = `.claude/hooks/*.mjs`; commands = `.claude/commands/*.md`; selectable tracks = `selectable:true` lines in `.claude/workflows.jsonl`; subagents = `.claude/agents/*`) and emits it as a build/template-consumable value.
2. Given the rendered site, when it states a governance count, then that number comes from the derived source (eleventy `_data`), not a hand-typed literal.
3. Given a surface that states a count but cannot be generated (binding constitutional prose), when `audit-baseline` runs, then it parses the literal out of that surface and FAILs if it disagrees with the derived count.
4. Given any governance count anywhere under enforcement is stale (does not match the artifacts on disk), when `audit-baseline` runs, then it exits non-zero naming the offending surface and the expected vs found number.
5. Given `tests/memory-flush-phase.test.mjs`, when it asserts the canonical track shapes, then it reads them from `.claude/workflows.jsonl` rather than from `triage/SKILL.md` prose.
6. Given AC-5 holds, when `triage/SKILL.md` is edited to remove the duplicated per-track template bodies, then the full test suite stays green and `audit-baseline` exits 0 (the SKILL.md is no longer a second source of the track list).
7. Given the byte-equal mirror pairs, when this change lands, then `CLAUDE.md` ↔ `src/CLAUDE.template.md` and `docs/init/seed.md` ↔ `src/seed.template.md` remain byte-equal and `audit-baseline` confirms it.

## Open questions

- Shared derived-counts artifact vs independent re-derivation: should the build emit one `governance-counts.json` consumed by both the site `_data` and the audit, or should the audit derive independently from the same artifacts? (Spec decision; a shared artifact avoids two derivation code paths drifting, but adds a build output the audit depends on.)
- Exact per-surface classification (derived vs asserted-prose) for each of the ~10 surfaces — `/scout` will enumerate them precisely and `/spec` will assign treatment per surface.
