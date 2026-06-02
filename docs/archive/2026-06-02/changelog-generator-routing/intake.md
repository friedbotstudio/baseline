# Move changelog from a mandatory Phase 11.5 to an on-demand generator skill whose structured output is routed by an optional per-project workflow, leaving CHANGELOG.md fully machine-generated in CI

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

`CHANGELOG.md` has two owners writing to one file, and they have no handoff between them. `@semantic-release/changelog` prepends a commit-derived version block at release time (CI); the mandatory Phase 11.5 `changelog` skill curates a hand-written `## [Unreleased]` section before every commit. Nothing clears `## [Unreleased]` when a version is cut, so after the 0.13.0 release the file now carries the *same* changes twice — once as the commit-derived `# [0.13.0]` block at the top (`CHANGELOG.md:1`) and again as keepachangelog prose under `## [Unreleased]` (`CHANGELOG.md:31`). The skill even ships a `reinsertUnreleasedHeading` fallback purely to survive the plugin it competes with, and a `keepachangelog-unreleased-preserved_test.mjs` documenting the collision. This is dual-ownership drift: a developer reading the committed tree sees a stale, duplicated changelog and cannot tell which region is authoritative.

The deeper issue is that Phase 11.5 forces every workflow to curate a changelog entry inline, into a file that is already machine-managed, with no clean place for the human-readable narrative to go. The baseline also ships the `changelog` skill to consumer projects that may have no website and no place to surface a "what's new" narrative at all.

## Goal

CHANGELOG.md is owned solely by semantic-release in CI, and the human-readable "what's new" narrative is produced by an on-demand generator whose structured output each project routes wherever it wants — with no project forced to curate a changelog inline and no project assumed to have any particular destination.

## Non-goals

- **Not** building this repository's own "what's new" page (the Eleventy site surface). That is a separate, project-scoped routing target designed as later work — this intake only establishes the generator + the routing seam.
- **Not** introducing an "upcoming / unreleased" concept or any next-version forecasting. Because the site/docs publish alongside the npm artifact, the version is always known at publish time (read from `package.json`/the git tag); there is no curated-but-unreleased window to model.
- **Not** changing semantic-release's ownership of versioned blocks in CHANGELOG.md, the release workflow, or the conventional-commit contract.
- **Not** prescribing CHANGELOG tooling for consumer projects (a consumer may not use semantic-release at all). The generator and routing seam are generic; CHANGELOG.md policy is this repo's own concern.
- **Not** removing the `changelog` skill or reducing the skill count — it is reclassified (phase → generator), not deleted.

## Success metrics

- Duplicated changelog content in `CHANGELOG.md` — baseline: 1 duplicated version block (0.13.0 mirrored under `## [Unreleased]`), target: 0, measured via: inspection of the committed `CHANGELOG.md`.
- Mandatory pre-commit changelog curation — baseline: every workflow runs Phase 11.5, target: 0 workflows blocked on changelog curation, measured via: `.claude/workflows.jsonl` track DAGs (no `changelog` node in any selectable track).
- `audit-baseline` — baseline: PASS, target: PASS (governance counts and constitution citations stay consistent after the amendment), measured via: `node` audit exit code in CI.
- Full test suite — target: green, measured via: `npm test`.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner, razieldecarte@gmail.com).
- **Reviewer**: Tushar Srivastava (solo maintainer; approves the spec at Gate A and the commit at Gate C).
- **Operator** (who runs it in prod): baseline consumers (invoke the generator on demand and wire their own routing workflow) and the release CI pipeline (semantic-release owns CHANGELOG.md). This repo is itself a consumer of the seam for its future "what's new" page.

## Constraints

- The amendment SHALL flow `docs/init/seed.md` → `CLAUDE.md` → implementation per Article I.4 precedence; `src/seed.template.md` and `src/CLAUDE.template.md` byte-mirrors stay in sync.
- The generator skill SHALL be generic: no assumption of an Eleventy site or any specific destination, since it ships to every consumer. Output is a structured fragment to a conventional location; routing is the project's concern.
- CHANGELOG.md SHALL be written only by semantic-release (`@semantic-release/changelog` + `@semantic-release/git`) in CI; no local skill or hook writes to it.
- Governance counts SHALL stay consistent: skills remain 40 (reclassification, not removal), the 22 hooks are untouched (the changelog shrink-guard is actuator-internal logic, not a registered hook), commands unchanged. `audit-baseline` derives counts and must continue to PASS.
- The spec SHALL NOT ship dev-tree references to consumer installs (`spec-shippability-review` must come back CLEAN); new shipped helpers must be `.sh` or `.mjs`/`.js`.
- All five selectable tracks in `.claude/workflows.jsonl` (and any references in `harness`/`triage` SOPs) that name a `changelog` node SHALL be updated coherently so `commit` follows `grant-commit` directly.

## Acceptance criteria

1. Given a completed workflow on this repo, when it reaches the commit phase, then no skill writes to `CHANGELOG.md` and the committed `CHANGELOG.md` contains no duplicated version block (the existing 0.13.0/Unreleased duplication is removed as part of the cutover).
2. Given any selectable track in `.claude/workflows.jsonl`, when its DAG is materialized, then it contains no `changelog` node and `commit` depends directly on `grant-commit`.
3. Given the reclassified `changelog` skill invoked on demand outside any workflow, when it runs against a set of changes, then it emits a structured machine-readable fragment (JSON or YAML) at a conventional path, conforming to a documented schema, and writes nothing to `CHANGELOG.md`.
4. Given a project with a routing target configured (an optional `project.json` knob naming a routing workflow), when the generator produces a fragment, then the named routing workflow can consume that fragment from the conventional location; given no routing target configured, the generator still succeeds and the fragment simply sits at the conventional location unconsumed.
5. Given `/init-project`, when it runs, then it MAY offer to scaffold a routing workflow but does not require one; and a project can wire a routing workflow later without re-running init-project. Neither path is mandatory.
6. Given the amendment, when `audit-baseline` runs, then it PASSES: Article IV no longer lists a mandatory Phase 11.5, the `changelog` skill is reclassified (not counted as a phase), the skill count stays 40, and both `src/` mirrors are byte-equal to their canonical files.
7. Given the cutover, when the tree is inspected, then `unreleased-writer.mjs`, `version-preview.mjs`, and `keepachangelog-unreleased-preserved_test.mjs` are removed (or repurposed), and no remaining code path performs `## [Unreleased]` curation.

## Open questions

- **Fragment format**: JSON, YAML, or one canonical with the other optional? The user specified "json or yaml like structure" — `/spec` picks the canonical format and schema (entry shape: category, title, body, optional highlight flag; version read at build time, not stored).
- **Conventional drop location**: where the generator writes its fragment (e.g. `.claude/state/whatsnew/<slug>.json` vs a `docs/` path) so a routing workflow has a stable pickup point. Pinned at `/spec`.
- **Routing config shape**: the `project.json` knob name and value (a workflow/track id? a path?) and whether routing is convention-only with the knob optional. Pinned at `/spec`.
- **`changelog` skill relocation**: which Appendix B category it moves to (generator / doc-helper), and whether it stays user-invokable as a slash command.
- **CHANGELOG.md migration mechanics**: remove the `## [Unreleased]` section entirely, or leave an empty heading; and exactly how the current 0.13.0 duplicate is cleaned without disturbing semantic-release's prepend point.
- **Track-reference sweep**: confirm every `changelog` reference (workflows.jsonl tracks, `harness` phase-ordering SOP, `triage` auto-except prose, the materializer) is in scope for the spec's write_set.
