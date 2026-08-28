# Codebase Scout Report — separate the staleness witness from the surfacing scope

Resolves both `## Open questions` from `docs/intake/stale-keying-and-glob-scope.md`.

Corpus reconcile ran in `mode: "reconcile"` (`workspace/cli.mjs reconcile`): delta `changed` = `memory-index-helpers`, `scoped-memory`, `staleness-predicate`; `unreferenced` = none. Annotation scan: 0 resolved in this slice, 0 dangling.

## Open question 1 — every `governs:` reader, classified

**STALENESS** — reads `governs:` to decide whether an entry needs re-verifying. Keeps reading `governs:`.

- `.claude/hooks/lib/staleness.mjs` — `isStaleFromFields` / `governsMatches` / `needsChangedSet`. The predicate itself.
- `.claude/skills/memory-sync/sweep.mjs:229` — `isStale` builds `fields.governs` via `splitList(readFieldValue(block, 'governs'))` and hands it to `isStaleFromFields`.
- `.claude/hooks/lib/memory_session_start.mjs:191` — the same call, structurally identical.

**SURFACING** — reads `governs:` to decide who sees the entry. Must follow the new field.

There are **two independent surfacing mechanisms**, not one. This is the finding that most changes the write set.

*Mechanism A — fires on editing a governed file, at any phase.*
- `.claude/skills/memory-index/resolve.mjs:107` — `resolveLookup('by_path', …)` filters `entries.filter(e => e.governs.some(glob => matchesGlob(glob, needle)))`. The actual matcher.
- `.claude/skills/memory-index/resolve.mjs:42` — `indexEntries` puts `governs` on each index row; feeds `:107`.
- `.claude/hooks/lib/governed-memory.mjs:51-75` — `surfaceGovernedMemory` calls `resolveLookup('by_path', …)` and hydrates hits. No direct field read; classified by what it delegates to.
- `.claude/hooks/process_lifecycle_guard.mjs:63-79` — `surfaceGovernedMemoryFor` composes the governed block into the advisory emitted before a write. No direct field read.
- `.claude/skills/workspace/queries.mjs:183` — `constraintsFor` calls `surfaceGovernedMemory` and filters to `constraints`. The `governs:` at `:188`/`:191` is an **output key name**, not a frontmatter read.

*Mechanism B — narrows already-phase-scoped hits to the workflow's declared write surface.*
- `.claude/hooks/lib/scoped-memory.mjs:42-48` — `entryPaths(entry)` returns `governs` when present, **else falls back to the entry's `key:`** when the key contains `/`, stripping a trailing `:<line>`. `narrowToWriteSurface` (`:50-56`) then keeps a hit whose paths are empty or overlap the surface.

**NEITHER — write-time validation.** Reads `governs:` to decide whether an entry may be written at all.

- `.claude/skills/memory-index/resolve.mjs:172-174` — `isReachable(entry)` = `phaseScopeOf(entry).length > 0 || asList(entry?.fields?.governs).length > 0`.
- `.claude/skills/memory-index/resolve.mjs:212-226` — `assertWritable` throws `UnreachableScopeError` at `:220` when `isReachable` is false, with the message "give it a phase `scope:` or a `governs:` glob".
- `.claude/skills/memory-index/resolve.mjs:196` — `malformedShapeReason` checks `['scope','governs'].filter(leg => entry[leg] !== undefined)` for a top-level misplacement.

**WRITERS / PROPOSERS** — emit `governs:` rather than consume it.

- `.claude/skills/memory-index/scope-narrow.mjs:34-35` — `evidenceFor` ranks a declared `governs:` above a path-shaped key above a body anchor. `:51-66` `proposeNarrowing`; `:71-80` `applyNarrowing` writes the field at `:77`. **This is the tool that produced the narrowing this workflow had to revert.**
- `.claude/skills/memory-index/constraints.mjs:63-74` — `renderConstraint` writes `governs:` into constraint frontmatter.
- `.claude/skills/memory-index/cli.mjs:51-60` — `--governs` flag for `constraint`; `:127-131` renders the scope-narrow report.
- `.claude/skills/lib/argv.mjs:29` — registers `governs` as a value flag.

**OTHER / NOT A READER**

