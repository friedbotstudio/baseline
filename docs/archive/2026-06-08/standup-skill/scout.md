# Codebase Scout Report — add a `standup` recap skill

Scope: a new baseline-owned read-only utility skill (`SKILL.md` + `gather.mjs`) plus the governance count cascade 40→41. Scout ran with a structured intake (`docs/intake/standup-skill.md`) and brief (`docs/brief/standup-skill.md`).

## Primary touchpoints

### Structural template to copy (read-only utility skill, owner: baseline)
- `.claude/skills/audit-baseline/SKILL.md:1-5` — frontmatter shape: `name:` then `owner: baseline` on the next line (Article XI requires `owner: baseline` directly after `name:`). The model for a read-only, invoke-any-time utility that is NOT a workflow phase.
- `.claude/skills/audit-baseline/audit.mjs`, `.claude/skills/audit-baseline/derive-counts.mjs` — pattern for a skill shipping an importable `.mjs` helper with a `tests/` dir alongside.
- `.claude/skills/audit-baseline/tests/` — co-located test dir pattern for a helper.
- `.claude/skills/rca/` — second read-only example (SKILL.md + template.md), but rca writes an artifact; audit-baseline is the closer analog (no artifact, pure report).

### Helper (`gather.mjs`) structural precedents — shipped `.mjs`, importable
- `.claude/skills/memory-flush/sweep.mjs` — argv-driven Node ESM helper that reads/parses memory files; closest precedent for parsing `backlog.md`.
- `.claude/skills/triage/seed-tasklist.mjs` — Node ESM helper invoked as `node <path> <args>` and also importable; emits structured JSON to stdout. Good model for `gather.mjs` emitting a deterministic JSON recap.
- `.claude/skills/memory-flush/next-q-id.mjs`, `route.mjs` — small focused helpers.

### Memory files `gather.mjs` must parse
- `.claude/memory/backlog.md:1-12` — frontmatter (`key: <slug>-<4char-hash>`, `stale-exempt: true`); body entries carry `status: open|picked-up|dropped`, `parent: <key>`, `superseded-at:` (closure trigger), `> verbatim` blockquote. Epic parent→child resolution reads the `parent:` field (e.g. the `-9d4c` epic with children `-1a2d`, `-d186`, …).
- `.claude/memory/pending-questions.md:1-14` — frontmatter `key: Q-NNN`; entries are `## Q-NNN` with `- Question:`, `- Blocker for:`/`- Blocked for:`, `- Verified-at:`, `- Last-touched:` lines to condense.
- `.claude/memory/README.md` — canonical entry schema + provenance rules (re-verify before cite, Article IX).

### Release-state inputs (git + CHANGELOG)
- `CHANGELOG.md:1` — top entry is the last released version (`## [0.15.1]…`); owned by semantic-release, read-only here.
- Release rules for the semver-bump inference live in the `.releaserc`/release-workflow (CHANGELOG.md:189-203 documents the 0.x alpha cap: feat→minor, fix→patch, chore(release|site|ci)/build→no release). `gather.mjs` AC-2 must mirror this.

## Entry points that reach this code
- **On-demand:** `Skill(standup)` / `/standup` — invoked from main context any time (like `/audit-baseline`). No Track Guard interaction (not a workflow phase).
- **Session start (open question):** `.claude/hooks/memory_session_start.mjs:1-30` — SessionStart hook; builds the memory index + resume snapshot via `buildIndex` from `.claude/hooks/lib/memory_session_start.mjs`, emits `additionalContext` JSON kept under ~10KB. The auto-surfacing path either (a) extends `buildIndex` to append a standup section, or (b) adds a NEW SessionStart hook (bumps the 22-hook count → its own cascade). Decision deferred to research/spec.

## Existing tests
- `.claude/skills/audit-baseline/tests/` — the count-reconciliation checks; will start FAILing the moment a 41st `owner: baseline` skill lands until every count surface is bumped. This is the integration gate (AC-8).
- No existing test references `standup` (new surface).

## Constraints and co-changes (the 40→41 cascade — all must move in lockstep)

