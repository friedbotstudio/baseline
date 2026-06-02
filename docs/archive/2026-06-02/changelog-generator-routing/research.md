# Pattern Research — changelog-generator-routing

This memo lays out the option space for four decisions the spec must make. Most are internal-architecture calls (no third-party API surface); where an external fact is load-bearing it is grounded against a version-pinned source.

**Grounding note.** The one external behavior this work depends on — how `@semantic-release/changelog@6.0.3` mutates `CHANGELOG.md` — is verified on disk by `.claude/skills/changelog/tests/keepachangelog-unreleased-preserved_test.mjs`, which loads the real plugin at the locked version and asserts: (1) `prepare` does **not** delete `## [Unreleased]`; (2) it prepends `nextRelease.notes` **above** existing headings. That pinned test is a stronger reference than context7 (which has no coverage for `@semantic-release/changelog` or `@semantic-release/git`; only related tools like release-please surfaced). Lockfile: `semantic-release@25.0.3`, `@semantic-release/changelog@6.0.3`, `@semantic-release/git@10.0.1`, `@11ty/eleventy@3.1.5`.

---

## Decision 1 — fragment format + schema

### Candidate 1A: JSON canonical (recommended)
- **Summary**: Generator emits a `.json` fragment — an array of entries, each `{ category, title, body, highlight? }`, no version field (version is read at publish time by the routing target).
- **API references (current)**: none external — `JSON.parse`/`stringify` (Node built-in). Eleventy 3.1.5 `_data/` ingests `.json` natively (relevant only to *this* repo's future routing target, out of scope here).
- **Fits**: Yes — Scout confirms the repo is JSON-native (`.claude/state/**/*.json`, `project.json`, all state files). Zero new dependencies.
- **Tests it enables**: schema-shape assertions on the emitted fragment; round-trip parse; "writes nothing to CHANGELOG.md" assertion.
- **Tradeoffs**: JSON is less hand-editable than YAML, but the generator *writes* the fragment — humans rarely hand-edit it — so that cost is theoretical. Comments aren't supported (irrelevant for machine output).

### Candidate 1B: YAML canonical
- **Summary**: Same entry shape, serialized as YAML for readability.
- **API references (current)**: would require adding a YAML parser (`yaml` / `js-yaml`) — **no YAML dependency exists in the lockfile today**. Eleventy supports YAML `_data` out of the box, but the baseline's own `_data` files are `.cjs`/`.json`/`.js`.
- **Fits**: Weakly — introduces a dependency the repo has so far avoided, for a readability gain on machine-generated output.
- **Tradeoffs**: New runtime dependency (supply-chain + `npm audit signatures` surface in CI); inconsistent with the repo's JSON-everywhere state convention.

**Pick: 1A (JSON).** The intake says "JSON or YAML-like structure"; JSON satisfies it with zero new dependencies and matches the repo's state convention. What flips it: if the spec decides the fragment must be routinely hand-authored by maintainers, YAML's editability could justify the dependency — but the generator-writes-it model makes that unlikely.

---

## Decision 2 — drop location + routing seam

### Candidate 2A: convention-only
- **Summary**: Generator always writes to a fixed path (e.g. `.claude/state/whatsnew/<slug>.json` or a `docs/` path); any routing workflow reads from there by convention. No config.
- **Fits**: Yes — mirrors how every other skill drops state under `.claude/state/<skill>/`. Zero config surface.
- **Tradeoffs**: A routing workflow must hardcode the pickup path; nothing *names* the routing target, so the generator can't point at or hand off to it.

### Candidate 2B: convention + optional `project.json` knob (recommended)
- **Summary**: Generator writes to the conventional path (2A); a **new optional top-level `project.json` key** (e.g. `changelog: { route_workflow: "<track-id>" | null }`) names the routing workflow. Absent/null → fragment sits unconsumed; present → the named workflow is the documented consumer.
- **API references (current)**: none external. Scout confirms `project.json` has **no `changelog` key today** — this is a clean additive key, with the `src/project.template.json` mirror updated in lockstep (read-time-default pattern per `conventions.md → workflow-json-read-time-defaults`, so legacy configs without the key keep working).
- **Fits**: Yes — matches the user's locked decision ("optional knob, convention fallback, neither mandatory"). Additive config keys with read-time defaults are an established pattern (Scout: `withDefaults`).
- **Tests it enables**: knob-absent → generator still succeeds, fragment at conventional path; knob-present → resolves the named routing target; malformed knob → clear error.
- **Tradeoffs**: One new config key to document + mirror; the routing *workflow itself* is project-authored (out of scope here, by design).

### Candidate 2C: required knob
- Rejected: forces every project to configure routing, violating intake AC-5 ("neither path mandatory").

**Pick: 2B.** Convention guarantees the generator is self-sufficient; the optional knob lets a project name its routing target without coupling. What flips it: if the spec finds no near-term use for *naming* the target (only reading it), 2A is simpler — but 2B costs little and matches the stated design.

---

## Decision 3 — reclassification + the count map

Scout: `SKILL_CATEGORIES` in `.claude/skills/audit-baseline/derive-counts.mjs` is the single editorial source (consumed by `baseline.cjs → categoriesWord`, `core.njk`, CONSTITUTION Appendix B, CLAUDE.md greeting). Today `phases: 11` includes `changelog`; total skills = 40; categories = 12 ("twelve"). `audit-baseline` asserts category-sum == derived total. Any reclassification keeps the total at 40 (skill is reclassified, not removed) but must keep the map coherent.

### Candidate 3A: new `generators` category (recommended)
- **Summary**: Add `generators: 1`; drop `phases: 11 → 10`. Total stays 40; category count 12 → 13 ("twelve" → "thirteen").
- **Fits**: Most semantically honest — the skill is no longer a phase; it is an on-demand generator. The new category reads cleanly in the skill index.
- **Tradeoffs**: Ripples `categoriesWord` ("twelve" → "thirteen") across `baseline.cjs` (auto-derived from `Object.keys` length — no manual edit), `core.njk` (new `§ Generators` section + TOC), CONSTITUTION Appendix B, and the CLAUDE.md greeting/Appendix. All mechanical and caught by `audit-baseline` if missed.

### Candidate 3B: fold into an existing category
- **Summary**: Move `changelog` into `sharedGlobals` (user-invokable globals; 7 → 8) or `maintenance` (1 → 2); `phases: 11 → 10`. Category count stays 12.
- **Fits**: Weaker — `sharedGlobals` is the least-wrong existing bucket (the generator is user-invokable), but it muddies that category's meaning; `phaseHelpers` is wrong (those are Step 0.5/1.5 gates).
- **Tradeoffs**: Fewer surfaces to touch (no new category, `categoriesWord` unchanged), but semantically blurs an existing category.

**Pick: lean 3A**, with 3B (fold into `sharedGlobals`) as the low-churn fallback. This is genuinely an editorial call the spec author owns. What flips it: appetite for the `categoriesWord` ripple vs. category-semantics purity. Either way `audit-baseline` enforces coherence, so neither can silently drift.

---

## Decision 4 — CHANGELOG.md migration (semantic-release stays sole owner)

### Candidate 4A: delete the `## [Unreleased]` section outright (recommended)
- **Summary**: Remove the `## [Unreleased]` heading **and** its duplicated body (the 0.13.0 content mirrored at `CHANGELOG.md:31`). Leave `# Changelog` + intro + version blocks. Retire `reinsertUnreleasedHeading` (only existed to maintain that heading).
- **API references (current)**: grounded by the pinned test above — `@semantic-release/changelog@6.0.3 prepare` prepends `nextRelease.notes` **above** existing headings and operates **independently** of `## [Unreleased]`. Therefore deleting that heading does not disturb the plugin's prepend behavior; future releases keep prepending version blocks as before.
- **Fits**: Yes — leaves CHANGELOG.md as a pure semantic-release artifact; removes the dual-ownership drift at its root.
- **Tests it enables**: post-migration CHANGELOG.md contains no `## [Unreleased]`; no duplicated version block; a simulated plugin `prepare` still prepends correctly.
- **Tradeoffs**: The existing structural quirk (the `# [0.13.0]` block sits *above* the `# Changelog` title — a plugin artifact from running without `changelogTitle`) is orthogonal; the spec may optionally normalize it, but that is the plugin's own output and not required by this work.

### Candidate 4B: keep an empty `## [Unreleased]` heading
- Rejected: nothing curates it once Phase 11.5 is gone, so it is vestigial; and since the plugin prepends *above* it, it drifts to the bottom over successive releases. Strictly worse than 4A.

**Pick: 4A.** What flips it: nothing within scope — 4B has no advantage once curation is removed.

---

## Recommendation (consolidated)

1. **JSON** fragment, entry array `{ category, title, body, highlight? }`, no stored version (1A).
2. **Convention drop + optional `project.json` knob** naming the routing workflow (2B).
3. **New `generators` category** in `SKILL_CATEGORIES` (3A), with fold-into-`sharedGlobals` (3B) as the low-churn fallback — spec author's editorial call.
4. **Delete `## [Unreleased]`** and retire the fallback writer; CHANGELOG.md becomes pure semantic-release (4A).

This keeps the change a clean subtraction (remove a mandatory phase + the curation machinery) plus one small additive seam (generic generator + optional routing knob), with `audit-baseline` enforcing count/citation coherence throughout.

## Open questions

- **Drop-location path** — `.claude/state/whatsnew/<slug>.json` (transient, gitignored-style) vs a tracked `docs/` path the routing workflow reads. Affects whether the fragment is committed.
- **Category decision (3A vs 3B)** — new `generators` category (honest, wider ripple) vs fold into `sharedGlobals` (low churn). Editorial.
- **Knob name + shape** — `changelog.route_workflow` vs `whatsnew.route_workflow`; value = track-id string or path. Naming should not imply the machine CHANGELOG.md.
- **`/init-project` offer** — does the recommender actively prompt to scaffold a routing workflow, or only document the opt-in-later path? (intake AC-5 allows both; spec sets the UX.)
- **Stale `.claude/state/changelog/*` artifacts** — ~20 historical files; leave vs prune as part of the cutover.
- **Out of scope, flag for the routing-target work**: `@semantic-release/git` default `assets` (whether CI would commit a routing data file back) — unverified here (no context7 coverage), and only relevant when *this* repo builds its "what's new" page later.
