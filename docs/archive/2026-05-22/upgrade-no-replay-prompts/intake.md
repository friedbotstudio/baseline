# Stop create-baseline upgrade from re-prompting on structurally-divergent files

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

`npx @friedbotstudio/create-baseline upgrade` prompts the user about "customized" files that are not customizations at all — they're files whose local content has drifted from the shipped template for reasons unrelated to upstream changes the user might want to merge.

Two concrete failure modes observed in production:

**Failure mode A — runtime-state files prompt every upgrade.** `.claude/memory/_pending.md` and `.claude/memory/_resume.md` are declared `tier: MECHANICAL` in `obj/template/.claude/manifest.json` and are absent from the `NEVER_TOUCH` list at `src/cli/install.js:13-17`. Their bodies are gitignored (`.gitignore` lists both) and rewritten every conversation turn by `memory_stop.sh`, `memory_pre_compact.sh`, and `/memory-flush`. The on-disk hash will essentially never match the shipped template hash, so every upgrade reports them as customized and asks the user to keep-or-take. There is no merge that makes sense — the file's structural lifecycle (write-heavy at runtime, skeleton-only at ship) is incompatible with the upgrade flow's static-file diff model.

**Failure mode B — post-reconciliation files re-stage every release.** A user runs `create-baseline upgrade`, sees `docs/init/seed.md` flagged as customized, accepts the SEMANTIC tier's stage-for-`/upgrade-project` outcome. Then runs `/upgrade-project`, which reconciles seed.md (e.g., accepts INCOMING's `consent.commit_ttl_seconds: 300 → 900` bump, keeps LOCAL's §16 user customizations) and deletes the stage. On the next `create-baseline upgrade` (with no upstream changes to seed.md), the file is re-staged again. The CLI compares `tgtHash` (reconciled local) against `newHash` (shipped template) — they still differ because the user's §16 customizations permanently diverge from the template's `*Reserved.*` placeholder. There is no on-disk record that says "user has already reviewed this file against template hash X" so the CLI cannot distinguish freshly-reconciled-and-current from pre-reconciliation-drift. The `/upgrade-project` skill is explicitly forbidden from writing to `.baseline-manifest.json` (`.claude/skills/upgrade-project/SKILL.md:114`), so even the cleanest reconciliation leaves no trace the CLI can use.

Concrete user-visible session from this project (commit `4e5395d`):

```
◇  .claude/memory/_pending.md has been customized — choose:
│  Keep your version
◇  .claude/memory/_resume.md has been customized — choose:
│  Keep your version
◇  docs/init/seed.md has been customized — choose:
│  Keep your version
└  Applied 1 update(s); kept your version on 3 customized file(s).
   Re-run `create-baseline upgrade` if you want to revisit those choices.
```

All three prompts are structural false positives. The user previously ran `/upgrade-project` and accepted reconciliations; the CLI has no memory of that.

## Goal

`create-baseline upgrade` against an unchanged baseline produces zero prompts. A real upstream change to a user-customized file still surfaces (either as a merge candidate for MECHANICAL tier or as a stage for `/upgrade-project` at SEMANTIC tier).

## Non-goals

- Do not change the v3 manifest schema's existing fields (`sha256`, `tier`). Additive only.
- Do not redesign how `/upgrade-project` reconciles three-way conflicts (its semantic-merge logic stays).
- Do not add network round-trips (no per-upgrade re-fetch of prior tarballs to check anything).
- Do not break audit-baseline's or doctor's reading of `.baseline-manifest.json` — both currently consume it as "what was last installed by the CLI"; whatever shape the fix takes, those consumers must continue to work without modification.
- Do not break the legacy-manifest fallback path. Existing installs (those with `manifest_version: 2` or older) must upgrade cleanly through this fix the first time it lands.

## Success metrics

- **Replay-zero metric**: run `create-baseline upgrade` twice in succession against the same target with no changes between runs — second run produces 0 prompts. Baseline today: N prompts (one per customized file, every run). Measured via `tests/integration/upgrade-idempotency_test.mjs` (to be written).
- **Post-reconciliation metric**: run `/upgrade-project` to reconcile a file, then run `create-baseline upgrade` against the same template version — produces 0 prompts for that file. Baseline today: file re-stages every time.
- **Genuine-change metric**: change one line in a user-customized template file in a new baseline version, run upgrade — file IS surfaced (as MECHANICAL merge or SEMANTIC stage, per tier). Baseline today: also surfaced (this case currently works).
- **Backwards-compatibility metric**: `audit-baseline` and `doctor` continue to PASS on installs that pre-date this fix AND on installs after this fix lands. Baseline today: both pass. After fix: both must still pass with the new on-disk shape.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner; surfaced the bug after upgrading this very project)
- **Reviewer**: Tushar Srivastava
- **Operator**: any user of `npx @friedbotstudio/create-baseline upgrade` (the published npm package); the CLI ships to anyone consuming the baseline as their `.claude/` scaffolding

## Constraints

