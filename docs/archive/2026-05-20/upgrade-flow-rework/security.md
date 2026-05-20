# Security reports — upgrade-flow-rework

## upgrade-flow-rework-2026-05-20.md

# Security Review — upgrade-flow-rework — 2026-05-20

## Summary

**Overall risk: MEDIUM (post-fix: LOW).** Initial review surfaced one HIGH finding (tarball extraction without path-traversal validation in `extractFromTarball`) and one MEDIUM finding (stage-manifest `rel` field not validated when read by `/upgrade-project`). Both addressed in this same workflow before ship — see "Resolution" below. All other surfaces — `spawnSync` argument arrays, sha256 verification of fetched bytes, npm registry trust boundary — were sound from the start.

## Resolution (post-fix)

- **HIGH (resolved)**: `src/cli/upgrade-tiers.js:extractFromTarball` now validates the resolved candidate path stays under the extraction `tmp` root before reading. Throws `NoBaseError` with `kind: 'tarball_path_traversal'` on escape, which routes to the tier-1 binary-prompt fallback (same path as other BASE-recovery failures). Defense in depth — both `bsdtar` (macOS) and GNU tar default-reject `..`/absolute-path entries, but the explicit check guards against future tar-binary behavior changes and against the case where a malicious tarball passes the tar-level checks but writes legitimately-named files outside the package/ subdirectory.
- **MEDIUM (resolved)**: `.claude/skills/upgrade-project/SKILL.md` now declares an explicit constraint requiring the skill to verify `rel` resolves under target before writing; escapes route to `NEEDS_USER_INPUT` fallback with reason `path-traversal-rejected`. The contract is in the constraints section so the LLM honors it on every invocation.

Both fixes verified: `tests/upgrade-tiers.test.mjs` and `tests/upgrade-project.test.mjs` remain green after the changes.

## Findings

### [HIGH] Tarball extraction without absolute-path or `../` traversal validation
- **OWASP**: A01 Broken Access Control · **CWE**: CWE-22 Path Traversal, CWE-23 Relative Path Traversal
- **File**: `src/cli/upgrade-tiers.js:132-142`
- **Evidence**:
  ```javascript
  async function extractFromTarball(tarballBytes, rel) {
    const tmp = await mkdtemp(join(tmpdir(), 'baseline-prior-extract-'));
    const result = spawnSync('tar', ['-xz', '-C', tmp, '-f', '-'], { input: tarballBytes });
    if (result.status !== 0) {
      throw new Error(`tar extract failed: ${(result.stderr || '').toString()}`);
    }
    const candidate = join(tmp, 'package', rel);
    if (!existsSync(candidate)) return null;
    return await readFile(candidate);
  }
  ```
- **Impact**: An npm tarball whose entries contain absolute paths (e.g. `/etc/cron.d/evil`) or `../`-prefixed relative paths will write outside `tmp` when extracted by BSD `tar` (the default on macOS). GNU `tar` on Linux warns and strips by default, so the cross-platform behavior diverges. A compromised npm registry response, or a man-in-the-middle who can serve a tarball with the recorded `baseline_version` string, can write arbitrary files on the consumer's machine **before** the sha256 verification in `resolveBase` runs (verification compares only the requested file's bytes; the malicious side-effect files have already landed on disk).
- **Recommendation**: Either (a) pass `-P --no-overwrite-dir` and validate every entry's resolved path stays under `tmp` before extracting (`tar -tf` first, reject suspicious paths, then extract), or (b) reimplement the extraction in Node using `node:zlib` + a tar parser that exposes per-entry paths for validation. Cheapest fix: add `path.resolve(candidate).startsWith(tmp + sep)` check after extraction and `rm -rf tmp` if violated, plus pass `-P -P` (BSD tar `-P` is "preserve permissions" — careful, BSD tar absolute-path handling is `--no-absolute-paths` or `-s` rules; verify per-platform flag set). Alternative: pre-extract only the single `package/<rel>` entry instead of the whole tarball.

