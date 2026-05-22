# Codebase Scout Report — upgrade-no-replay-prompts

## Primary touchpoints

- `src/cli/install.js:13-17` — the `NEVER_TOUCH` frozen list (currently 3 paths: project.json, workflows.jsonl, schemas/workflow-track.v1.json). Adding `_pending.md` + `_resume.md` happens here.
- `src/cli/merge.js:87-95` — `NEVER_TOUCH.includes(rel)` check inside `threeWayMerge`'s per-file loop. Behavior on hit: preserve target if present (NEVER_TOUCH_PRESERVE), otherwise write from template (NEVER_TOUCH_ADD). No prompt fires.
- `src/cli/merge.js:154-157` — at end of `threeWayMerge`, writes `newManifest` (the v3 shipped manifest, `{sha256, tier}` per file) straight into `<target>/.claude/.baseline-manifest.json`. **See landmine #1 below — this is the wrong manifest shape for that path.**
- `src/cli/merge.js:129-135` — the `dispatchCustomized` call site. Where the reconciliation-marker check would slot in: before calling dispatchCustomized, consult the marker; if `newHash` matches the recorded reconciliation, treat as NOOP. Order of checks matters (NEVER_TOUCH → SPECIAL_MERGE → already-matches → matches-original → marker-says-reconciled-against-newHash → dispatchCustomized).
- `src/cli/upgrade-tiers.js:79-86` — `dispatchByTier`: maps `BINARY_PROMPT | MECHANICAL | SEMANTIC` to action kinds. Read-only for this work; tier names are stable.
- `src/cli/upgrade-tiers.js:66-77` — `findPendingStage(target)` scans `.claude/state/upgrade/*/manifest.json` for entries with `status: PENDING`. Returns null when none. Same scan pattern can detect "stage was resolved by /upgrade-project" (manifest still on disk with all `status: RECONCILED` or stage directory removed).
- `src/cli/manifest.js:5` — `MANIFEST_VERSION = 2`. The CLI-written per-target manifest is v2 (bare-string sha values, no tier field). Distinct from the shipped v3 manifest at `obj/template/.claude/manifest.json`.
- `scripts/build-manifest.mjs:16-29` — `NEVER_TOUCH_PATHS`, `SPECIAL_MERGE_PATHS`, `SEMANTIC_EXPLICIT`, `MECHANICAL_EXTENSIONS`. Build-time tier classification. **MUST stay in sync with `install.js`'s `NEVER_TOUCH` list** — adding `_pending.md` / `_resume.md` here AND in install.js are two halves of the same change.
- `scripts/build-manifest.mjs:91-99` — `classifyTier(rel, absPath)`. Order: NEVER_TOUCH_PATHS → SPECIAL_MERGE_PATHS → frontmatter override → SEMANTIC_EXPLICIT → MECHANICAL_EXTENSIONS → BINARY_PROMPT default.
- `.claude/skills/upgrade-project/SKILL.md:114` — the constitutional SHALL NOT: "You SHALL NOT touch `.claude/.baseline-prior/`, the installed `.baseline-manifest.json`, or any other CLI state." This is the structural reason no reconciliation marker exists today. Amending requires either editing this skill (option A of intake Q2) OR keeping it intact and having the CLI write the marker (option B).
- `bin/cli.js:234-260` — `dispatchUpgrade(target, values, templateDir)`. Non-TTY entry. Loads manifest, picks staged-pending vs run-merge path, calls TTY or non-TTY upgrade. Exit codes: 5 = SEMANTIC_MERGE_STAGED, 3 = kept-customized, 1 = abort.
- `src/cli/tui/upgrade.js:60` — the user-visible legacy-manifest warning. Copy-review surface for cli-copy-review phase.
- `src/cli/tui/upgrade.js:101-105` — end-of-run "Applied N updates; kept your version on M customized files. Re-run …" summary. Will change if M can be zero by construction.
- `src/cli/tui/upgrade.js:134` — per-file "<rel> has been customized — choose:" prompt template. Copy-review surface.
- `src/cli/doctor.js:71-83` — manifest consumption. Iterates `Object.entries(manifest.files)` and compares `actualHash === recordedHash` (string === string assumed). **See landmine #1 below.**
- `src/cli/doctor.js:88-93` — scans `<target>/.claude/` recursively for files NOT in `manifest.files`. Reports as `added`. Any new on-disk artifact (e.g., a `.baseline-reconciliations.json`) needs explicit exclusion or it'll surface as "added/unknown" on every doctor run.
- `.claude/hooks/memory_stop.sh:27` — defines `PENDING="$MEM_DIR/_pending.md"`. Appends `## CANDIDATE:` blocks to this file every turn-end. This is the proof that `_pending.md` body cannot be subject to upstream merge.
- `.claude/hooks/memory_pre_compact.sh:35` — writes `_resume.md` on PreCompact and Stop events. Same proof for `_resume.md`.
- `.claude/hooks/memory_session_start.sh:192-214` — already scans `.claude/state/upgrade/*/manifest.json` for PENDING entries and surfaces a one-line nag. Existing infrastructure pattern; the spec may reuse this scan shape for the "reconciliation marker" detection.

