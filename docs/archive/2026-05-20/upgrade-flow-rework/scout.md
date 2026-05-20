# Codebase Scout Report — upgrade-flow-rework

## Primary touchpoints

### CLI dispatch
- `bin/cli.js:316-325` — `upgrade` positional triggers `dispatchUpgrade(target, values, templateDir)`.
- `bin/cli.js:224-247` — `dispatchUpgrade()` resolves `<target>/.claude/.baseline-manifest.json`; if missing, errors out; if TTY, hands off to `src/cli/tui/upgrade.js → run()`; non-TTY routes to `runPlainUpgrade()`.
- `bin/cli.js:248-269` — `runPlainUpgrade()` loads old + new manifests, invokes `threeWayMerge()`, logs each `action.kind`, returns `report.exitCode`.

### TUI upgrade flow (the screenshot's behavior)
- `src/cli/tui/upgrade.js:22-26` — **`CHOICE_OPTIONS`**: the three strings the user sees today.
  - `'keep-mine' / 'Keep mine' / preserve target file as-is'`
  - `'take-theirs' / 'Take theirs' / overwrite with new baseline'`
  - `'abort' / 'Abort' / exit without changes'`
- `src/cli/tui/upgrade.js:28-78` — `run()`: dry-runs `threeWayMerge` once to enumerate `SKIP_CUSTOMIZED` conflicts, then prompts per conflict with `prompts.select()`, then re-runs the merge for-real with a Map of user choices fed via `onSkipCustomized`. The "plan/apply split" comment at the top spells out the contract.
- `src/cli/tui/upgrade.js:51-61` — the actual prompt loop. `message: ${conflict.path} has been customized — choose:` (matches the screenshot verbatim).

### Merge engine
- `src/cli/merge.js:8-18` — `ACTION_KINDS`: ADD, OVERWRITE, NOOP, **SKIP_CUSTOMIZED**, PRUNE, PRUNE_SKIPPED_CUSTOMIZED, NEVER_TOUCH_PRESERVE, NEVER_TOUCH_ADD, SPECIAL_MERGE.
- `src/cli/merge.js:25-112` — `threeWayMerge(templateDir, target, oldManifest, newManifest, opts)`. The misleadingly-named "three-way" is actually **a 2.5-way decision matrix on three sha256 hashes** (old, new, target). It compares hashes, never content — the BASE *content* is not available, only its hash from `.baseline-manifest.json`. This is the structural blocker for true `diff3` merge.
  - Branch at `merge.js:76-85` is the customization branch — when target ≠ old AND target ≠ new, calls `onSkipCustomized(rel)` or defaults to `'keep-mine'` and emits `SKIP_CUSTOMIZED`.
  - Branch at `merge.js:70-74` is the "fast-forward" — when target hash == old hash, copies new template content over (clean overwrite).
- `src/cli/merge.js:109-111` — exit code 3 when any action is `SKIP_CUSTOMIZED` or `PRUNE_SKIPPED_CUSTOMIZED`.

### Manifest read/write
- `src/cli/manifest.js:7-10` — `hashFile(path)` returns sha256 hex of file bytes.
- `src/cli/manifest.js:12-21` — `loadManifest(path)` returns null on ENOENT, parsed JSON otherwise.
- `src/cli/manifest.js:23-25` — `saveManifest(path, m)` writes pretty-printed JSON + newline.
- `src/cli/manifest.js:27-38` — `buildManifestFromDir(rootDir, fileList)` produces `{manifest_version: 1, generated_at, files: {rel: sha256}}` for the *installed* `.baseline-manifest.json`. **Has no `owners` field; has no `baseline_version` field.**
- `scripts/build-manifest.mjs:39-72` — `collectOwnersFromTemplate()` reads `owner:` frontmatter from every `.claude/skills/<slug>/SKILL.md` and emits **`manifest.owners.skills`** (only `owner: baseline` lands in the map; absence is silently skipped per Article XI policy).
- `scripts/build-manifest.mjs:86-93` — built template manifest at `obj/template/.claude/manifest.json` is **shape `manifest_version: 2`** with `files`, `owners.skills`, and optional `build_id`.

**Two manifest shapes coexist in the codebase:**
- `manifest_version: 2` — shipped *template* manifest at `obj/template/.claude/manifest.json` (built by `scripts/build-manifest.mjs`, copied to `<target>/.claude/manifest.json` by the recursive install). Has `owners.skills`.
- `manifest_version: 1` — runtime *installed* manifest at `<target>/.claude/.baseline-manifest.json` (written by `saveManifest` in `merge.js:106`). Just `files`. **No `baseline_version` field today — this is the new field the rework's BASE-recovery needs.**

### Allowlists for special behavior
- `src/cli/install.js:13` — `NEVER_TOUCH = ['.claude/project.json']` (preserved across upgrade).
- `src/cli/install.js:14` — `SPECIAL_MERGE = ['.mcp.json']` (additive deep-merge via `deepMergeMcpServers`).
- `src/cli/install.js:21` — `COPY_EXCLUDE = []` (currently empty list, kept for forward-compat).

