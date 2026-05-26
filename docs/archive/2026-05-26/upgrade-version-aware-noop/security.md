# Security reports — upgrade-version-aware-noop

## upgrade-version-aware-noop-2026-05-27.md

# Security Review — upgrade-version-aware-noop — 2026-05-27

## Summary

Overall risk: **LOW**. The branch introduces one new Foundation module (`src/cli/project-json.js` — 55 lines) and adds narrowly-scoped behavior to five existing modules (`mcp.js`, `merge.js`, `tui/upgrade.js`, `install.js`, `bin/cli.js`). The new module reuses an established atomic write-then-rename pattern from `src/cli/reconciliation-marker.js`. No new third-party dependencies. No new trust boundaries. No new authentication, authorization, or cryptographic surface. The changes operate exclusively on operator-controlled paths under `<target>/.claude/` and `<target>/.mcp.json` — the same trust model as the existing `install` and `upgrade` paths.

## Findings

### [LOW] Operator-controlled target path is interpolated into filesystem paths without normalization

- **OWASP**: A04 Insecure Design (low confidence — operator already trusted) | **CWE**: CWE-22 (path traversal)
- **Files**: `src/cli/project-json.js:26`, `src/cli/merge.js:172-174`
- **Evidence**:
  ```js
  // src/cli/project-json.js
  const path = join(target, PROJECT_JSON_REL);
  ...
  await rename(tmp, path);
  ```
- **Impact**: A malicious operator could pass `target = "/some/path/.."` to write `project.json` outside the intended `<target>/.claude/` subtree. This is **not a new attack surface**: the existing `install.freshInstall(templateDir, target)` and `threeWayMerge(templateDir, target, ...)` already construct paths via `join(target, …)` with no normalization, and the trust model is "the operator chose this target." `refreshBaselineVersion` inherits that model unchanged.
- **Recommendation**: No change. If the project decides to harden operator-controlled paths in a future spec, it should be a cross-cutting fix applied to every `join(target, …)` site, not a special case in this module. Out of scope for this spec.

### [LOW] JSON-input prototype-pollution surface in refreshBaselineVersion

- **OWASP**: A08 Software & Data Integrity Failures | **CWE**: CWE-1321 (improper control of object prototype)
- **File**: `src/cli/project-json.js:39-50`
- **Evidence**:
  ```js
  parsed = JSON.parse(text);
  ...
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`refreshBaselineVersion: ${PROJECT_JSON_REL} is not a JSON object`);
  }
  parsed.baseline_version = version;
  ```
- **Impact**: A malicious project.json containing `{"__proto__": {"polluted": true}}` is read via `JSON.parse`. Node's `JSON.parse` makes `__proto__` an own property of the parsed object rather than mutating `Object.prototype`, so this is not exploitable as classical prototype pollution. We then set `parsed.baseline_version` and serialize back — the malicious own property would round-trip into the written file, exactly preserving the user's project.json shape (per AC-007's "preserve other keys" contract). No new attack vector compared to a manual edit of project.json.
- **Recommendation**: No change. If the project later adds a JSON schema validator for project.json (separate from this spec), it should reject unknown top-level keys including `__proto__` and `constructor`. Out of scope.

### [LOW] Atomic-write tmp file pattern reuses crypto.randomUUID without explicit cleanup on error

- **OWASP**: A09 Logging & Monitoring Failures (peripheral) | **CWE**: CWE-459 (incomplete cleanup)
- **File**: `src/cli/project-json.js:51-54`
- **Evidence**:
  ```js
  const tmp = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(tmp, body);
  await rename(tmp, path);
  ```
- **Impact**: If `rename` fails (filesystem race, no permission, cross-filesystem rename which is rare since same directory), the `.tmp` file is left behind. Inherited pattern from `src/cli/reconciliation-marker.js → atomicWriteJson` which has the same shape and no leftover cleanup. randomUUID makes the leftover name globally unique, so subsequent runs do not collide. Worst case: a few KB of leaked tmp files in `.claude/` until the user runs a cleanup. Not a confidentiality or integrity issue.
- **Recommendation**: No change. Matches the established convention in the codebase; if/when the project adds a janitor pass for `.tmp` leftovers, fix both call sites in one place. Out of scope.

## Dependencies

**No new packages.** The diff uses only Node stdlib (`node:fs/promises`, `node:path`, `node:crypto`) and the already-installed `@clack/prompts` (an existing dependency). No `package.json` change. `npm audit` / supply-chain risk: unchanged.

## Out of scope / Noted

- **`readPackageVersion` is now duplicated across three files** (`src/cli/install.js`, `src/cli/tui/upgrade.js`, `bin/cli.js`). All three implementations read the CLI's own `package.json` and fall back to `'0.0.0'` on error. This is a pre-existing duplication that grew incrementally; consolidating into a single Foundation helper is a follow-up refactor, not a security issue.
- **Fast-path message string interpolation**: `prompts.outro("already on baseline X.Y.Z; nothing to do")` and `io.log(…)` interpolate `currentVersion` from the running CLI's `package.json`. That value is controlled by the CLI maintainer (release process), not by any untrusted input. No injection vector.
- **`.mcp.json` byte-comparison short-circuit (AC-004)** reduces filesystem writes but does not change the deep-merge semantics. Existing baseline-refresh behavior (template-named servers are refreshed; user-added servers preserved) is unchanged. The new `wrote: boolean` return is consumed only by `merge.js → applySpecialMerge` to classify the action; no external API change.
- **Manifest schema** gains an additive top-level `baseline_version` field. Read-tolerant: older CLI versions ignore unknown fields per `loadManifest`'s `JSON.parse(text)` semantics.
- **`isVersionAwareNoop` decision logic** uses string equality on the `baseline_version` field. No semver parsing, no regex, no shell exec — minimum attack surface.
- **`obj/template/` build drift** flagged elsewhere in the test suite (`tests/shipped-skill-md-shippability.test.mjs:57`) is unrelated to this spec; resolved transparently before the final test run. Tracking only.

## Verdict

**LOW risk only — no CRITICAL or HIGH findings.** Per the security skill's decision rule, the phase may proceed to `/integrate`.

