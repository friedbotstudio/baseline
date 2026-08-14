# Codebase Scout Report — codebugger-explanation-trace

Ran in **reconcile** mode (`memory.workspace.enabled` is true and `docs/system/elements/`
is populated), so this is a delta against the corpus, not a rediscovery.

**Corpus delta for the touched slice** — `changed`: `memory-hook-libs`,
`surfacing-triggers`, `tdd-helpers`. `unreferenced`: none. Three elements, not the whole
map, so the corpus is answering rather than re-deriving.

**Annotations** — `resolved`: 0. `dangling`: 0. Nothing in this slice carries a tracking
annotation, in or out of scope.

## Primary touchpoints

### The pattern to copy — `brainstorm`

- `.claude/skills/brainstorm/SKILL.md` — the four-stage skeleton (Stage 0 skip-check,
  Stage 1 derivation-first gap analysis, Stage 2 probe loop, Stage 3 confirm-and-persist),
  the caps (2 in Stage 2, 5 in Stage 3), the Character block, and the `final_state` return
  contract (`complete` / `skipped` / `needs_human`).
- `.claude/skills/brainstorm/discipline.mjs:36` — `scanTurn(text)`, the only export.
  Three pattern banks above it: `LIBRARY_NAMES:5`, `SOLUTION_PATTERNS:9`,
  `MULTIPLE_CHOICE_PATTERNS:25`. Returns violations; the SKILL.md rule is that a probe is
  scanned **before** it is emitted, and rewritten on any violation. This is the structural
  model for the witness scanner.
- `.claude/skills/brainstorm/brief-writer.mjs:32` — `writeBrief({outPath, slug, fields})`,
  the stable-section-order writer.
- Also present and worth reading before inventing equivalents:
  `skip-check.mjs:8,12` (`shouldSkip`, `shouldSkipForExistingBrief` — the idempotency
  short-circuit), `validate-call.mjs:7` (`validateCall`), `probe-loop.mjs:9`
  (`runProbeLoop({gaps, askFn})` — the cap-bounded iterator), `workflow-defaults.mjs:4`
  (`withDefaults`).
- Eight tests already exercise this shape: `tests/brainstorm-discipline-violation`,
  `-empty-request`, `-fires-on-intake`, `-invalid-calling-phase`, `-iteration-cap`,
  `tests/discipline-mc-probe`, `tests/intake-skip-brainstorm-regression`,
  `tests/skip-brainstorm-class`.

### The four artifact-directory rosters

Each is a hard-coded array. None is config-driven. Verified line numbers:

| Path | Symbol | Current contents |
|---|---|---|
| `.claude/skills/tdd/drift_check.mjs:67-78` | `EXCLUDED_DIFF_PREFIXES` | `docs/specs/`, `docs/archive/`, `docs/audits/`, `docs/rca/`, `docs/security/`, `docs/intake/`, `docs/scout/`, `docs/research/`, `docs/brief/`, `.claude/state/` |
| `.claude/hooks/lib/memory_stop.mjs:17-22` | `SKIP_PREFIXES` | `.claude/memory/`, `.claude/state/`, `docs/scout/`, `docs/research/`, `docs/intake/`, `docs/specs/`, `docs/brd/`, `docs/rca/`, `docs/security/`, `docs/archive/` |
| `.claude/hooks/process_lifecycle_guard.mjs:38-44` | `PHASE_BY_PREFIX` | `docs/specs/`→spec, `docs/intake/`→intake, `docs/scout/`→scout, `docs/research/`→research, `docs/security/`→security |
| `.claude/skills/archive/archive.sh:54-64` | `PAIRS` | six `docs/` sources plus three `.claude/state/` tokens, each mapped to a bundle filename |

`docs/debug/` appears in none of them. Consumers:
`isExcludedDiffPath` at `drift_check.mjs:80`, `isSource` at `memory_stop.mjs:24`,
`phaseForPath` at `process_lifecycle_guard.mjs:46`, the `for pair` loop at
`archive.sh:66`.

Note `phaseForPath` uses `norm.includes(prefix)`, not `startsWith` — a substring match,
unlike the other three.

### The track machinery

- `.claude/workflows.jsonl` — 11 records, one JSON object per line, 9 selectable + 2
  sub-tracks. `node .claude/skills/triage/seed-tasklist.mjs --validate-only` reports
  "validated 11 tracks" and exits 0.
- `.claude/schemas/workflow-track.v1.json` — `track_id` is `{type: string, minLength: 1}`
  with **no enum**. Closed enums exist only for `invariants`, `node.type`, and
  `Predicate.name`. A new track needs no schema change.
- `.claude/skills/triage/derive-exceptions.mjs` — `deriveExceptions` computes
  `(authored ∪ (allPhases − trackNodePhases − internalPhases)) − CONSENT_DENY_LIST`.
  `allPhases` is the union of `metadata.phase` over every track, so a new phase name is
  auto-excepted on every track that lacks it.
