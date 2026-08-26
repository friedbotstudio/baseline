# Security reports — manifest-scope-fix

## manifest-scope-fix-2026-08-26.md

# Security Review — main — 2026-08-26

## Summary

Overall risk: **LOW**. The change narrows what the installer records in `.claude/.baseline-manifest.json` from "everything under the install target" to "the files the shipped template actually contains, restricted to those present in the target". The net effect is a reduction in attack surface: consumer-owned paths and the entire `.git/` tree can no longer enter a baseline-owned manifest, so a later `create-baseline upgrade` can no longer be induced to prune or overwrite them. No new dependency, no new network call, no new external input.

## Findings

No CRITICAL, HIGH, or MEDIUM findings.

### [LOW] A symlink planted at a shipped path is followed when the manifest is hashed

- **OWASP**: A08 - Software and Data Integrity Failures | **CWE**: CWE-59 (Link Following)
- **File**: `src/cli/install.js:69-79`, hashing at `src/cli/manifest.js:27-33`
- **Evidence**:
  ```js
  for (const rel of shipped) {
    if (COPY_EXCLUDE.includes(rel)) continue;
    if (await pathExists(join(target, rel))) installed.push(rel);
  }
  const m = await buildManifestFromDir(target, installed, { baseline_version });
  ```
  `pathExists` and `hashFile` both resolve `join(target, rel)` without an `lstat` check, so a symlink at a shipped path resolves to its destination.
- **Impact**: A target tree prepared in advance could make the installer read and hash a file outside the target directory, and record that content's digest under a baseline-owned path. There is no write outside the target and no content disclosure — the manifest stores a sha256, not the bytes. Exploiting it requires already controlling the directory the operator chose to install into.
- **Recommendation**: None required for this change. If the installer is later hardened against a hostile target tree, `lstat` each candidate path and refuse a symlink rather than following it. This behavior predates the change and is unchanged by it; the change reduces the number of paths reached, since only shipped names are now stat'ed.

## What was checked

- Every added and removed line of `src/cli/install.js` and `tests/install.test.mjs` (23 and 111 lines respectively).
- Trust boundary: the CLI entrypoint. The only externally controlled input reaching the changed code is the operator-supplied `target` directory and its contents. `rel` values come from walking the shipped `templateDir`, never from consumer data, so no attacker-controlled string is concatenated into a path.
- Injection (A03): no shell invocation, no query construction, no dynamic `require`/`import` in the changed code.
- Access control (A01) and authentication (A07): not applicable — no authorization decision in this path.
- Cryptography (A02): sha256 via `node:crypto` in the pre-existing `hashFile`; unchanged by this diff.
- Secrets hygiene: no literals added. The new `.git` skip in `listFiles` actively prevents the installer from hashing repository objects, which could otherwise have carried credential material into a manifest.
- Logging (A09): no logging added or removed.
- SSRF (A10): no network call in the changed code.

## Dependencies

No packages added, removed, or version-changed by this diff. `npm audit` was not run and no new tool was installed, per the read-only constraint.

## Out of scope / Noted

- `.gitignore` and `.npmrc`, materialized into the target but absent from `templateDir`, no longer appear in the installed manifest. That is the intended correction rather than a regression: `bin/cli.js`'s `listShippedFiles(templateDir)` already excluded them from the upgrade-side manifest, so under the previous code the upgrade compared a target-derived old manifest against a template-derived new one and treated the difference as prunable.
- The `.git` skip in `listFiles` is a directory-name comparison. A directory named something else that contains a git repository is not skipped. This matters only for a hypothetical non-standard layout and is not reachable through the shipped template.