These are exactly the lists the rework needs to extend: a new `SEMANTIC_MERGE = [...]` and a new `MECHANICAL_MERGE = [...]` allowlist (or the manifest carries per-file tier classification, decided in research/spec).

### Audit reads the manifest
- `.claude/skills/audit-baseline/audit.sh:52-72` — `load_manifest()` checks `<root>/.claude/manifest.json` then `<root>/obj/template/.claude/manifest.json`. The canonical baseline-skill set comes from `manifest.owners.skills` keys (`audit.sh:227-231`). The semantic-merge owner check SHALL use the same source to keep Article XI consistent.

## Entry points that reach this code

- **CLI**: `npx @friedbotstudio/create-baseline upgrade [target]` → `bin/cli.js:316` → `dispatchUpgrade()` → TUI flow (interactive) or `runPlainUpgrade()` (CI/pipe).
- **Library use**: `src/cli/merge.js → threeWayMerge()` is the public-ish surface; called by both upgrade paths and exercised directly by `tests/merge.test.mjs`.
- **New entry the rework introduces**: `Skill(upgrade-project)` invoked in Claude Code by a user typing `/upgrade-project`, reads staged artifacts on disk produced by the CLI's tier-3 path.

## Existing tests

- `tests/upgrade.test.mjs` (129 lines) — `tui/upgrade` integration tests using a stubbed `@clack/prompts`. Covers: take-theirs overwrites file (lines 71-88), abort returns exit 1 and tree unchanged (90-108), Ctrl+C / `isCancel` returns exit 1 and tree unchanged (110-128). **All assertions on the string "CLAUDE.md" via regex `c.message`** — verbiage changes will not break them, but a new "Show diff" option will need its own test.
- `tests/merge.test.mjs` (171 lines) — direct unit tests on `threeWayMerge`. First-test (lines 29-49) covers SKIP_CUSTOMIZED + ADD on fresh install. Remaining tests cover the OVERWRITE branch, PRUNE branches, SPECIAL_MERGE path. **No existing coverage for the new 3-way + BASE-content path** since BASE content has never existed.
- `tests/manifest.test.mjs` — manifest read/write coverage, MANIFEST_VERSION constant, hash determinism.
- `tests/cli-tui.test.mjs` — broader TUI rendering (splash, install). Not directly upgrade.
- `tests/conflict.test.mjs` — install-time conflict detection (sentinel files at fresh-install target).
- `tests/cli.test.mjs` — argv parsing, dispatch tests; covers the `--upgrade-as-flag` hint (`bin/cli.js:137`).
- `tests/install.test.mjs` — `freshInstall()` coverage.

None of the tests are skipped or flaky; recent commit `e2927c7` (BASELINE wordmark splash + manifest relocation) updated this set and they pass at HEAD.

## Constraints and co-changes

- **Manifest shape evolution.** Adding `baseline_version` to the installed manifest requires bumping `MANIFEST_VERSION` (currently 1 in `src/cli/manifest.js:5`) AND handling reads of manifest_version=1 (no baseline_version) gracefully — the BASE-recovery path needs a fallback (intake AC 10).
- **Build pipeline.** `scripts/build-manifest.mjs` emits the shipped template manifest. If the rework wants the *template* manifest to carry per-file tier classification (mechanical / semantic / binary-prompt), `build-manifest.mjs` is the writer.
- **Skill provenance (Article XI).** `manifest.owners.skills` is the canonical baseline-owned-skill enumeration. Any "owner check" the semantic-merge logic does SHALL read from this map (and from absence-of-frontmatter for non-skill files, which is its own problem — only skills currently have owner frontmatter).
- **NPM package metadata.** `package.json` is what `npm view @friedbotstudio/create-baseline versions` reads. If BASE recovery re-fetches by version, the network surface is the public npm registry.
- **State directory hooks.** Ten hooks read `.claude/state/` paths (`spec_approval_guard.sh`, `swarm_approval_guard.sh`, `memory_stop.sh`, `git_commit_guard.mjs`, `harness_continuation.sh`, `consent_gate_grant.mjs`, `memory_session_start.sh`, `verify_pass_guard.sh`, `swarm_boundary_guard.sh`, `track_guard.sh`). A new `.claude/state/upgrade/` subdir is safe — none of these hooks watch that path today. The harness marker (`.claude/state/.harness_active`) and harness_state file pattern is the convention to mimic for stage-state records.
- **No existing `.baseline-*` staging conventions.** Greppable check produced zero hits — the suffixes `<path>.baseline-incoming` / `<path>.baseline-base` (intake AC 4) are collision-free.
- **Skill directory convention.** All 37 skills live at `.claude/skills/<slug>/SKILL.md` with frontmatter `name`, `owner: baseline`, `description`. The new `/upgrade-project` skill SHALL follow this exact shape; the audit + manifest builder will pick it up automatically once the file exists.
- **Source template mirror.** `src/CLAUDE.template.md` and `src/seed.template.md` mirror `CLAUDE.md` and `docs/init/seed.md` per Article XI item 4. If the rework cites itself in CLAUDE.md (e.g., a new "Article" line or amendment), both files need byte-equal updates.

