# Replace the tier-1 customization prompt's "Show diff" with "Merge"

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

When `npx @friedbotstudio/create-baseline upgrade <target>` finds a customized baseline file whose BASE cannot be recovered (legacy manifest, or no `.claude/.baseline-prior/` cache, or npm tarball unavailable), it routes the file to **tier 1** and presents an interactive `@clack/prompts` `select` with four options: Keep your version / Use new baseline / **Show diff** / Abort. Concrete scenario the user just hit on `v0.7.0`:

```
docs/init/seed.md has been customized — choose:
  ● Keep your version (preserve target file as-is)
  ○ Use new baseline
  ○ Show diff
  ○ Abort
```

"Show diff" loops the prompt (cap-at-2 consecutive picks) but offers no third way out. The user has read the diff and concluded the upstream change is real and useful, but applying "Use new baseline" would silently overwrite their local edits — and they have no in-flight surface to reason about the merge later, in Claude Code, where they have the full project context. They are forced to pick Keep, then manually copy-paste from the rendered diff after the CLI exits.

This is exactly the problem tier 3 (SEMANTIC) already solves for files whose BASE is recoverable: stage INCOMING under `.claude/state/upgrade/<ts>/`, exit with code 5, and let `/upgrade-project` reconcile in Claude Code with full reasoning. Tier 1 has the same need but no path to that staging mechanism because BASE is unavailable.

"Show diff" is also a weak primitive: it shows information without enabling action. Removing it costs the user nothing (rendering a diff is something `git diff` already does well) and frees a slot for a real Merge option that completes the workflow.

## Goal

The tier-1 prompt offers a **Merge** option that defers the decision to Claude Code: the CLI stages the INCOMING bytes (BASE-less) under `.claude/state/upgrade/<ts>/`, exits with the existing semantic-merge exit code, and the next Claude Code session surfaces a one-line nag pointing the user to `/upgrade-project` to reconcile.

## Non-goals

- **Not introducing an in-tree `.upgrade` sidecar.** The user explicitly chose to reuse the hidden `.claude/state/upgrade/<ts>/` staging mechanism over an in-tree `<rel>.upgrade` file. State lives under `.claude/state/`; the project tree stays clean.
- **Not adding a `project.json` field to track pending merges.** The SessionStart nag scans the filesystem (`.claude/state/upgrade/*/manifest.json` for `status: PENDING`) — filesystem is truth. No new schema field, no drift between flag and reality.
- **Not extending the tier-1 prompt to more than 4 options.** Merge replaces Show diff; the option count stays at 4 (Keep your version / Use new baseline / Merge / Abort).
- **Not changing tier-2 (MECHANICAL) or tier-3 (SEMANTIC) behavior.** Tier-2 still auto-merges via `git merge-file --diff3`; tier-3 still stages with full BASE. Only tier-1's user-facing surface and downstream `/upgrade-project` schema change.
- **Not making `/upgrade-project` re-fetch BASE for tier-1 entries.** BASE is unrecoverable by construction; two-way reconciliation (LOCAL vs INCOMING) is the contract.

## Success metrics

- **Tier-1 customized files that previously forced a Keep-or-overwrite choice now have a deferred-merge path.** Baseline: 0% of tier-1 conflicts can be reconciled with full LLM context. Target: 100% via Merge → `/upgrade-project`. Measured by: `tests/upgrade.test.mjs` Merge-pick assertion + `tests/upgrade-project.test.mjs` BASE-less reconciliation assertion.
- **No regression on tier-2/tier-3 paths.** Existing `tests/upgrade-tiers.test.mjs` + `tests/upgrade-project.test.mjs` continue to pass without modification beyond the new test cases.
- **SessionStart nag fires only when pending stages exist.** Sessions on a clean tree see no nag; sessions with `.claude/state/upgrade/*/manifest.json` containing `status: PENDING` entries see exactly one nag line.

## Stakeholders

- **Requester**: Tushar Srivastava (project owner; ran v0.7.0 upgrade and hit the gap).
- **Reviewer**: Tushar Srivastava (solo maintainer of `@friedbotstudio/create-baseline`).
- **Operator**: every user of `npx @friedbotstudio/create-baseline upgrade` who has customized a baseline-owned file.

## Constraints

- **No in-tree sidecar.** Staging is under `.claude/state/upgrade/<ts>/` only (per user choice via AskUserQuestion).
- **Filesystem-scan nag, not a project.json field.** SessionStart hook detects pending stages by reading `.claude/state/upgrade/*/manifest.json` directly.
- **BASE-less stage entries must be representable in the existing stage-manifest schema.** Either by extending the schema (new sentinel for `base_sha256`) or by carrying a discriminator field. The choice is a `/spec` decision.
- **`/upgrade-project` must handle BASE-less entries without crashing on existing three-way reconciliation logic.** The skill's current procedure assumes BASE exists on disk as `<rel>.baseline-base`; BASE-less entries either omit this artifact or carry a sentinel.
- **`/triage` non-git carve-out persists.** This change is fully inside git-conditional territory — non-git projects skip the upgrade flow anyway.
- **Article XI (skill provenance) untouched.** The change touches `/upgrade-project` SKILL.md but the skill remains `owner: baseline`; manifest regeneration via `scripts/build-manifest.mjs` covers the hash update.
- **Existing tier-1 cap-at-2 logic is removed alongside Show diff.** With Merge as the third option, there's no loop to cap.
- **`bin/cli.js` help text** mentions "Show diff" on line 36 and "exit 3 on any skipped" on the same line — both need an update.