- `.claude/skills/triage/retriage.mjs:35` — carries `governs` onto backlog entry objects as a clustering hint for epic grouping. Informational.
- `.claude/skills/memory-index/index-io.mjs:36-58` — hosts `matchesGlob`, the shared matcher both legs use. `MAX_WILDCARDS = 12`; returns false on over-cap and on regex compile failure.
- `.claude/skills/memory-index/categories.mjs:62-66` — `asList`, the shared splitter for every list-valued field.
- `.claude/hooks/lib/write-surface.mjs` — **zero occurrences**. Reads `workflow.json → write_surface` only.
- `.claude/skills/workspace/refs.mjs:57` — English verb in a comment. Reads `governed_by` and `rests_on`, never `governs`.
- `.claude/skills/harness/ratio.mjs:11` — English verb. Unrelated.
- `.claude/skills/memory-sync/shape.mjs:81` — comment only.

**No UNRESOLVED readers.** Every hit resolved to one of the categories above.

## Open question 2 — how `scope:` and `governs:` compose

They are **not one predicate**. `scoped-memory.mjs` applies them in sequence, and the composition is:

> surfaces iff `asArray(entry.fields.scope).includes(phase)` (`:20`, a hard AND) **and** — only when `writeSurface` is a non-empty array — `hit.paths` is empty (`:53` keeps it) or some member overlaps the surface (`:54`).

So on Mechanism B, `scope:` **gates** and `governs:` **narrows**. An entry not scoped to the phase never reaches the path check. Adding a third field makes neither redundant: the phase leg answers *when*, the path leg answers *which of those*.

Mechanism A is different again — `resolveLookup('by_path')` consults `governs` alone and never looks at `scope:`, so an entry with `scope: []` still surfaces when its governed file is edited.

**The spec needs a precedence rule for `entryPaths`**, because that function has a silent fallback: absent `governs:`, it uses the entry's own `key:` as a path (`:45-47`). A new surfacing field has to be ordered against both.

## Constraints and co-changes

**The reachability invariant can make an entry unwritable.** `isReachable` counts only `scope:` and `governs:`. If the split moves an entry's reach into a new field and leaves `governs:` empty, `assertWritable` throws and `/memory-sync` writes no file. Measured on the four in-scope entries: `a-red-pre-existing-test-may-be-a-contract-conflict`, `a-retrofit-guard-is-proven-by-re-breaking-what-it-guards` and `census-and-budget-are-different-numbers` all carry a non-empty `scope:` and survive on the phase leg. `grep-reports-no-match-on-utf8-files-it-calls-binary` carries `scope: []` — `governs:` is its only reachability, so it has no margin. `tests/memory-scope-reachability.test.mjs:83` pins the empty-plus-empty throw today.

**`governs:` is not in `LIFTABLE_FIELDS`, and works anyway.** `lift-fields.mjs:34-42` lists seven names; `governs` is absent, as is `STRUCTURAL_FIELDS` membership (`:46`). It reaches `entry.fields` because `toEntry` (`:197-206`) copies **any** `- name: value` body bullet. Two consequences: `strandedFieldBullets` (`:238-253`) never flags a stranded `- governs:` bullet, so `assertRelifted` never refuses on one; and migrate/relift never lifts it out of a body. A new field **added** to `LIFTABLE_FIELDS` would therefore behave differently from `governs:` — it would be lifted, and a stranded copy would block every sweep mode. README `:79` states the extension rule: "A name is liftable if and only if a named mechanical consumer reads it."

**`PATH_LEG_BASELINE`** (`tests/memory-scope-store-invariants.test.mjs:131-190`) counts `surfaceGovernedMemory(path).length` — i.e. **Mechanism A** — for four modules: `scoped-memory.mjs` 12, `memory-index/resolve.mjs` 16, `process_lifecycle_guard.mjs` 9, `harness/checker-fanout.mjs` 13. Its consumer is `:426-436`. Any change to what Mechanism A matches on moves these. The comments record five prior moves, each re-measured with the causing commit named, and `:435` asserts "the path leg Epic 7 slice C built must come through untouched". Two entries in the block note the census gate cannot auto-check this site: `literalPattern` matches `SYMBOL = <digits>`, never an object property, so re-measures here are by hand (backlog `census-gate-literal-pattern-matches-no-real-site`).