## Entry points that reach this code

- **CLI command**: `npx @friedbotstudio/create-baseline upgrade [target]` (and `--merge` legacy flag) — defined in `bin/cli.js` via `parseArgs` subcommand handling.
- **TTY path**: `bin/cli.js:248` → `src/cli/tui/upgrade.js` (Clack prompts).
- **Non-TTY / CI path**: `bin/cli.js:234` `dispatchUpgrade` → direct call to `threeWayMerge` with no prompts.
- **Skill (post-CLI)**: `/upgrade-project` — invoked reactively when CLI exits 5 with "Pending semantic-merge stage at <ts>" message.
- **Audit (consumer)**: `.claude/skills/audit-baseline/audit.sh:61` `load_manifest()` reads the v3 shipped manifest at `.claude/manifest.json` (consumer install) with fallback to `obj/template/.claude/manifest.json` (dev repo). Reads `owners.skills` for the canonical baseline-skill set and re-derives sha256 from `manifest.files` for hash-drift detection.

## Existing tests

| Test | Covers | Relevance |
|---|---|---|
| `tests/install.test.mjs:98` | "preserves an existing .claude/project.json (NEVER_TOUCH)" | Direct template for adding `_pending.md` / `_resume.md` NEVER_TOUCH tests. |
| `tests/merge.test.mjs:377` | "NEVER_TOUCH preserves project.json regardless of state" | Same — template for the merge-side NEVER_TOUCH test. |
| `tests/merge.test.mjs:177` | `threeWayMerge_customized_file_tier_MECHANICAL_then_dispatches_through_tier_module` | Confirms current MECHANICAL behavior for `_pending.md`/`_resume.md`; this test will need updating or a sibling because their tier flips to NEVER_TOUCH. |
| `tests/merge.test.mjs:151` | `threeWayMerge_customized_file_tier_BINARY_PROMPT_then_SKIP_CUSTOMIZED_action` | Documents BINARY_PROMPT fallback (legacy manifest path). |
| `tests/upgrade-tiers.test.mjs` (full file) | resolveBase / findPendingStage / dispatchByTier / writeStageBaseless | Comprehensive tier-dispatch coverage. The reconciliation-marker module will land alongside upgrade-tiers — tests likely live in the same file or a sibling `tests/upgrade-reconciliation-marker.test.mjs`. |
| `tests/upgrade-project.test.mjs:63-75` | SKILL.md content invariants (phrases required by tier1-merge-option spec) | If the spec amends SKILL.md:114, this test gains assertions about whether/where the marker write is declared. |
| `tests/doctor.test.mjs` (full file) | doctor report shape, exit codes | **Does not currently cover the v2/v3 manifest shape mismatch — see landmine #1.** New tests will need to verify doctor still passes against post-upgrade `.baseline-manifest.json` shape and against any new on-disk artifact (reconciliation marker) being correctly excluded from `added`. |
| `tests/manifest.test.mjs` (full file) | buildManifestFromDir / loadManifest / saveManifest | Round-trip shape coverage. If MANIFEST_VERSION bumps to 3 (option for the spec), tests here need the new shape. |
| `tests/workflows-install-upgrade.test.mjs` | end-to-end install + upgrade flows for workflows.jsonl | Pattern reference for fixture-based upgrade tests. |
| `tests/release-workflow.test.mjs` | release flow (semantic-release) | Pattern reference; not directly affected but worth eyeballing if the version-bump category changes. |

No test currently exercises the full `upgrade → /upgrade-project → upgrade-again` loop end-to-end. **This is intake Q5** — the spec must define a fixture shape (likely simulating the post-`/upgrade-project` state directly since we cannot invoke Claude inside a test).

## Constraints and co-changes

