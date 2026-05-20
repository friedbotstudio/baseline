# Three-tier upgrade-flow rework with /upgrade-project skill

<!--
Intake document. Produced by the `intake` skill.
Required sections (enforced by artifact_template_guard): Problem, Goal, Acceptance criteria.
-->

## Problem

The current `npx @friedbotstudio/create-baseline upgrade` flow (v0.5.0) detects customized files via sha256 mismatch against `.baseline-manifest.json` and then offers the user a binary choice. Three concrete defects:

**Defect 1 — wrong verbiage.** The prompts read "Keep mine" / "Keep theirs". This is git-rebase terminology where "ours" and "theirs" flip meaning depending on whether you're rebasing or merging. For an installer the user-correct framing is "Keep your version" vs "Use new baseline". There is also no option to preview the diff before deciding, so users either choose blind or have to abort, diff manually, and re-run.

**Defect 2 — no three-way merge.** Whenever a file's sha256 has drifted from the manifest the flow forces a binary keep/replace choice, even when the local edits and upstream changes are textually orthogonal. A user who added one helper function to a hook script is forced to either lose their function (pick "Use new baseline") or miss every upstream improvement to that hook (pick "Keep your version"). For mechanically-mergeable files (hook scripts, skill `template.md` bodies, CLI helpers under `bin/`, `src/`, `scripts/`) `git merge-file --diff3 LOCAL BASE REMOTE` would silently auto-merge the strictly-additive case and only surface real conflicts. The blocker today is BASE content — `.baseline-manifest.json` records sha256s but not the content of the previously-installed version. Recovering BASE requires either local caching or re-fetching `@friedbotstudio/create-baseline@<prior-version>` from npm at upgrade time.

**Defect 3 — no semantic-merge path for structurally-conflicting files.** For `seed.md`, `CLAUDE.md`, `project.json`, and the memory staging files (`_pending.md`, `_resume.md`), three-way merge with `diff3` is insufficient because the conflicts are structural rather than textual. Concrete reproducer (the scenario that motivated this intake): baseline v0.4.0 ships `seed.md` ending at Article X. User runs `/init-project`, which extends `seed.md` with their own project-specific Article XI. Baseline v0.5.0 ships `seed.md` with a new Article XI ("Skill provenance and the baseline manifest" — the article that shipped in `e2927c7`). Both sides inserted "Article XI" at the same anchor; `diff3` emits a conflict block, and the user must hand-resolve renumbering, cross-references, and the table of contents. An LLM in main context can reconcile this trivially: recognize the user's Article XI as project-specific, renumber it to Article XII (or fold it into the Article X amendments slot), fix every `Article XI` cross-reference, and reconcile the TOC. No deterministic tool can.

## Goal

Replace the binary keep/replace prompt with a three-tier flow that preserves user customization by default: deterministic 3-way merge where it works, LLM-assisted reconciliation via a new `/upgrade-project` Claude Code skill where it doesn't, and corrected verbiage with diff preview throughout.

## Non-goals

- Binary file merge. No baseline file is binary today; this lands text-only.
- Three-way merge of files that the new baseline deleted. Deletion handling is a separate concern and stays as-is (user gets the existing prompt to confirm delete).
- Retroactive migration of projects already upgraded to v0.5.0 or earlier. This rework is forward-looking; existing installations carry the same `.baseline-manifest.json` shape and the new flow uses what's present.
- Replacing `git merge-file` with a hand-rolled merge engine. We use the tool git already ships.
- Caching every prior baseline version locally. BASE content is fetched on demand (decision deferred to research / spec).
- Changing the trigger for "is this file customized" — sha256 vs `.baseline-manifest.json` stays. The change is in what happens *after* customization is detected.
- Building a TUI / interactive editor for semantic merges. `/upgrade-project` writes the reconciled file and reports; the user can `git diff` to verify.

## Success metrics

- **Verbiage churn**: 0 occurrences of `Keep mine` / `Keep theirs` in CLI output after this lands; new strings present in CLI tests. Measured via greppable test assertions on the CLI TTY output.
- **Silent auto-merge rate on mechanically-mergeable files**: on a synthetic corpus of local-edit + upstream-edit pairs where the edits are textually non-overlapping, the new flow lands the merge with zero prompts in ≥ 95% of cases (the residual is true textual overlap producing conflict markers). Measured via a CLI integration test that seeds `<file>.baseline-base`, mutates the local copy with one set of changes, mutates the incoming with a non-overlapping set, runs `upgrade`, and asserts the merged content + no-prompt behavior.
- **Semantic-merge reconciliation on the Article-XI reproducer**: `/upgrade-project` invoked against the canonical Article-XI staging scenario produces a single committed `seed.md` whose Article XI is the baseline's new content, whose Article XII is the user's prior Article XI content (or folded per user direction), and whose cross-references all resolve. Measured via a scenario test that seeds the three files and asserts the post-run file structure.
- **Idempotency**: running `upgrade` twice in a row when a semantic-merge stage is pending produces the same staging artifacts and the same terminal output the second time, with no duplicate writes and no errors. Measured via a CLI integration test that runs `upgrade` twice and diffs both runs.

