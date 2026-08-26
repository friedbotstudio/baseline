# Security reports — session-start-stale-cache

## session-start-stale-cache-2026-08-27.md

# Security Review — session-start-stale-cache — 2026-08-27

## Summary

Overall risk: **LOW**. The change adds a disk cache to a hook that runs on every session in every install, which widens the staleness predicate's input from "git's own stdout" to "whatever is on disk at a known path". That widening is the whole security story here, and it is bounded: writing the cache requires local filesystem access to the repository, and the values it carries reach only a glob matcher. The pre-existing argument-injection gate on `verified-at` is preserved and now sits in one place rather than two copies.

Diff reviewed: 522 insertions, 36 deletions across 7 tracked files plus 4 created files. No new dependencies; `npm audit` reports 0 vulnerabilities.

## Findings

### [LOW] The changed-set gains a second, on-disk source

- **OWASP**: A08 — Software and Data Integrity Failures | **CWE**: CWE-502 (deserialization of untrusted data)
- **File**: `.claude/hooks/lib/memory_changed_set.mjs:32` (`loadMemo`)
- **Evidence**:
  ```js
  const parsed = JSON.parse(readFileSync(cachePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Map();
  if (parsed.head !== head) return new Map();
  if (!parsed.sets || typeof parsed.sets !== 'object' || Array.isArray(parsed.sets)) return new Map();
  return new Map(Object.entries(parsed.sets).filter(([, paths]) => Array.isArray(paths)));
  ```
- **Impact**: Before this change, `changedPaths` could only be git's stdout. It can now be file content. Someone who can write `.claude/state/memory/changed-set-cache.json` can make the staleness predicate see paths that never changed, or hide paths that did — which flips memory entries between stale and fresh. It cannot execute anything: the values are compared against globs and counted, never interpolated into a command, a path, or a template.
- **Precondition**: local write access to the repository's `.claude/state/`. Anyone holding that already has code execution in the tree, so this raises no new privilege.
- **Recommendation**: none required; the existing shape is the mitigation. The four type guards above reject a non-object, a wrong-`head` file, a non-object `sets`, and any non-array value, and every rejection lands on an empty memo rather than a partial one. Keep it that way — a repair path here would be the actual vulnerability.

## Checked and not a finding

Each of these was tested rather than reasoned about.

- **Argument injection through `verified-at` (CWE-88).** The known sink, recorded in `landmines/a-frontmatter-value-in-a-git-argv-is-an-option-injection-sink`. `changedSince` calls `usableStamp` before constructing any argv, and `tests/memory-changed-set.test.mjs → test_when_stamp_is_an_option_then_no_git_argv_is_built` asserts a stamp of `--output=/tmp/...` produces zero spawns. The gate moved from two duplicated call sites into one, which narrows rather than widens it.
- **Cache keys reaching a git argv.** They do not. `changedSince` looks up by a stamp the caller already validated this run; nothing iterates the cache's own keys into a command.
- **Prototype pollution via a crafted cache key.** Measured: a `__proto__` key in `sets` is dropped by the `Array.isArray` filter, and `Object.fromEntries` on write creates an own property rather than touching the prototype. `Object.prototype` was clean after both.
- **ReDoS through a long path from the cache into the glob matcher.** Measured against `.claude/**/*.mjs` at subject lengths 2,005 / 40,005 / 200,005 characters: 0ms each. The glob is compiled from `governs:` frontmatter, not from the cached path, so the attacker-influenced value is the subject and not the pattern.
- **Unbounded git execution.** The `timeout: 5000` on the spawn is preserved, so a hung git cannot stall session start indefinitely.
- **Path traversal via `cachePath`.** The parameter exists for test injection only; the default is a `join` under `rootDir` and no user-supplied value reaches it.
- **Failure caching.** A rejected stamp and a non-zero git exit both return `null` and write no row, so a transient failure cannot harden into a persisted wrong answer.

## Dependencies

None added. `npm audit`: 0 vulnerabilities.

## Out of scope / Noted

- The cache is gitignored and therefore never travels between machines, which keeps the trust boundary local by construction. If a future change ever commits it or syncs it, this finding's precondition disappears and the severity rises accordingly. That is the one thing to re-review if the file's location changes.