- **No breaking change to `.baseline-manifest.json` consumers.** `audit-baseline` reads it for hash-drift detection; `doctor` reads it for the install/missing-file report; `merge.js:154-157` writes it at the end of every install/upgrade run. Any new on-disk artifact for the reconciliation marker is preferable to overloading `.baseline-manifest.json` semantics, but the spec phase will adjudicate.
- **`/upgrade-project` SKILL.md is in scope for amendment.** Its current line 114 ("you SHALL NOT touch `.baseline-prior/`, the installed `.baseline-manifest.json`, or any other CLI state") is the structural reason the marker isn't written today. The spec must explicitly relax this — and only this — if the chosen design calls for `/upgrade-project` to be the marker writer. Alternative: the CLI itself writes the marker on the NEXT upgrade run when it observes "stage directory was emptied by the user" — relaxes nothing in the skill contract but requires a state-detection mechanism.
- **Must work on existing installs without manual migration.** When this fix ships to npm, the next `create-baseline upgrade` run by an existing user with no reconciliation-marker file on disk must NOT delete or destroy any of their customizations, even though there's no marker to consult yet. The first post-fix upgrade may produce the same prompts the user is used to; subsequent upgrades should be silent.
- **Test surface is non-trivial.** Tests need to exercise the full upgrade → reconcile → upgrade-again loop, which means a fixture project that can run through `/upgrade-project` end-to-end OR a test that simulates the post-reconciliation file state directly.
- **Cannot ship as separate releases.** The user has explicitly asked this ship as one workflow / one npm version bump (every push triggers semantic-release; three separate fixes = three versions = noisy public history). Spec must therefore cover both failure modes coherently, not split them.

## Acceptance criteria

1. **Given** a project where `.claude/memory/_pending.md` body has accumulated session candidates (hash differs from shipped template), **when** `create-baseline upgrade` runs against a baseline whose `_pending.md` template hasn't changed, **then** no prompt fires for `_pending.md` and the local body is preserved untouched.

2. **Given** a project where `.claude/memory/_resume.md` body has been overwritten by `memory_stop.sh` (hash differs from shipped template), **when** `create-baseline upgrade` runs against a baseline whose `_resume.md` template hasn't changed, **then** no prompt fires for `_resume.md` and the local body is preserved untouched.

3. **Given** a project where `docs/init/seed.md` was reconciled by `/upgrade-project` against template hash X (stage deleted, LOCAL written), **when** a subsequent `create-baseline upgrade` runs against the same baseline version (template hash X), **then** `seed.md` is not re-staged and no prompt fires.

4. **Given** a project where `docs/init/seed.md` was previously reconciled against template hash X, **when** a `create-baseline upgrade` runs against a NEW baseline with template hash Y ≠ X (real upstream change), **then** `seed.md` IS staged for `/upgrade-project` as today.

5. **Given** a project installed before this fix lands (no reconciliation-marker artifact on disk), **when** the user runs `create-baseline upgrade` for the first time after this fix is published, **then** no user customizations are destroyed AND the upgrade completes (possibly with the same prompts the user has been seeing); a SECOND run after that produces zero prompts for files that weren't actually changed upstream.

6. **Given** `audit-baseline` or `doctor` running before and after this fix, **then** both tools continue to PASS on the same target tree with no modification to their consumption of `.baseline-manifest.json`.

7. **Given** the shipped manifest at `obj/template/.claude/manifest.json`, **then** the `tier` field for `.claude/memory/_pending.md` and `.claude/memory/_resume.md` is `NEVER_TOUCH` (not `MECHANICAL`), AND the `NEVER_TOUCH` constant in `src/cli/install.js` includes both files.

## Open questions

- **Q1 (design — for /research and /spec):** Where does the reconciliation marker live on disk? Three candidate shapes: (a) extend `.baseline-manifest.json` with a per-file `reconciled_against_template_sha` field; (b) a separate file `.claude/.baseline-reconciliations.json` mapping `rel → {baseline_version, template_sha}`; (c) sidecar files under `.claude/.baseline-prior/<rel>.reconciled` carrying the matched sha. Tradeoffs around audit-baseline/doctor compatibility, write-cost, and discoverability differ across the three. The spec phase will pick one and justify.

- **Q2 (design — for /spec):** Does `/upgrade-project` write the marker itself (requires amending its constitutional SHALL NOT at SKILL.md:114), or does the CLI write the marker on the *next* upgrade when it observes "stage directory was emptied by user since the last run" (preserves the skill contract but requires a state-detection mechanism)? The amendment-scope tradeoff matters: option A confines the change to one skill file; option B confines it to the CLI but needs to encode the "stage was resolved" signal somewhere.

- **Q3 (scope — for /spec):** For failure mode A (`_pending`, `_resume`), is the fix purely adding them to the `NEVER_TOUCH` list in `install.js` and changing their declared tier in `scripts/build-manifest.mjs` from MECHANICAL to NEVER_TOUCH? Both have to land together to avoid manifest-vs-CLI drift. Are there other runtime-state files that belong on the list (e.g., `.claude/state/*` is already filtered out by some other mechanism — confirm in scout)?

- **Q4 (scope — for /spec):** The legacy-manifest fallback warning ("Your previous install predates version-tracked manifests…") will continue to fire for users upgrading from old installs. Is improving that warning's copy in scope, or strictly out-of-scope? Failure mode B fix may make the warning's stated promise ("re-install with the latest baseline to enable three-way merges next time") more accurate or less accurate depending on the design picked.

- **Q5 (test fixtures — for /scout and /spec):** What test-fixture shape exercises the full upgrade → reconcile → upgrade-again loop? Existing tests in `tests/` exercise individual functions; the end-to-end loop needs a fixture project that simulates a post-`/upgrade-project` state directly (we cannot invoke Claude inside a test). Spec must define the fixture's shape.