## Stakeholders

- **Requester**: Tushar Srivastava (razieldecarte@gmail.com) — baseline owner.
- **Reviewer**: Tushar Srivastava — solo-maintained project; review happens in the workflow itself.
- **Operator** (who runs it in prod): every downstream user of `@friedbotstudio/create-baseline` who runs `upgrade` after v0.5.0.

## Constraints

- **Article XI binding.** Skill provenance (Article XI of `CLAUDE.md` + §17 of `docs/init/seed.md`) is the source of truth for baseline-owned vs user files. Semantic-merge logic SHALL respect `owner: baseline` and never touch user-added files.
- **Article II binding.** `/upgrade-project` is a skill, not a subagent, because reconciliation requires conversational judgment. It runs in main context.
- **No silent BASE corruption.** If BASE content cannot be recovered for a customized file (npm unreachable, prior version yanked, network failure), the flow SHALL refuse to attempt a merge that uses LOCAL as BASE — it SHALL surface the missing-BASE condition as a hard error with a clear remediation path. No destructive fallback.
- **No `.claude/` ballooning.** Local BASE caching is bounded: at most the immediately-prior version's content, never the full version history. Re-fetching from npm at upgrade time is preferred; local cache is a fallback when npm is unreachable and the prior version is still on disk from the last install.
- **Idempotency.** Running `upgrade` twice in a row when a semantic-merge stage is pending SHALL not re-stage, re-prompt, or break. The second run detects the pending stage and re-prints the "run `/upgrade-project`" pointer.
- **All three tiers ship together** in one PR per user direction. Tier 1 (verbiage + diff preview) is the simplest and could land independently, but the user asked for a coherent rework not three drips.
- **Backward-compatibility surface.** The on-disk `.baseline-manifest.json` shape SHALL NOT change in a way that breaks existing installations. If new fields are added (e.g., `baseline_version`), they SHALL be optional and absence SHALL trigger a graceful degradation path.
- **Hook ecosystem.** Several baseline files are referenced by hooks (e.g., `harness_continuation` watches `.claude/state/`). Staging-file conventions SHALL NOT collide with any hook's watch paths or guard regexes.

## Acceptance criteria

1. Given a customized file (sha256 mismatch between `.baseline-manifest.json` and disk) during `npx @friedbotstudio/create-baseline upgrade`, when the CLI prompts the user, then the options are exactly **"Keep your version"**, **"Use new baseline"**, and **"Show diff"**, and "Show diff" displays a colorized unified diff (LOCAL vs incoming) before re-prompting with the same three options.

2. Given a file in the **"mechanically mergeable"** allowlist that has both local edits and upstream changes whose textual hunks do not overlap, when `upgrade` runs, then `git merge-file --diff3 LOCAL BASE REMOTE` is invoked, the merged content is written to the local path, and no user prompt fires for that file.

3. Given a file in the **"mechanically mergeable"** allowlist with overlapping local + upstream edits, when `upgrade` runs, then the file on disk is written with standard `<<<<<<<` / `=======` / `>>>>>>>` conflict markers and the CLI prints `Merged with conflicts — resolve in <path>` for that file. The CLI exits with a non-zero status code if any file in the run produced conflict markers, so CI / automation can detect unresolved state.

4. Given a file in the **"semantic merge required"** allowlist with both local and upstream changes, when `upgrade` runs, then (a) the local file is left untouched, (b) two staging artifacts are written next to it at `<path>.baseline-incoming` and `<path>.baseline-base`, (c) the CLI's terminal output names the file and prints `Open Claude Code and run /upgrade-project to reconcile`, and (d) a stage-state record is written to `.claude/state/upgrade/<timestamp>.json` listing every staged file with its baseline version + sha256s.

5. Given staging artifacts present on disk (from AC 4), when the user invokes `/upgrade-project` in Claude Code, then the skill reads BASE / LOCAL / REMOTE for each staged file, produces a reconciled version per the user's intent, writes the reconciled content to the local path, deletes both staging artifacts, updates the stage-state record, and reports per-file status (reconciled / needs user input / left untouched).