**Count surfaces (digit form `40`):**
- `CLAUDE.md:46` greeting "40 skills" — **mirror** `src/CLAUDE.template.md:46` (byte-equal, Article XI.4).
- `CLAUDE.md:279` Appendix B ref "all 40 skills" — mirror `src/CLAUDE.template.md:279`.
- `CLAUDE.md:281` quick-orientation "40 skills" — mirror `src/CLAUDE.template.md:281`.
- `README.md:44` "40 skills organised into thirteen categories".
- `docs/init/seed.md:112` tree comment "40 skills: artifact (4)+…" — mirror `src/seed.template.md:112`.
- `docs/init/seed.md:199` "### §4.3 Skills (40)".
- `docs/init/seed.md:552` Step 5 "40 skills" + the long category breakdown — mirror `src/seed.template.md:552`.
- `.claude/CONSTITUTION.md:96` Appendix A table "40 skills: artifact (4)+…".
- `.claude/CONSTITUTION.md:108` **Appendix B — Skill index** (the actual per-category skill LIST) — standup must be added to the list, not just the count.

**Category arithmetic (must sum to 41):**
- `.claude/skills/audit-baseline/derive-counts.mjs:26-39` `SKILL_CATEGORIES` — currently sums to 40. +1 to whichever category standup joins. Closest existing analog is `generators: 1` (the `whatsnew` on-demand read-state-and-report utility); standup is a sibling. Alternatively a new category. **Research/spec decision.** The category breakdown prose at seed.md:112/552 + CONSTITUTION.md:96 must match the chosen category.

**Number-word maps (audit calls numToWord; throws on unmapped):**
- `derive-counts.mjs:19` `NUM_WORDS` has `40: 'forty'` — add `41: 'forty-one'`.
- `audit.mjs:139` word→num has `forty: 40` — add `'forty-one': 41`.
- `audit.mjs:227` skills-count regex ends at `forty` — extend to accept `forty-one`.
- `audit.mjs:722` `NUM_GROUP` regex — add `forty-one`.

**Provenance + manifest (largely automated by build):**
- `obj/template/.claude/manifest.json` `owners.skills` is an **object/map** (40 entries, `slug → "baseline"`) + per-file sha256 in `files`. Regenerated by `scripts/build-manifest.mjs` (run from `scripts/build-template.sh:207`). Do NOT hand-edit — run the build to regenerate, then commit the updated `obj/template` manifest.
- `scripts/build-template.sh:142-149` Stage 1.5 ships a skill **iff** its SKILL.md frontmatter has `owner: baseline`; the new dir is auto-picked-up by rsync + the ownership filter. No manual manifest list to maintain (Article XI.2).
- `docs/init/seed.md` §17 (line 702) + `CLAUDE.md` Article XI — provenance prose; verify the "baseline-owned" framing still reads correctly (no count there, but the citation check at audit.mjs scans for "Article XI"/"§17").

## Patterns in use here
- Skill helpers are Node ESM (`.mjs`), argv-driven for CLI use AND `export`-ing pure functions for test import (see `sweep.mjs`, `seed-tasklist.mjs`). `gather.mjs` should follow: a pure `gather({rootDir})` returning a structured object, plus a thin CLI wrapper printing JSON. Determinism (AC-7) means no `Date.now()` in the output path — derive "today" only if needed and keep it out of the diffable core, or inject it.
- Counts have a **single source of truth**: `derive-counts.mjs` `SKILL_CATEGORIES` is the canonical category map; audit cross-checks every prose surface against it. Bump the map, then reconcile prose to match — not the reverse.
- The src/ template mirrors (`src/CLAUDE.template.md`, `src/seed.template.md`) are byte-equal twins of the live files; every count edit is a paired edit.

## Risks / landmines
- **The audit will FAIL the instant `gather.mjs`/SKILL.md land with `owner: baseline` and the counts aren't all bumped** — sequence the count cascade in the same change-set as the skill, or `/integrate` (which runs audit-baseline) blocks.
- **`numToWord(41)` throws if `forty-one` isn't added** to `derive-counts.mjs:19` — audit crashes rather than cleanly FAILing. Add the word-map entries first.
- **Two regexes (`audit.mjs:227`, `:722`) silently cap at `forty`** — if a surface ever renders the word form, the regex won't match `forty-one`. Surfaces currently use digits, but extend the regexes to be safe.
- **Manifest is generated, not authored** — forgetting to re-run `scripts/build-template.sh` (or `build-manifest.mjs`) leaves `obj/template/.claude/manifest.json` stale with 40 entries and a hash-drift FAIL.
- **Category placement is a genuine fork** (`generators`→2 vs a new category) that changes prose in 3+ places; resolve in research/spec before editing surfaces.
- **Session-start surfacing mechanism is unresolved** (extend `memory_session_start` vs new hook). The new-hook path triggers a parallel 22→23 hook cascade — materially larger scope. Flag to the user at the spec gate.