## Acceptance criteria

1. **Given** a tier-1 conflict (customized file with unrecoverable BASE) during `npx @friedbotstudio/create-baseline upgrade` in TTY mode, **when** the user is presented with the customization prompt, **then** the four options shown are exactly **"Keep your version"** / **"Use new baseline"** / **"Merge"** / **"Abort"** in that order. "Show diff" is absent.
2. **Given** the user picks "Merge" on a tier-1 conflict, **when** the CLI completes, **then** a new stage entry exists under `.claude/state/upgrade/<ts>/` for that file (the manifest entry's `status` is `PENDING`, `local_sha256` is set, `incoming_sha256` is set), the file `<rel>.baseline-incoming` is present under the same stage dir, the LOCAL file in the target tree is **untouched**, the CLI's final summary line reports the merge as `1 file(s) need semantic merge. Open Claude Code and run /upgrade-project to reconcile.` (consistent with the existing tier-3 exit message), and the CLI exits with code 5 (the existing `ERR_SEMANTIC_STAGED`).
3. **Given** a stage entry written by a tier-1 Merge pick (BASE-less), **when** the user runs `/upgrade-project` in Claude Code, **then** the skill detects the BASE-less entry via its schema discriminator, performs a **two-way** LOCAL-vs-INCOMING reconciliation (using LLM judgment on the diff between LOCAL and INCOMING rather than three-way merge), writes the reconciled bytes to LOCAL, and marks the stage manifest entry `RECONCILED`. The three-way reconciliation path still runs for tier-3 entries that carry a recoverable BASE.
4. **Given** any pending stage exists under `.claude/state/upgrade/*/manifest.json` (any tier — tier-1 Merge or tier-3 SEMANTIC), **when** a new Claude Code session starts, **then** the SessionStart hook surfaces a one-line reminder naming the pending stage count and pointing to `/upgrade-project`. Sessions with no pending stages see no nag for this reason.
5. **Given** the user runs Merge on the same file in a **subsequent** `create-baseline upgrade` invocation while a prior Merge stage entry for that file still exists with `status: PENDING`, **when** the CLI processes the new conflict, **then** the new INCOMING bytes overwrite the prior stage entry's `<rel>.baseline-incoming` artifact and the manifest entry's `incoming_sha256` updates; no second entry is appended (idempotent by `rel`).
6. **Given** the user picks "Merge" in a non-TTY (`--force`-style) flow, **when** the CLI runs, **then** the Merge option is unavailable (non-TTY paths do not present an interactive prompt) and the existing non-TTY conflict policy (exit 3 on any skipped customization) applies unchanged. Non-TTY Merge is out of scope.
7. **Given** the CLI's `--help` output and the inline header comment in `src/cli/tui/upgrade.js`, **when** read, **then** all "Show diff" references are removed and the new "Merge" option is documented in the four-line prompt-options enumeration. The CHANGELOG `[Unreleased]` section records both the user-facing rename and the new staging behavior under `### Changed` and `### Added`.

## Open questions

- **Stage-manifest schema for BASE-less entries.** Two candidate shapes: (a) `base_sha256: null` + discriminator field `base_recoverable: false`, or (b) omit `base_sha256` entirely and let absence signal BASE-less. `/research` will compare. The chosen shape must be backward-compatible with stage manifests written by v0.7.0 CLIs (those carry a `base_sha256` string for every entry).
- **Where the BASE-less branch lives in `/upgrade-project`'s procedure.** The skill's existing procedure (Step 2 in SKILL.md) reads BASE, INCOMING, and LOCAL. For BASE-less entries, BASE read is skipped and the reasoning prompt changes from "three-way delta" to "two-way diff: which changes should land". Open: does this branch sit inside the same per-file loop with an `if base_recoverable` switch, or as a parallel BASE-less procedure?
- **SessionStart hook location.** Extend `memory_session_start.sh` with a new pending-stage scan block (one more responsibility for a hook already handling several signals), or ship a new sibling hook (e.g., `upgrade_stage_nag.sh`) registered alongside it? `/spec` will pick based on the additionalContext budget already in use.
- **Should the "Use new baseline" option for tier-1 also produce a stage entry, or continue to silently overwrite as today?** Today's behavior overwrites with no record. Arguably "Use new baseline" + write a `RECONCILED` stage entry for audit would parallel the new Merge contract. Out of scope unless `/research` surfaces a strong reason to extend.
- **Should the `cap-at-2` consecutive-pick logic be deleted now (since Merge replaces Show diff and there's no looping option), or kept as defensive dead code?** Recommendation: delete in the same patch; the constitution says no dead code (Art. VI.2).