**Documentation, dev and shipped.**
- `.claude/memory/README.md:115-127` documents the two-leg reachability model, with a worked `scope: [] / governs: .claude/hooks/**` example at `:124-127`.
- `.claude/memory/README.md:101` documents `governs:` for `constraints`; `:111` for `decisions`. **The README never says the other six categories may carry it** — yet all four in-scope entries are `conventions`/`landmines`. The field is already under-documented relative to how it is used.
- `.claude/memory/README.md:41-56` is the canonical per-entry shape block and mentions neither `scope:` nor `governs:`.
- `obj/template/.claude/memory/README.md` is **byte-identical** to the dev copy (sha256 `5e2af4d7…`, `cmp` exit 0). One file to edit; the build carries it.
- `src/seed.template.md:172` is the **shipped** description of the path-governed trigger in the hook table. A split that leaves this line unchanged ships a lie.
- `src/memory/*.template.md` — nine shipped category files, **none mentions `governs:`**. `constraints.template.md` documents `state:` and `state_verified_at:` but not `governs:`, contradicting README `:101`. Pre-existing gap, not created here.
- `site-src/memory.njk:116` states "An entry names the paths it governs, and it goes stale when one of those paths changes" — the public sentence that **conflates the two roles** and becomes wrong after the split. `:144`/`:146` describe the write-surface narrowing. The literal string `governs:` appears nowhere in `site-src/`, so these are prose edits, not field renames.

**`applyNarrowing` is the sanctioned writer** (Article IX.3). Entry edits must leave body bytes, `verified-at` and `last-touched` unchanged.

## Existing tests

All green at scout time — 52 tests across the five suites below.

- `tests/memory-scope-relevance-filter.test.mjs` — 22 tests, Mechanism B (`narrowToWriteSurface`, `entryPaths`). Passing.
- `tests/memory-scope-reachability.test.mjs` — 6 tests, `isReachable` / `assertWritable`. `:54` pins scope-empty-governs-populated → reachable; `:83` pins empty-empty → throws. Passing.
- `tests/memory-governed-surface.test.mjs` — 6 tests, Mechanism A via `surfaceGovernedMemory`. Passing.
- `tests/memory-scope-ranking.test.mjs` — 6 tests, `byLoadBearingThenKey`. Passing.
- `tests/memory-scope-narrow.test.mjs` — 4 tests, `proposeNarrowing` / `applyNarrowing`. Passing.
- `tests/memory-scope-store-invariants.test.mjs` — 12 tests, live-store invariants incl. `PATH_LEG_BASELINE`. Passing.
- `tests/memory-staleness-witness.test.mjs` — drives `governsMatches` / `needsChangedSet` directly. Passing.
- `tests/assert-writable-malformed.test.mjs` — `malformedShapeReason` paths. Passing.
- `tests/memory-security-followup.test.mjs:73` — malformed glob `?` handling; relevant because a new field feeds the same `matchesGlob`.

## Patterns in use here

List-valued frontmatter is always split through `categories.mjs → asList` and always matched through `index-io.mjs → matchesGlob`; neither leg rolls its own. Fields reach `entry.fields` through `lift-fields.mjs → toEntry`, which is permissive on read and restrictive on lift. Surfacing helpers return `[]` on any missing input rather than throwing — `scoped-memory.mjs:79`, `governed-memory.mjs:52`, `write-surface.mjs:7-9` all document the same fail-open stance, stated there as "a missing signal is not evidence of irrelevance".

## Risks / landmines

- **The prior spec deliberately did not touch this field.** `docs/archive/2026-08-08/memory-scope-per-entry/spec.md:23` — "Changing the path-keyed leg that Epic 7 slice C built (`governs:`, `load_bearing:`). This spec consumes it; it does not alter its semantics." The two-jobs overload was inherited, never designed. That spec's AC-001 is the source of `isReachable`'s two-leg rule.
- **Two surfacing mechanisms, one field.** A design that teaches only `scoped-memory.entryPaths` about the new field leaves Mechanism A — the `process_lifecycle_guard` advisory, which is where a landmine actually reaches a maintainer — still reading `governs:`. That is the exact silent half-fix the intake warns about.
- **`entryPaths`' key fallback is load-bearing.** `scoped-memory.mjs:36-37` records that only 8 of 92 category-default landmarks declare `governs:`; the rest are filterable solely because their `key:` is a path. A new field must not disturb that fallback.
- **`matchesGlob` fails closed on complexity.** `index-io.mjs:34-40` caps at 12 wildcards and returns `false` over-cap; `:55-56` returns `false` on a regex compile failure. A wide surfacing glob that trips either cap silently stops surfacing.
- **The census gate cannot verify `PATH_LEG_BASELINE`.** Re-measures there are manual, and two comments in the block record that being forgotten.