- `.claude/skills/triage/track-tasklist-materializer.js` — generic over any record.
- `.claude/hooks/track_guard.mjs:78-81, 113-118` — phase order and artifact globs come from
  `project.json → .workflow.phases / .workflow.artifacts`; an unmatched path hits
  `emitAllow()` and is **unguarded**. `TRACK_ID_TO_ENTRY_PHASE` at `:87-94` lists only 6
  of the 9 selectable tracks — `power`, `freeform`, and `org` are already absent.
- `.claude/project.json → workflow.artifacts` — the live phase→glob table. `docs/rca/` and
  `docs/brief/` are absent from it; they are not ordered phases.

### The gate-A path

- `.claude/commands/approve-direction.md` step 2 — "If `$ARGUMENTS` contains a `/`, treat
  it as a path (absolute or relative to repo root)." A trace path therefore works with the
  existing command.
- `.claude/hooks/direction_approval_guard.mjs:84` — content-scans only
  `docs/specs/*.md`. `:56` gates the approval token. `:54` blocks self-writes of the
  consent marker. `docs/debug/` is outside all three.

## Entry points that reach this code

- **`Skill(codebugger)`** — the new session. Nothing reaches it today.
- **Stop hook** → `.claude/hooks/memory_stop.mjs` → `lib/memory_stop.mjs` `isSource` —
  fires on every session stop, so it sees a trace file the moment one is written.
- **PreToolUse(Write|Edit|MultiEdit) + Bash** → `process_lifecycle_guard.mjs`
  `phaseForPath`.
- **harness drift-check-tick** → `node .claude/skills/tdd/drift_check.mjs --slug <slug>`,
  invoked between the last `verify-tick`/`design-ui-tick` and `tdd-finalize`.
- **`Skill(archive)`** → `.claude/skills/archive/archive.sh <slug>`.
- **`/triage` step 5b** → reads `workflows.jsonl` and ranks selectable tracks by
  `name` / `description` / `selector_hints`.

## Existing tests

418 test files under `tests/`. The ones this work touches:

- `tests/drift-check-working-tree-diff.test.mjs:199` — `REPORT_DIRS` = `docs/audits`,
  `docs/rca`, `docs/security`, `docs/intake`, `docs/scout`, `docs/research`, `docs/brief`.
  Generates one case per directory asserting exit 1 when an AC appears only in that
  directory's prose. This is the canonical artifact-dir roster **in tests**; `docs/debug`
  is missing from it. Passing.
- `tests/archive-brief-pairs.test.mjs` — asserts the `archive.sh` PAIRS row for
  `docs/brief/`. The model to copy. Passing.
- `tests/memory-stop-dedup.test.mjs`, `tests/memory-stop-recall.test.mjs` — cover
  `lib/memory_stop.mjs`. Neither asserts `SKIP_PREFIXES` contents directly.
- `tests/derive-counts.test.mjs:34,39,140,152-154,162` — deep-equals `EXPECTED_TRACKS`,
  and cross-checks the MCP server count and name list against `.mcp.json`.
- `tests/committing-tracks-declare-archive.test.mjs` — a track declaring `grant-commit`
  must declare `archive` unless in `ARCHIVE_EXEMPT`.
- `tests/whatsnew-tracks.test.mjs` — every selectable track: no `changelog` node,
  `commit.depends_on === ['grant-commit']`.
- `tests/track-count-truth.test.mjs` — couples the live `workflows.jsonl` to the template
  copy.
- `tests/document-routing-gate.test.mjs:136-150` — an `exempt` list of artifact paths that
  owe no documentation register.
- **No test file covers `process_lifecycle_guard.mjs`** — `ls tests/ | grep lifecycle`
  returns nothing.

## Constraints and co-changes

**Count-bearing surfaces, verified by grep.**

Skills 58 → 59: `CLAUDE.md:276,278`; `src/CLAUDE.template.md:276,278` (byte-equal mirror);
`README.md:49` and the category table row; `docs/init/seed.md:116,219,665` and
`src/seed.template.md:116,219,665`; `.claude/CONSTITUTION.md:174,235` plus the Appendix B
index row; `site-src/skills.njk:5` (`"Fifty-eight skills,<br>all in main context."`) and
`:10` (`value: "58"`); `.claude/skills/audit-baseline/derive-counts.mjs:31-47`
`SKILL_CATEGORIES` (sum must equal the new total).

MCP 4 → 5: `CLAUDE.md:278` + mirror; `docs/init/seed.md:337` (`### §4.5 MCP servers (4)`)
+ mirror; `site-src/mcp.njk:4,5,10`; `README.md:106`;
`.claude/skills/audit-baseline/expected-baseline.mjs:52-53`.