## Patterns in use here

- **Plan/apply split.** The upgrade TUI dry-runs the merge to enumerate conflicts, prompts the user once per conflict, then re-runs the merge for real. This pattern is documented in `src/cli/tui/upgrade.js:1-6` and SHOULD be preserved in the rework — semantic-merge staging fits cleanly because the "plan" phase enumerates which files need staging.
- **Action-record contract.** Every merge decision produces a `{kind, path, reason}` record in `report.actions`. Two new action kinds will likely be needed: `MECHANICAL_MERGE_CLEAN`, `MECHANICAL_MERGE_CONFLICTED`, `SEMANTIC_MERGE_STAGED`. The exit-code logic at `merge.js:109-111` extends by adding the conflicted-mechanical and staged-semantic kinds to the "non-zero exit" set.
- **Hash-only comparison.** `hashFile()` + sha256-string compare is the only mechanism the merge uses today. The rework adds *content* reads but only for files in the mechanical/semantic allowlists — preserving the hash-only fast path for the 95% of files that need no merge.
- **TTY vs non-TTY split.** `dispatchUpgrade()` branches on `process.stdout.isTTY`. The TUI flow is `@clack/prompts`-based with branding; the plain flow is line-per-action stdout. Both paths need verbiage updates; only the TUI gets the "Show diff" option (no realistic non-TTY equivalent — non-TTY users get the full unified diff dumped to stdout, or skip).
- **Frozen-object allowlists.** `NEVER_TOUCH`, `SPECIAL_MERGE`, `COPY_EXCLUDE` are all `Object.freeze`d arrays exported from `install.js`. New allowlists SHALL follow the same shape and live in `install.js` (or a new `tiers.js` if the file grows unwieldy — spec decision).

## Risks / landmines

- **The word "three-way" is already in the help text.** `bin/cli.js:21` describes `upgrade` as "three-way merge against an installed baseline". This is *aspirationally* true today but mechanically false — the current implementation is a hash-only 2.5-way classifier. The rework either makes the help text honest or the inconsistency persists. Recommend the spec phase calls this out and the documentation phase updates the help text in lockstep with the new behavior.
- **`runPlainUpgrade()` exists but is undertested.** The TUI path has integration tests; the non-TTY path at `bin/cli.js:248-269` is exercised only via end-to-end CLI tests. The rework SHALL add coverage for non-TTY behavior on every new tier (especially: how does non-TTY handle a semantic-merge stage? Probably exit 3 + machine-readable list of staged paths).
- **`MANIFEST_VERSION` bump cost.** Bumping `MANIFEST_VERSION` from 1 → 2 in `src/cli/manifest.js:5` cascades into every reader. A consumer running `upgrade` from a project last-installed with `manifest_version: 1` (no `baseline_version` field) needs a graceful path — intake AC 10 captures this but the spec needs to detail the exact migration semantics.
- **Manifest sha256-to-published-version reverse lookup is non-trivial.** Intake AC 10 proposes "query npm for matching published versions" when `baseline_version` is missing from an old manifest. In practice this means downloading every recent `@friedbotstudio/create-baseline` tarball, building each one's manifest, and finding a sha256 set match. Slow + bandwidth-heavy. Research phase SHOULD evaluate whether this is worth it vs. just falling back to the tier-1 binary prompt for legacy manifests.
- **The CLI exit-code contract.** Today: 0 = clean, 1 = abort/cancel, 2 = usage/manifest-missing, 3 = customizations skipped. The rework adds new states (semantic-merge-staged-pending, mechanical-merge-conflicted-on-disk). These need explicit exit codes — probably 4 and 5 — and CI systems that key on exit 3 today need a migration note.
- **`@clack/prompts` `select` doesn't natively support a "Show diff and re-prompt" loop.** The Tier-1 "Show diff" option (intake AC 1) needs to re-prompt the same `select` after the diff renders. Library check: does `@clack/prompts` recurse cleanly? Probably yes via just calling `prompts.select()` again, but the prompt history will accumulate in the TTY — research phase should confirm the UX is acceptable, otherwise reach for a custom prompt loop.
- **`obj/template/` is generated.** Any sample manifest under `obj/template/` SHALL NOT be hand-edited by the rework. The source of truth is `scripts/build-manifest.mjs`.
- **Hook frontmatter detection is fragile.** `scripts/build-manifest.mjs:39-45` parses `owner:` with a hand-rolled regex (`/^owner:\s*(\S+)\s*$/m`). If the rework introduces per-file tier classification via frontmatter, it SHALL extend this parser carefully — easy to introduce silent skips.
- **`CHANGELOG.md` and `CHANGELOG-AUDIT.md` are separate.** Per recent commit history, there's a `## [Unreleased]` curation flow via `/changelog` (Phase 11.5). The rework's entries need to land there; not a constraint per se, but a reminder.
