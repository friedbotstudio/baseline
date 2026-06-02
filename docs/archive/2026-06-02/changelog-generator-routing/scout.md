# Codebase Scout Report — changelog-generator-routing

Scope: retire `changelog` as mandatory Phase 11.5, reshape it into an on-demand generator emitting a structured fragment routed by an optional per-project workflow, and make CHANGELOG.md semantic-release-only. This report names what *is*, not what to build.

## Primary touchpoints

### The changelog skill (the thing being reshaped)
- `.claude/skills/changelog/SKILL.md` — Phase 11.5 contract; "renders entries under `## [Unreleased]` in CHANGELOG.md"; prereq check requires `archive` + `memory-flush` in `completed`; consent-token gated.
- `.claude/skills/changelog/changelog.mjs` — actuator. `runActiveMode` calls `appendUnderUnreleased` (line ~193); writes `ChangelogState` to `.claude/state/changelog/<slug>.json`; `--preview-only` path.
- `.claude/skills/changelog/unreleased-writer.mjs` — RMW under `## [Unreleased]`; exports `appendUnderUnreleased` (REPLACES the body, per idempotency test) and `reinsertUnreleasedHeading` (release-time fallback that fights `@semantic-release/changelog`). **Retire candidate per intake AC-7.**
- `.claude/skills/changelog/version-preview.mjs` — projects next version via semantic-release JS API + git log. **Retire candidate** (AC-7; "upcoming" is a non-goal).
- `.claude/skills/changelog/classifier.mjs`, `state-writer.mjs` — classify commits into keepachangelog sections; write state. Classifier logic likely survives into the generator core.
- `.claude/skills/changelog/tests/` — 7 tests: `golden-path_test.sh`, `idempotent-reentry_test.sh`, `keepachangelog-unreleased-preserved_test.mjs` (**retire** — only documents the plugin collision), `consent-expired_test.sh`, `non-git-shortcircuit_test.sh`, `preview-only_test.sh`, `run.sh`.

### CHANGELOG.md + release machinery (becomes sole machine owner)
- `CHANGELOG.md` — currently holds the drift: `# [0.13.0]` block at line 1 (above the `# Changelog` title at line 25) and the duplicated keepachangelog prose under `## [Unreleased]` at line 31. Header line 29 documents the dual-ownership intent.
- `.releaserc.json` — plugin chain: `commit-analyzer` → `release-notes-generator` → `@semantic-release/changelog` → `npm` → `@semantic-release/git` → `github`. `@semantic-release/git` uses **default assets** (no explicit config). semantic-release deps present: `@semantic-release/changelog`, `@semantic-release/git`, `semantic-release` (no `@semantic-release/exec`).
- `.github/workflows/release.yml` — `release` job commits CHANGELOG.md + package.json back, tags `vX.Y.Z`; `deploy-pages` job builds the site post-release on `main`.

### Track DAGs — `changelog` node in ALL FIVE selectable tracks
- `.claude/workflows.jsonl` — every selectable track has `changelog` node with `depends_on: ["grant-commit"]`, and `commit.depends_on: ["changelog"]`. Tracks: intake-full, spec-entry, tdd-quickfix, chore, freeform. Removing the node means rewiring `commit.depends_on` → `["grant-commit"]` in each.
- `src/.claude/workflows.template.jsonl` — pristine mirror; same 5 tracks carry the node. Must change in lockstep (built into `obj/template/` by `scripts/build-template.sh`).

### Materializer (renders DAG → TaskList)
- `src/cli/track-tasklist-materializer.js:181` — `changelog: 'Running changelog'` activeForm label (canonical).
- `.claude/skills/triage/track-tasklist-materializer.js:181` — shipped mirror (synced at build time). Both need the label removed if the node is gone.

### Constitution (amendment, precedence-ordered: seed.md → CLAUDE.md → impl)
- `docs/init/seed.md` — genesis. Line 208 (`commit` Phase 11), line 693 (§18 track inventory naming the freeform closing sequence `… → changelog → commit`). §17 Article XI citation must remain.
- `src/seed.template.md` — byte-mirror of seed.md (pre-§16 body); byte-parity test guards it.
- `CLAUDE.md` — Article IV rows 11 + 11.5 (lines 73–74) define Phase 11.5; line 92 freeform prose names the changelog step. Article VIII hook table (changelog shrink-guard is NOT a registered hook). 40,000-char cap enforced.
- `src/CLAUDE.template.md` — byte-mirror of CLAUDE.md; same cap; `audit-baseline` asserts byte-equality.
- `.claude/CONSTITUTION.md` (annex) — Appendix B skill index, line 82 lists `changelog (Phase 11.5)` under the phases category (11 phases); reference appendices.

### Governance counts (single source)
- `.claude/skills/audit-baseline/derive-counts.mjs` — `SKILL_CATEGORIES` editorial map: `phases: 11` (includes changelog), `phaseHelpers: 1`, etc.; `numToWord`/`SPELLED` for word-forms; audit asserts category sum == derived skill total (40). **Reclassifying changelog moves it out of `phases` (→ 10) into a generator bucket; total stays 40 but `categoriesWord` may change if a new category key is added.**
- `site-src/_data/baseline.cjs` — `categoriesWord: numToWord(Object.keys(SKILL_CATEGORIES).length)`; consumes the same map.
- `site-src/skills/core.njk` — line 61 describes `changelog` as "Phase 11.5"; line 144 `Phase helpers ({{ baseline.skills.byCategory.phaseHelpers }})`. The skill index page narrates categories.