Tracks 9 → 10: `README.md:49`; `docs/init/seed.md:848,969`;
`site-src/workflows.njk:3,4,5,10`; `expected-baseline.mjs:57` (`EXPECTED_TRACKS`).

**`site-src/_data/mcpnotes.json` throws the build.** `site-src/_data/roster.cjs:228-235`
compares its keys against `.mcp.json` in both directions and throws
`mcpnotes.json out of sync with .mcp.json` on any divergence. Current keys: `context7`,
`plantuml`, `playwright`, `sprint-channel`. A fifth server without a note is a hard
eleventy build failure, not a soft warning.

**`numToWord` needs nothing new.** `derive-counts.mjs:19-25` `SPELLED` already maps
`5: 'five'` and `10: 'ten'`. `site-src/_data/baseline.cjs:27,30,31,34,49` calls
`numToWord` only for hooks, categories, sharedGlobals, subagents, and mcpServers — **not**
for the skills total, so no entry for 59 is required. The skills word form on
`site-src/skills.njk:5` is a hand-written literal.

**Mirrors.** `src/CLAUDE.template.md` is byte-equal (Article XII.4, synced by
`npm run sync:constitution`). `src/seed.template.md` mirrors seed.md.
`src/.mcp.template.json` mirrors `.mcp.json` (audited by `checks/src-templates-b.mjs:13`).
`src/.claude/workflows.template.jsonl` is the pristine track source — the live
`.claude/workflows.jsonl` is `--exclude`d from the template rsync and is `NEVER_TOUCH` in
`scripts/build-manifest.mjs`, so both files need the new record.

**Manifest.** `obj/template/.claude/manifest.json` carries per-file sha256 + `owners.skills`
(58 entries). A new or edited baseline skill requires `bash scripts/build-template.sh` to
restamp, or `checks/skill-ownership.mjs` FAILs on hash drift.

## Patterns in use here

Helpers are small single-purpose ESM modules beside their `SKILL.md`, each exporting one
or two named functions and holding their pattern banks as module-level `const` arrays
above the export. The SKILL.md carries the protocol prose and calls the helper by
`file.mjs → exportName`; the helper carries no protocol. Rosters that guards consult are
plain arrays of string prefixes with a one-line predicate beneath them. Governance counts
are derived from disk by `derive-counts.mjs` and asserted against prose surfaces by
`audit-baseline`, so prose and code are expected to be swept together in one change-set.

## Risks / landmines

- **`drift_check.mjs` is the load-bearing omission.** `docs/debug/` absent from
  `EXCLUDED_DIFF_PREFIXES` means a trace discussing `AC-011` at length resolves `AC-011` as
  satisfied. `tests/drift-check-working-tree-diff.test.mjs:201` names this exactly: "workflow
  prose is not evidence (AC-011)". A new artifact dir that skips this roster reintroduces
  the defect the roster exists to prevent.
- **`phaseForPath` uses `includes`, not `startsWith`.** Copying the `docs/debug/` row into
  `PHASE_BY_PREFIX` inherits substring matching. A path such as
  `docs/archive/2026-01-01/x/docs/debug/…` would match. That is the existing behavior for
  all five current rows, so it is a consistency note, not a new defect.
- **The audit's skills-count regex cannot see the seed.md word form.**
  `.claude/skills/audit-baseline/checks/counts.mjs:22` matches
  `\d+|twenty-…|thirty…|forty-one|forty-two|forty` — **no `fifty-*` alternative**.
  `docs/init/seed.md:14` currently reads "fifty-two skills", which is stale by six and
  which the regex silently skips, so `findCount` falls through to the first digit form.
  The count check therefore passes today on a wrong word. Correcting line 14 to
  "fifty-nine" will still not be verified by the audit unless the regex gains the
  alternative.
- **A landmine names a file that no longer exists.**
  `.claude/memory/landmines/baseline-skill-count-cascade.md:12` instructs adding an `<li>`
  to `site-src/skills/core.njk`. That path is absent — `ls site-src/` shows a flat
  `skills.njk` and no `skills/` directory. Re-verification failed; the entry needs
  correcting in the same run that touches it (Article IX.2).
- **`workflows.jsonl` is `NEVER_TOUCH`.** Existing consumer installs receive a new track
  only through `/init-project doctor`, never a plain upgrade. Any documentation of the
  `debug` track must say so or consumers will report it missing.
- **`process_lifecycle_guard.mjs` has no test file.** Editing `PHASE_BY_PREFIX` there
  changes guard behavior with no regression net. A test is a co-change, not an optional
  extra.
- **`track_guard`'s unmatched-path fail-open.** If `docs/debug/*.md` is not registered in
  `project.json → workflow.artifacts`, `track_guard.mjs:118` allows the write with no
  ordering check at all. Silence here reads as "guarded" and is not.