6. Given the **Article-XI reproducer scenario** (v0.4.0 → v0.5.0 `seed.md` upgrade where user previously added their own project-specific Article XI via `/init-project`), when `/upgrade-project` runs against the staged files, then the resulting `seed.md` contains (a) the baseline's new Article XI ("Skill provenance and the baseline manifest") at position XI, (b) the user's prior Article XI content moved to Article XII (or folded into an Article X amendments section per the user's stated preference), (c) every `Article XI` cross-reference in the document updated to point to the correct article number, and (d) no `diff3` conflict markers anywhere in the file.

7. Given a successful `upgrade` run that wrote semantic-merge staging artifacts (AC 4), when the user re-invokes `upgrade` before running `/upgrade-project`, then the CLI detects the pending stage (via `.claude/state/upgrade/<timestamp>.json`), does not re-stage any file, does not re-prompt for any tier-1 or tier-2 file already resolved, and re-prints the "run `/upgrade-project`" pointer with the same list of pending files.

8. Given a customized file in any tier when the BASE content cannot be recovered (npm unreachable, prior baseline version yanked from registry, no local cache, or the recorded prior version is absent from `.baseline-manifest.json`), when `upgrade` runs, then the CLI prints a clear error naming (a) the file, (b) the recorded prior baseline version, (c) the recovery attempted, and (d) the remediation path (e.g., "re-install the prior version manually, or pass `--no-base` to force the old tier-1 binary prompt"). The CLI does NOT attempt to merge using LOCAL as BASE and does NOT silently downgrade to the binary prompt without user opt-in.

9. Given a user-added file (no `owner: baseline` declaration in the manifest's `owners.skills` map, or located outside any baseline-tracked path), when `upgrade` runs, then the file is not read, not staged, not prompted on, and not modified — regardless of any path collision with a baseline-owned file's staging artifacts.

10. Given a project that was last installed with baseline v0.4.0 (no `baseline_version` field in its `.baseline-manifest.json`, because that field is introduced by this rework), when `upgrade` runs to v0.5.x+, then the CLI infers the prior version from the manifest's sha256s by querying npm for matching published versions (or falls back to the tier-1 binary prompt with a one-time notice explaining why BASE recovery was not possible). No destructive write happens without user consent.

## Open questions

- **Q1 (scout):** What is the exact current shape of `.baseline-manifest.json` on disk, and where in `bin/cli.js` (or `src/cli/`) does the customization-detection branch live? Names, line ranges, helper functions involved.
- **Q2 (research):** BASE-content recovery strategy: (a) re-fetch `@friedbotstudio/create-baseline@<prior-version>` from npm at upgrade time, (b) cache the immediately-prior version's content locally in `.claude/.baseline-prior/`, (c) hybrid (cache the immediately-prior; fall back to npm fetch for older). Tradeoffs across disk usage, offline correctness, npm-yank resilience, and complexity.
- **Q3 (research / spec):** Staging-file convention: (a) sibling files with `.baseline-incoming` / `.baseline-base` suffixes alongside the local file, (b) a `.claude/upgrade-staging/<timestamp>/` subdirectory mirroring the project tree, (c) all three states co-located inside `.claude/state/upgrade/<timestamp>/files/`. Tradeoffs across discoverability, git-status noise, hook-watch-path collisions, and cleanup safety.
- **Q4 (spec):** Which exact files belong in the "mechanically mergeable" vs "semantic merge required" vs "tier-1 binary prompt" allowlists? Initial proposal: mechanically-mergeable = hook scripts under `.claude/hooks/`, skill `template.md` bodies, CLI helpers under `bin/` and `src/`; semantic = `seed.md`, `CLAUDE.md`, `project.json`, `_pending.md`, `_resume.md`; tier-1 binary = everything else baseline-owned (images, JSON config that's atomic, etc.). The spec finalizes the list and the manifest carries the per-file tier classification.
- **Q5 (spec):** When `/upgrade-project` cannot reconcile a file even with LLM judgment (genuine ambiguity in user intent), what is the fallback? Options: (a) write the file with `<<<<<<<` / `=======` / `>>>>>>>` markers like `diff3` and surface as "needs human input", (b) leave the staging artifacts in place and ask the user a targeted question in conversation, (c) write a reconciliation candidate and ask the user to confirm before deleting staging artifacts. Likely (b) plus optional (c).
- **Q6 (spec):** Should `/upgrade-project` have a `--dry-run` mode that produces the reconciled file content + a unified diff without writing? Useful for trust in early use. Default `false`; opt-in via skill arg.
- **Q7 (spec):** How does the CLI decide that a previously-installed baseline version is the same minor/patch as the new install (no upgrade needed for that file)? Today's hash-equality short-circuit is correct; verify that the new tier dispatch doesn't break this fast-path.
- **Q8 (security):** Re-fetching `@friedbotstudio/create-baseline@<prior-version>` from npm at upgrade time introduces a runtime dependency on the registry and a small supply-chain surface (npm could theoretically serve a different artifact than was originally installed). Decision: pin the prior fetch by the manifest's recorded sha256 sum of `manifest.files`, refuse the merge if the re-fetched content doesn't hash-match, and surface as the same hard error as AC 8.
