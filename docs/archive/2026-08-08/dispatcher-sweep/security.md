# Security reports — dispatcher-sweep

## dispatcher-sweep-2026-08-08.md

# Security Review — main (dispatcher-sweep) — 2026-08-08

## Summary

The diff adds a CLI front door to nineteen helper call sites, five of which write. Overall risk is **LOW**. Every write sink validates before it constructs a path (`assertSafeSlug`, `assertNoTraversal`, `requireKind`, `quotedArgument`), and every subprocess call passes an argv array rather than a shell string. The four findings below are all absolute-path passthroughs on operator-supplied flags — the exposure they add is bounded by the operator's own filesystem rights, not by a privilege boundary this diff crosses.

## Findings

### [LOW] `--spec-dir` absolute passthrough now steers writes, not only reads

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/workspace/queries.mjs:36-42` (helper), `:277`, `:305`, `:319` (new write callers)
- **Evidence**:
  ```js
  export function corpusDir({ flags, root }) {
    const given = flags['spec-dir'];
    if (!given) return join(root, 'docs/system');
    if (isAbsolute(given)) return given;   // <- no guard on the absolute branch
    assertNoTraversal(given);
    return join(root, given);
  }
  ```
- **Impact**: `corpusDir` is pre-existing and unchanged, but before this diff it fed nine read-only handlers. `delta`, `digest` and `shards` now write through it, so `--spec-dir /any/absolute/path` places corpus writes outside the project. Reaching it requires control of the argv this CLI is invoked with; today every invocation is operator- or SOP-authored, so there is no untrusted source.
- **Recommendation**: Confine the absolute branch to a prefix check against `root`, or drop the absolute branch entirely and require a root-relative `--spec-dir`. The relative branch already rejects traversal, so the absolute branch is the only way out of the tree.

### [LOW] `--mem-dir` absolute passthrough

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/workspace/queries.mjs:269-275`
- **Evidence**:
  ```js
  function memoryDir(ctx) {
    const given = ctx.flags['mem-dir'];
    if (!given) return join(ctx.root, '.claude/memory');
    if (isAbsolute(given)) return given;
    assertNoTraversal(given);
    return join(ctx.root, given);
  }
  ```
- **Impact**: Read-only — the sole consumer is `placement`, which returns a boolean. An arbitrary directory can be probed for a matching entry key, which discloses nothing beyond whether a memory entry there is marked load-bearing.
- **Recommendation**: Same treatment as `corpusDir`, for consistency rather than for the exposure. If the absolute branch stays, the two helpers should share one resolver so a later fix lands on both.

### [LOW] `migrate` rejects `..` segments but accepts an absolute target for an in-place write

- **OWASP**: A08 - Software & Data Integrity Failures | **CWE**: CWE-22
- **File**: `.claude/skills/harness/cli.mjs:22-26`
- **Evidence**:
  ```js
  const path = positional[0];
  if (!path) throw new Error('migrate requires the path to a workflow.json');
  if (path.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe path traversal (REJECT, never normalize): ${JSON.stringify(path)}`);
  }
  ```
- **Impact**: The segment check blocks relative escape but not an absolute target, and `migrateWorkflowJsonInPlace` rewrites the file it is given. The blast radius is narrow: the migrator only rewrites a JSON document carrying `entry_phase`, and throws on anything else.
- **Recommendation**: Reject a non-`root`-relative path, and reuse `assertNoTraversal` from `workspace/tree.mjs` instead of the open-coded segment split — that helper already rejects both `..` and an absolute prefix.

### [LOW] Arbitrary-path reads in the two Pattern B input readers

- **OWASP**: A01 - Broken Access Control | **CWE**: CWE-22
- **File**: `.claude/skills/sprint-plan/validate-manifest.mjs:72`, `.claude/skills/sprint-planner/planner.mjs:65-69`
- **Evidence**:
  ```js
  const path = isAbsolute(given) ? given : join(root, given);
  ```
- **Impact**: Both read a caller-named document and parse it as JSON. `validate-manifest` blocks `..` segments first; `planner` accepts a path, literal JSON, or stdin with no path check. Neither writes. A parse failure exits non-zero without echoing file contents, so an unreadable target discloses only its parse error.
- **Recommendation**: Speculative — filed LOW because no untrusted caller exists. If one appears, confine both to `root`.

## Dependencies

No dependency change. `package.json` and the lockfile are untouched by this diff, so there is no new package to CVE-check.

## Out of scope / Noted

- **What was checked and is clean.** Every write sink validates before path construction: `receiptPath` (`document/receipts.mjs:21`) calls `assertSafeSlug` before `join`; `writeDiagramShard` (`workspace/shards.mjs:105`) calls `assertSafeSlug` on the element id and routes `kind`, `label`, `technology` and `description` through `quotedArgument`, which rejects an embedded `"` that would escape the C4 argument; `stampElement` (`workspace/digest.mjs:33`) calls `assertNoTraversal` on the anchor it read from disk. The new sink guard on `listWorkspaceFiles` (`workspace/store.mjs:43`) closes the one path the CLI opened.
- **No command injection.** All four new `spawnSync` calls pass `git` with an argv array and no `shell: true`; `--root` reaches git as `-C <value>`, which cannot break out of the argument. No `exec`/`execSync` anywhere in the diff.
- **No secrets.** A scan of the added lines for key material, bearer tokens, AWS ids and private-key headers returned nothing.
- **`placement` cannot address landmark keys.** It calls `assertSafeSlug`, which rejects the `<path>:<line>` form the landmark register uses. That is a reachability limit, not a security defect — noted because a caller who needs it will read the rejection as a bug.
- **No security linter is configured** for this project (`lint.cmd` is null), so none was run. Nothing was installed.

