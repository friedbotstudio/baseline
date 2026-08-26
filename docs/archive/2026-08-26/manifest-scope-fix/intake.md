# Scope the installed baseline manifest to shipped files only

## Problem

`writeBaselineManifest()` in `src/cli/install.js:64-71` calls `listFiles(target)` (`install.js:42-52`) to build `.claude/.baseline-manifest.json` after every install. `listFiles` does an unfiltered recursive `readdir` over the entire target directory — it excludes only `.claude/.baseline-manifest.json` itself and `.claude/.baseline-prior/`.

Installing into a project that has its own files at the target root (e.g. a Rust crate with `Cargo.toml`, `Cargo.lock`, `README.md`, `src/main.rs`, `src/types.rs`) records those files into the manifest as if the baseline template had shipped them. It also walks `.git/`, recording `.git/HEAD`, refs, and loose object files the same way.

A user reported exactly this: after running `create-baseline upgrade`, five tracked project files were deleted from the working tree and the repository's `.git/HEAD` was deleted along with the five blob objects backing those files' contents. `git fsck` and `cargo build` both failed until the tree was hand-repaired from `refs/heads/main`, the reflog, and `git fetch origin`.

The deletion path is `threeWayMerge()` in `src/cli/merge.js:161-174`: for every path recorded in the old manifest, if it's absent from the newly-built template manifest (`newManifest`, which is built only from the real shipped template — `bin/cli.js:119`, `obj/template/`) and its on-disk hash is unchanged since the manifest was written, it is treated as "removed upstream" and `unlink()`'d. Because the old manifest wrongly contains the consumer's own files and `.git` internals, `threeWayMerge` prunes them on the next upgrade.

## Goal

An install's manifest records only files the baseline template actually shipped, so an upgrade can never delete a file the baseline doesn't own — including anything under `.git/`.

## Non-goals

- Not fixing the `.git` corruption after the fact (repair tooling, recovery docs) — this intake is about preventing the corruption at the source.
- Not changing the prune semantics for files the baseline legitimately removed from a later template version — that behavior (`merge.js:161-174`) is correct once the manifest is scoped correctly.
- Not auditing or repairing manifests already written to disk by prior buggy installs — that is a separate migration/doctor concern, not this fix.

## Success metrics

- `writeBaselineManifest(target, version)` produces a manifest whose `files` keys are a subset of the shipped template's file set — verified by a test that installs into a target containing a foreign file (e.g. `Cargo.toml`) and a `.git/` directory, then asserts neither appears in `.claude/.baseline-manifest.json`.
- A subsequent `create-baseline upgrade` against that same fixture target does not delete the foreign file or anything under `.git/`.

## Stakeholders

- **Requester**: Tushar Srivastava
- **Reviewer**: Tushar Srivastava
- **Operator** (who runs it in prod): Tushar Srivastava

## Constraints

- Must not change the on-disk manifest schema (`{files: {<rel>: sha256 | {sha256, tier}}, baseline_version}`) — only which paths get recorded.
- Must keep `writeBaselineManifest` callable from both `freshInstall` and `forceInstall` (`install.js:180-212`) without changing their call signatures.
- Must not regress the existing `NEVER_TOUCH` / `SPECIAL_MERGE` file handling — those paths still need to appear in the manifest with correct hashes when present.
- No new third-party dependency; the fix stays within `node:fs` primitives already in use.

## Acceptance criteria

1. Given a target directory containing a foreign file not present in the template (e.g. `Cargo.toml`) and a `.git/` directory, when `freshInstall` or `forceInstall` runs, then `.claude/.baseline-manifest.json` contains no entry for the foreign file and no entry for any path under `.git/`.
2. Given the manifest produced by (1), when `create-baseline upgrade` runs against that same target with no template changes, then the foreign file and everything under `.git/` are left on disk untouched.
3. Given a target where every shipped template file was installed correctly, when `freshInstall` or `forceInstall` runs, then the manifest still contains an entry for every shipped file with the correct sha256 (parity with current behavior for `NEVER_TOUCH` and `SPECIAL_MERGE` paths).

## Open questions

- None — root cause traced directly to `install.js:64-71` / `merge.js:161-174`; no ambiguity remains.
