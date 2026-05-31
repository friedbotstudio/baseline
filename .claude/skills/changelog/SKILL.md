---
name: changelog
owner: baseline
description: Workflow Phase 11.5 — Pre-commit changelog curation. Main context (which knows the impending change) writes the keepachangelog entries to an entries file; the actuator renders them under `## [Unreleased]` in CHANGELOG.md and writes ChangelogState to `.claude/state/changelog/<slug>.json`. Runs between `/grant-commit` (gate C) and `/commit`. Authorized by the same `commit_consent` token that authorizes `/commit` — no new gate. Also supports `--preview-only` for ad-hoc projected-version lookups outside a workflow.
argument-hint: "[--preview-only]"
---

# changelog — Phase 11.5

Curates the `## [Unreleased]` section of `CHANGELOG.md` per [keepachangelog.com 1.0.0](https://keepachangelog.com/en/1.0.0/) before `/commit` stages the diff. Pure local curation — `@semantic-release/changelog` continues to own release-time version-block insertion.

## Prereq

ALL of `archive` AND `memory-flush` AND (implicitly) a fresh `commit_consent` token MUST be in place. Verified by the actuator at runtime, NOT by a separate guard hook.

## Applicability

Git projects only. Non-git projects auto-except this phase at `/triage` time alongside `commit` and the swarm phases (CLAUDE.md Article IV).

## Steps

1. **Prereq check.** Read `.claude/state/workflow.json`. Confirm `archive` and `memory-flush` are in `completed`. If not, exit 1 with a clear error.
2. **Build the entries (main context).** The actuator does NOT classify from `git log` — Phase 11.5 runs before `/commit`, so git-log holds prior commits, not this change. Main context (which has the full picture of what this workflow changed) decides the keepachangelog entries for the impending commit and writes them to `.claude/state/changelog/<slug>.entries.json` as a JSON array of `{ "section": "<Added|Changed|Deprecated|Removed|Fixed|Security>", "body": "<one-line entry>", "breaking": <bool, optional> }`. Keep it to the entries a reader of the release notes needs — one bullet per user-visible change, not per file.
3. **Invoke the actuator.** `node .claude/skills/changelog/changelog.mjs --slug <slug> --project-root <root> --entries-file .claude/state/changelog/<slug>.entries.json`. The actuator verifies the consent token, validates the entries, renders them under `## [Unreleased]`, and writes ChangelogState. Active mode with no `--entries-file` exits 1.
4. **On actuator success.** The harness marks this task `completed`, appends `"changelog"` to `workflow.json → completed`, and continues to `/commit`.
5. **On actuator failure (exit 1).** Surface the stderr. Likely causes: `commit_consent` expired (user re-runs `/grant-commit`), or a malformed entries file (fix the JSON — invalid section or empty body — and re-invoke).

## Ad-hoc preview mode

The skill is also invokable outside an active workflow via `--preview-only`. The actuator calls `semantic-release` as a JS API with `dryRun: true` and prints the projected next version + a draft fragment to stdout. No files are written; no consent gesture is required. Useful for answering "what version would my next push deploy?" without running the full workflow.

## Companion files

- `changelog.mjs` — CLI actuator. The decision logic.
- `classifier.mjs` — conventional-commit type → keepachangelog section.
- `version-preview.mjs` — semantic-release JS API call for projected version.
- `state-writer.mjs` — idempotent writes to `.claude/state/changelog/<slug>.json`.
- `unreleased-writer.mjs` — `CHANGELOG.md` RMW under `## [Unreleased]`; also exports `reinsertUnreleasedHeading` for the release-time fallback (`@semantic-release/changelog` destroys the heading position; this restores it).

## Constraints

- **Idempotent.** Re-invocation on the same slug + same HEAD SHA does NOT duplicate entries. The actuator computes a digest from `(slug, source_commit_sha, entries)` and skips writes if the digest matches the prior state file.
- **No internal mocks.** The actuator imports `semantic-release` (devDep) directly; no mock layer. The system clock IS mocked in `consent-expired` tests with `touch -d`.
- **TTL fit.** The skill is designed to complete inside the 300 s `commit_consent` window. Typical runtime: under 5 s. If the token expires mid-run, the actuator exits 1 BEFORE writing — partial writes are not allowed.
- **CHANGELOG.md migration is in scope of the workflow that introduces this skill.** Subsequent workflows assume the file already has the keepachangelog `## [Unreleased]` heading.

## Spec traceability

The acceptance criteria from `docs/specs/changelog-skill-and-responsive-svgs.md` map to the skill's components as follows:

- **AC-001** (harness invokes changelog between gate C and commit; Unreleased section grows) — `changelog.mjs` `runActiveMode` + `unreleased-writer.mjs` `appendUnderUnreleased`.
- **AC-002** (CHANGELOG.md included in commit stage list) — `commit/SKILL.md` Step 3 named-path enumeration grows `CHANGELOG.md` via the actuator's write; verified in `golden-path_test.sh`.
- **AC-003** (non-git short-circuit) — `triage/SKILL.md` step 2 non-git auto-except list grew to include `"changelog"` alongside `"commit"`; verified in `non-git-shortcircuit_test.sh`.
- **AC-004** (audit-baseline byte-mirror invariants after Article IV amendment) — handled in `CLAUDE.md` ↔ `src/CLAUDE.template.md` mirror + `docs/init/seed.md` ↔ `src/seed.template.md` mirror; verified by `audit.mjs` PASS.
- **AC-005** (site-src narrative names new phase; Article X.1 em-dash discipline) — handled in `/document` Phase 10 per design-ui row 1 misroute terminal at `.claude/state/design/changelog-skill-and-responsive-svgs-row1.json`.
- **AC-006** (SVG legible at 320 px) — handled in `site-src/assets/site.css` bento `@media (max-width: 768px)` block per design-ui row 0 audit at `docs/design/changelog-skill-and-responsive-svgs.audit.md`.
- **AC-007** (bento composition at 1920 px) — same design-ui row 0 deliverable; audit verdict 20/20 PASS.
- **AC-008** (workflow.json completed sequence ends with `[..., "changelog", "commit"]`) — `harness/SKILL.md` phase-ordering fence + `commit/SKILL.md` prereq line.
- **AC-009** (source_backlog_keys stamp-closure on commit) — `commit/SKILL.md` Step 6 invokes `sweep.mjs --mode stamp-closure`; no change to that flow needed in this workflow.
- **AC-010** (consent-expired denial) — `changelog.mjs` `checkConsent` reads epoch from line 1 of `commit_consent`; exits 1 on stale; verified in `consent-expired_test.sh`.
- **AC-011** (TaskList re-seed across session boundary) — `triage/SKILL.md` four task-seeding templates updated to insert `Run /changelog` between `Wait for /grant-commit` and `Run /commit`; `harness/SKILL.md` state-machine table grew a row for the new gap.
- **AC-012** (ad-hoc `--preview-only` mode) — `changelog.mjs` `runPreviewMode` calls semantic-release JS API with `dryRun:true`; no consent required; verified in `preview-only_test.sh`.
- **AC-013** (`@semantic-release/changelog` preserves Unreleased OR fallback re-inserts) — `unreleased-writer.mjs` `reinsertUnreleasedHeading` export; verified in `keepachangelog-unreleased-preserved_test.mjs` (test 1 documents the plugin behavior empirically; test 2 confirms the fallback restores canonical structure).

Design call rows from the spec:

- **`architecture-svg-bento-grid-responsive`** (design lane) — completed at design-ui row 0; site-src/index.njk + site-src/assets/site.css written; audit 20/20 PASS.
- **`site-narrative-new-phase-mention`** (copy lane) — Stage 0 misroute to `/document` Phase 10; state checkpoint at row1.json; `/document` reads the misroute terminal and routes the three target files through `Skill(prose)` with mandatory humanizer pass.

Phase 11.5 introduces gate-adjacent automation between gate C `/grant-commit` (Article IV phase 11 gate) and the `/commit` skill body. No new gate (no gate D); the existing `commit_consent` token authorizes both.