### Other SOP references to changelog
- `.claude/skills/harness/SKILL.md` — line 119 phase-ordering (`/grant-commit → changelog → commit`); lines 171–172 state-machine rows invoking `Skill(changelog)` Phase 11.5 then commit.
- `.claude/skills/triage/SKILL.md` — line 16 (freeform prose), line 21 (non-git auto-except of `changelog`), line 59 (commit-bearing tracks auto-except), line 61 (canonical track shapes note).
- `.claude/skills/commit/SKILL.md` — references changelog as the preceding sub-step (grep hit; confirm exact wording at spec time).

### Project config (routing knob lives here)
- `.claude/project.json` — top-level keys: `git`, `swarm`, `consent`, `workflow`, `tdd`, … **no `changelog` key today.** A routing knob would be a new top-level key.
- `src/project.template.json` — pristine mirror; same shape, no changelog key.

## Entry points that reach this code

- `/changelog` slash command + `Skill(changelog)` — invoked by `/harness` between Gate C and `/commit`, and ad-hoc (`--preview-only`).
- `/triage` → materializer → seeds the `changelog` task into the TaskList for every commit-bearing track.
- CI `release` job (`npx semantic-release`) — the *other* writer to CHANGELOG.md.
- `/init-project` — currently no changelog routing; would be the scaffold offer point (AC-5). Only materializer reference found under `src/cli/` for changelog.

## Existing tests

- `.claude/skills/changelog/tests/*` — 7 tests (listed above); golden-path + idempotency cover the actuator, `keepachangelog-unreleased-preserved_test.mjs` documents the plugin collision (retire), preview-only covers projection.
- `tests/byte-equivalent-migration.test.mjs` (per seed.md §18) — guards track byte-equivalence; track DAG edits will interact with it.
- `src/seed.template.md` / `src/CLAUDE.template.md` byte-parity tests — will fail unless mirrors change in lockstep.
- `audit-baseline` (CI) — count/citation drift detector; gates the amendment.

## Constraints and co-changes

- **Five tracks + two mirrors must change coherently**: `.claude/workflows.jsonl` and `src/.claude/workflows.template.jsonl` (commit rewire), both materializer copies (label), or the build will drift.
- **Constitution precedence**: edit `seed.md` first, then `CLAUDE.md`, then `.claude/CONSTITUTION.md`; keep both `src/` mirrors byte-equal.
- **Count coherence**: `derive-counts.mjs` `SKILL_CATEGORIES` is the single source; `baseline.cjs` + `core.njk` + CONSTITUTION Appendix B + CLAUDE.md greeting all consume it. `audit-baseline` fails on any drift.
- **CHANGELOG.md ownership**: only semantic-release writes it; the migration must clean the 0.13.0 duplicate without disturbing the plugin's prepend point.
- **Shippability**: new generator helpers must be `.sh` or `.mjs`/`.js` (no Python); no dev-tree path refs in shipped SKILL.md.

## Patterns in use here

- Skills are `owner: baseline` SKILL.md + co-located `.mjs` helpers + a `tests/` dir with `run.sh`. State is JSON under `.claude/state/<skill>/<slug>.json`.
- The constitution is mirrored: canonical (`CLAUDE.md`, `seed.md`) + `src/*.template.md` byte-equal copies, asserted by tests + audit.
- Governance numbers flow from ONE editorial map (`SKILL_CATEGORIES`) outward to prose and site — never hardcode a count elsewhere.
- Track shape lives only in `workflows.jsonl` (+ pristine template); SOPs reference it, never re-template it (WF-5 de-duplication).

## Risks / landmines

- **`@semantic-release/git` default assets** — confirm CHANGELOG.md is in the default commit set (it is, by convention) before relying on CI to commit a cleaned file; if a routing data file ever needs committing back, assets must be made explicit.
- **Editorial category map** — adding a new category key changes `categoriesWord` (twelve → thirteen) across the site + CONSTITUTION + CLAUDE.md greeting; an omitted surface fails `audit-baseline`. The decision "new `generator` category vs fold into existing" is a research/spec call.
- **`commit/SKILL.md` coupling** — `/commit` may assume changelog ran just before it; verify it doesn't hard-require the changelog state file.
- **This workflow runs `/changelog` itself** (TaskList #16) under current rules before the amendment lands — expect one final `## [Unreleased]` curation, and the cleanup of the duplicate is itself part of the diff this workflow commits.
- **Stale `.claude/state/changelog/*` artifacts** — ~20 historical state/entries files exist; not load-bearing, but a cleanup decision (leave vs remove) belongs in the spec.
- **`docs/init/seed.md` is the governing genesis** — per CLAUDE.md, if the amendment conflicts with seed.md's shape, stop and surface drift before acting.