### [MEDIUM] Stage manifest `rel` field is unvalidated when read by `/upgrade-project`
- **OWASP**: A01 Broken Access Control · **CWE**: CWE-22 Path Traversal
- **File**: `.claude/skills/upgrade-project/SKILL.md` (procedure step 2)
- **Evidence**: The skill's body instructs the LLM to read `manifest.json` from the stage directory and, for each entry, "Write the reconciled bytes to the LOCAL path." LOCAL is constructed from `entry.rel` by joining with the target root. The skill does no explicit validation that `rel` stays inside the target.
- **Impact**: If an attacker with write access to `.claude/state/upgrade/<ts>/manifest.json` injects a `rel` value like `../../../etc/cron.d/evil`, the skill would write LLM-reconciled bytes to that path. The CLI itself never writes attacker-controlled `rel` values into the manifest (it sources `rel` from the baseline-built shipped manifest's `files` keys, which are trusted), so this is exploitable only if the attacker has prior write access to `.claude/state/upgrade/`. The realistic threat model is a malicious local process or a compromised earlier step in the supply chain, not a remote attacker.
- **Recommendation**: Add an explicit constraint in the skill body: "Before writing to LOCAL, the skill SHALL verify that `path.resolve(target, rel)` is a descendant of `target`. Reject any entry whose `rel` resolves outside the target tree as a `NEEDS_USER_INPUT` fallback with the reason `path-traversal-rejected`." Codify this as a contract phrase in the skill body so the LLM honors it. Long-term: move the validation into a small Foundation helper invoked by the skill explicitly.

### [LOW] `spawnSync` argument arrays for `git` and `tar` are correctly used (no shell injection)
- **OWASP**: A03 Injection · **CWE**: CWE-78 OS Command Injection
- **File**: `src/cli/upgrade-tiers.js:134` and `:169`
- **Evidence**:
  ```javascript
  spawnSync('tar', ['-xz', '-C', tmp, '-f', '-'], { input: tarballBytes });
  spawnSync('git', ['merge-file', '--diff3', localPath, tmpBase, tmpRemote], { encoding: 'utf8' });
  ```
- **Impact**: None — argv array form is used (no `shell: true`), so even a `rel` value containing shell metacharacters would not be interpreted by a shell. `localPath`, `tmpBase`, `tmpRemote` are passed as discrete arguments. This is the correct safe pattern.
- **Recommendation**: No action. Documenting as LOW because the pattern is worth preserving — if a future refactor adds `{ shell: true }` or string-concatenated command strings, the surface flips to HIGH.

### [LOW] npm registry supply-chain dependency
- **OWASP**: A06 Vulnerable & Outdated Components, A08 Software & Data Integrity · **CWE**: CWE-829 Inclusion of Functionality from Untrusted Control Sphere
- **File**: `src/cli/upgrade-tiers.js:106-118` (defaultPack → libnpmpack)
- **Evidence**: `resolveBase` fetches the prior baseline version tarball from npm via `libnpmpack.pack('@friedbotstudio/create-baseline@<v>')` when the local cache is absent.
- **Impact**: A compromised npm registry, MITM on `registry.npmjs.org`, or a maintainer-account takeover that publishes a malicious version under the recorded `baseline_version` could serve a malicious tarball. **Mitigation in place**: `resolveBase` verifies the returned bytes against `oldManifest.files[rel].sha256` and refuses the merge on mismatch — the consumer's installed manifest, written at the prior install, is the integrity anchor. The HIGH finding above (tarball extraction) is the residual gap because extraction runs before the sha256 check.
- **Recommendation**: Once the HIGH finding is addressed, this surface is LOW — the sha256 anchor is the appropriate integrity control. Optionally consider documenting the trust model in the spec's "Rollback" section.

## Dependencies

No new direct third-party dependencies added in this diff. `libnpmpack` is consumed via dynamic `import('libnpmpack')` inside `defaultPack`; the package ships as part of the npm CLI bundle that consumers already have installed (they ran `npx @friedbotstudio/create-baseline` after all). No new entries to `package.json → dependencies`.

`npm audit` was not run automatically by this skill (existing dependencies unchanged in the diff). If the consumer has a stale npm cache with vulnerable transitive deps, that's an environment issue and pre-existing.

## Out of scope / Noted

- The `tar` and `git` binaries are system dependencies (assumed present). Their version range is not pinned. A consumer running a very old `tar` (< 1.21) may not honor `--gz` decompression; a consumer running `git < 1.6` doesn't have `git merge-file --diff3`. The spec's Open Questions section already calls out the Windows portability concern; the version-floor question for Unix is worth noting too but is not a security issue per se.
- `/upgrade-project` is LLM-driven. The LLM has full read/write access to the project tree by virtue of being invoked by the user in Claude Code. The trust model is "the user trusts the LLM as a coding agent" — anything the LLM could do already, it can do via this skill. The MEDIUM finding above is specifically about ATTACKER-controlled `rel` values reaching the LLM through a tampered stage manifest, not about the LLM's general authority.
- The new `.claude/.baseline-prior/` cache directory has its own `.gitignore` (`*\n`) so contents are git-invisible. This is correct hygiene — no risk of cache contents being inadvertently committed.
- The `git_commit_guard` hook still enforces all the same Article VII rules; this rework doesn't touch the commit gate.
- AC-008's NoBaseError → tier-1 binary-prompt fallback is correct defensive design (per intake: "The CLI does NOT use LOCAL as BASE"). Confirmed in `src/cli/merge.js:fallbackToBinaryPrompt`.