- **`NEVER_TOUCH` list ↔ manifest tier overlay**: `install.js:13-17` (runtime check) and `build-manifest.mjs:16-20` (build-time tier assignment) MUST stay in sync. Adding a path to one without the other creates a manifest-vs-CLI drift where merge.js short-circuits to NEVER_TOUCH but the shipped manifest still claims MECHANICAL/SEMANTIC tier. A regression test in `tests/manifest.test.mjs` or `tests/build-template.test.mjs` should assert the two lists are equal.
- **`.gitignore` already lists both files** (`/.gitignore` lines for `.claude/memory/_pending.md` and `.claude/memory/_resume.md`) — no change needed there. The `.gitignore` is the project-side authority that these files are runtime-state; the upgrade flow needs to learn the same.
- **`memory_stop.sh` and `memory_pre_compact.sh` will continue writing these files** every turn — no contract change. The upgrade just needs to stop being surprised by it.
- **Semantic-release / npm publish pipeline**: every push to main triggers a release (per user's bundled-ship rationale). The spec's choice of conventional-commit type for the final commit determines the version bump. NEVER_TOUCH addition + new on-disk marker artifact is most naturally a `fix` (resolves observed bug); could be `feat` if the reconciliation marker is framed as a new capability.
- **Shipped vs CLI-written manifests are TWO different files at different paths.**
  - Shipped: `<target>/.claude/manifest.json` (no dot prefix) — v3, has tier overlay, written by `scripts/build-manifest.mjs` during `npm run build` and copied into target by recursive cp during install.
  - CLI-written per-target: `<target>/.claude/.baseline-manifest.json` (dot prefix) — v2 per `src/cli/manifest.js:5`, bare-string sha values, written by `install.js:writeBaselineManifest` at install AND by `merge.js:156` at upgrade.

## Patterns in use here

- **Frozen-object configuration**: `Object.freeze([...])` for `NEVER_TOUCH`, `SPECIAL_MERGE`, `COPY_EXCLUDE`, `ACTION_KINDS`, `ACTION_LABELS`. New constants follow this pattern.
- **Tier-as-string with frontmatter override**: `build-manifest.mjs:80-89` reads `tier:` from per-file frontmatter as the highest-precedence override (after the hard-coded NEVER_TOUCH_PATHS / SPECIAL_MERGE_PATHS sets). Useful escape hatch — adding `tier: NEVER_TOUCH` to a SKILL.md frontmatter would override extension defaults, but the hard-coded sets are the more discoverable approach for system files.
- **Per-target state under `.claude/state/`**: `upgrade/<ts>/manifest.json`, `harness/<slug>.log`, `commit_consent`, etc. A new reconciliation-marker artifact would naturally live somewhere like `.claude/state/reconciliations/<rel>.json` OR `.claude/.baseline-reconciliations.json` (single-file map, mirrors `.baseline-manifest.json` siting). The choice is part of intake Q1; both have precedent.
- **NoBaseError exception class** for upgrade-tiers failure modes — typed errors with `kind` discriminator. The spec may want a similar typed-error shape for reconciliation-marker write failures (e.g., `MarkerWriteError`).
- **Content-addressed identity**: every cross-boundary comparison goes through sha256 hex strings. The marker's "reconciled against template hash X" record uses the same primitive.

## Risks / landmines

1. **Manifest shape inconsistency at `.claude/.baseline-manifest.json`.** `install.js:writeBaselineManifest` writes a v2 manifest (bare-string sha map). `merge.js:154-157` writes whatever `newManifest` object was passed in — which is the v3 shipped manifest with `{sha256, tier}` per entry. So after every upgrade, `.baseline-manifest.json` flips from v2 to v3 shape. `doctor.js:78` does `actualHash === recordedHash` assuming string-vs-string — a string vs object compare is always false, so post-upgrade doctor would mark every file as "customized." **No existing test catches this** (doctor.test.mjs presumably uses freshly-installed fixtures). This is independently broken and lurks underneath the work this intake describes; the spec should either fix it explicitly or document a deliberate workaround.

2. **`memory_session_start.sh:192-214` scans `.claude/state/upgrade/*/manifest.json` for PENDING entries.** The pattern is reusable for detecting "stage was resolved" (all entries RECONCILED or stage removed), but be careful: that hook also fires on session start regardless of harness state, so any signal it emits is broadcast-level not workflow-level. If the spec wires marker-write to a hook signal, account for the broadcast scope.

3. **Doctor's `added` scan at `doctor.js:88-93`** recursively lists `<target>/.claude/` and reports anything not in `manifest.files`. A new on-disk artifact (e.g., `.claude/.baseline-reconciliations.json`) will surface as `added` on every doctor run unless explicitly excluded. Two options: (a) add to a doctor-side ignore list parallel to manifest's self-skip; (b) include the marker file in the shipped manifest so it's "known" — but then its hash is part of drift detection, which feels wrong for a per-target ephemeral file.

4. **`/upgrade-project` SKILL.md:114 amendment is constitutional.** The skill's "no writes outside stage + LOCAL" rule is cited in spec acceptance criteria for the tier1-merge-option work. If option A (skill writes the marker) is picked, the spec must explicitly amend the SHALL NOT clause AND update `tests/upgrade-project.test.mjs:63-75` whose assertions verify SKILL.md content invariants.

5. **No end-to-end test of the upgrade → reconcile → upgrade-again loop.** Because Claude cannot run inside a test, the fixture has to simulate `/upgrade-project`'s post-reconciliation file state directly. The spec must define this fixture shape; expected location is `tests/fixtures/post-reconciliation/<slug>/` mirroring the existing `tests/fixtures/` pattern.

6. **`scripts/build-manifest.mjs` self-skip at line 134** excludes the manifest from hashing itself. If a new on-disk artifact is built into the template (unlikely for a per-target marker), it also needs a self-skip. Per-target artifacts don't need this.

7. **`COPY_EXCLUDE` at `install.js:25` is currently empty** but exists as the structural place to add never-copy paths during initial install. If the spec needs a "do not copy a placeholder reconciliation marker into a fresh target" rule, this is the lever.
